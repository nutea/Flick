//! Resolve the foreground File Explorer folder path via Shell COM (replaces cdwhere.exe).

use windows::core::{Interface, BSTR, HRESULT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IDispatch, IServiceProvider,
    CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::SystemServices::{SFGAO_FILESYSTEM, SFGAO_FOLDER};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{
    IFolderView2, IShellBrowser, IShellFolderViewDual, IShellItemArray, IShellWindows,
    IWebBrowser2, SID_STopLevelBrowser, ShellWindows, SIGDN_FILESYSPATH,
};
use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOT};

const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);
pub const MAX_SELECTED_ITEMS: u32 = 100;

#[derive(Debug)]
pub struct SelectedFileEntry {
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Default)]
pub struct ExplorerSelection {
    pub files: Vec<SelectedFileEntry>,
    pub truncated: bool,
}

#[derive(Debug, Default)]
pub struct ExplorerSnapshot {
    pub selection: ExplorerSelection,
    pub folder: String,
}

fn decode_url_path(value: &str) -> String {
    fn hex_value(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }

    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                decoded.push((high << 4) | low);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn file_url_to_path(url: &str) -> Option<String> {
    let u = url.trim();
    if u.is_empty() {
        return None;
    }

    if u.len() >= 8 && u[..8].eq_ignore_ascii_case("file:///") {
        let rest = &u[8..];
        return Some(decode_url_path(rest).replace('/', "\\"));
    }

    if u.len() >= 7 && u[..7].eq_ignore_ascii_case("file://") {
        let rest = u.get(7..)?;
        let rest = rest.trim_start_matches('/');
        return Some(format!("\\\\{}", decode_url_path(rest).replace('/', "\\")));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::file_url_to_path;

    #[test]
    fn decodes_percent_encoded_windows_folder_paths() {
        assert_eq!(
            file_url_to_path("file:///D:/WPS%20Office/12.1.0.26895"),
            Some("D:\\WPS Office\\12.1.0.26895".to_string())
        );
    }

    #[test]
    fn decodes_utf8_folder_names() {
        assert_eq!(
            file_url_to_path("file:///D:/%E6%B5%8B%E8%AF%95"),
            Some("D:\\测试".to_string())
        );
    }
}

fn bstr_to_string(url: BSTR) -> String {
    let s = url.to_string();
    s.trim().trim_end_matches('\0').to_string()
}

struct ComGuard {
    should_uninitialize: bool,
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.should_uninitialize {
            unsafe { CoUninitialize() };
        }
    }
}

unsafe fn com_init() -> Option<ComGuard> {
    let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    if hr.is_ok() {
        return Some(ComGuard {
            should_uninitialize: true,
        });
    }
    // A caller-owned apartment with a different model is still initialized and
    // may use COM, but this function must not uninitialize an apartment it did
    // not initialize.
    (hr == RPC_E_CHANGED_MODE).then_some(ComGuard {
        should_uninitialize: false,
    })
}

/// Captures the foreground root synchronously, before an async N-API task can
/// be delayed or another Flick window can become active.
pub fn get_foreground_root_handle() -> usize {
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.is_invalid() {
            return 0;
        }
        let root = GetAncestor(foreground, GA_ROOT);
        if root.is_invalid() {
            foreground.0 as usize
        } else {
            root.0 as usize
        }
    }
}

unsafe fn shell_item_array_paths(
    items: &IShellItemArray,
) -> windows::core::Result<ExplorerSelection> {
    let item_count = items.GetCount()?;
    let bounded_count = item_count.min(MAX_SELECTED_ITEMS);
    let mut files = Vec::with_capacity(bounded_count as usize);
    for item_index in 0..bounded_count {
        let item = match items.GetItemAt(item_index) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let raw_path = match item.GetDisplayName(SIGDN_FILESYSPATH) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let path = raw_path.to_string().unwrap_or_default();
        CoTaskMemFree(Some(raw_path.0.cast()));
        if !path.is_empty() {
            let attributes = item
                .GetAttributes(SFGAO_FILESYSTEM | SFGAO_FOLDER)
                .unwrap_or_default();
            if attributes.0 & SFGAO_FILESYSTEM.0 == 0 {
                continue;
            }
            files.push(SelectedFileEntry {
                path,
                is_directory: attributes.0 & SFGAO_FOLDER.0 != 0,
            });
        }
    }
    Ok(ExplorerSelection {
        files,
        truncated: item_count > bounded_count,
    })
}

/// Reads the actual native folder view rather than the legacy scripting
/// collection. This path has been available since Windows Vista and avoids the
/// stale/single-item SelectedItems collection observed in Windows 10 Explorer.
unsafe fn get_native_view_selected_paths(
    browser: &IWebBrowser2,
) -> windows::core::Result<ExplorerSelection> {
    let service_provider: IServiceProvider = browser.cast()?;
    let shell_browser: IShellBrowser = service_provider.QueryService(&SID_STopLevelBrowser)?;
    let shell_view = shell_browser.QueryActiveShellView()?;
    let folder_view: IFolderView2 = shell_view.cast()?;
    let selection = folder_view.GetSelection(false)?;
    shell_item_array_paths(&selection)
}

unsafe fn get_legacy_view_selected_paths(browser: &IWebBrowser2) -> ExplorerSelection {
    let document = match browser.Document() {
        Ok(value) => value,
        Err(_) => return ExplorerSelection::default(),
    };
    let view: IShellFolderViewDual = match document.cast() {
        Ok(value) => value,
        Err(_) => return ExplorerSelection::default(),
    };
    let items = match view.SelectedItems() {
        Ok(value) => value,
        Err(_) => return ExplorerSelection::default(),
    };
    let item_count = items.Count().unwrap_or(0);
    let bounded_count = item_count.min(MAX_SELECTED_ITEMS as i32);
    let mut files = Vec::with_capacity(bounded_count.max(0) as usize);
    for item_index in 0..bounded_count {
        let Ok(item) = items.Item(&VARIANT::from(item_index)) else {
            continue;
        };
        let Ok(path) = item.Path() else {
            continue;
        };
        let value = bstr_to_string(path);
        if !value.is_empty() && !value.starts_with("::") {
            let is_directory = item
                .IsFolder()
                .map(|is_folder| is_folder.as_bool())
                .unwrap_or(false);
            files.push(SelectedFileEntry {
                path: value,
                is_directory,
            });
        }
    }
    ExplorerSelection {
        files,
        truncated: item_count > bounded_count,
    }
}

/// Returns the folder path shown in the foreground Explorer window, or the last `file:` folder
/// among open Explorer windows if the foreground window is not Explorer.
pub fn get_folder_open_path() -> Option<String> {
    unsafe {
        let _com = com_init()?;

        let shell_windows: IShellWindows =
            CoCreateInstance(&ShellWindows, None, CLSCTX_ALL).ok()?;
        let count = shell_windows.Count().ok()?;

        let fg = GetForegroundWindow();
        let root = if fg.is_invalid() {
            None
        } else {
            let r = GetAncestor(fg, GA_ROOT);
            if r.is_invalid() {
                None
            } else {
                Some(r)
            }
        };

        let mut fallback: Option<String> = None;

        for i in 0..count {
            let dispatch: IDispatch = match shell_windows.Item(&VARIANT::from(i)) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let browser: IWebBrowser2 = match dispatch.cast() {
                Ok(b) => b,
                Err(_) => continue,
            };

            let hwnd_raw = match browser.HWND() {
                Ok(h) => h.0 as usize,
                Err(_) => continue,
            };

            let url = match browser.LocationURL() {
                Ok(u) => u,
                Err(_) => continue,
            };

            let url_str = bstr_to_string(url);
            let Some(path) = file_url_to_path(&url_str) else {
                continue;
            };

            if let Some(r) = root {
                if hwnd_raw == r.0 as usize || hwnd_raw == fg.0 as usize {
                    return Some(path);
                }
            }

            fallback = Some(path);
        }

        fallback
    }
}

/// Returns the folder path only when the foreground root window is an actual
/// File Explorer window. The desktop shell is intentionally not treated as a
/// folder and no other open Explorer window is used as a fallback.
pub fn get_foreground_folder_path() -> Option<String> {
    get_foreground_folder_path_for_root(get_foreground_root_handle())
}

/// Resolves the Explorer folder for the root captured at trigger time.
pub fn get_foreground_folder_path_for_root(foreground_root: usize) -> Option<String> {
    unsafe {
        let _com = com_init()?;

        if foreground_root == 0 {
            return None;
        }
        let shell_windows: IShellWindows =
            CoCreateInstance(&ShellWindows, None, CLSCTX_ALL).ok()?;
        let count = shell_windows.Count().ok()?;

        for index in 0..count {
            let dispatch: IDispatch = match shell_windows.Item(&VARIANT::from(index)) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let browser: IWebBrowser2 = match dispatch.cast() {
                Ok(value) => value,
                Err(_) => continue,
            };
            let hwnd = match browser.HWND() {
                Ok(value) => value.0 as usize,
                Err(_) => continue,
            };
            if hwnd != foreground_root {
                continue;
            }
            let url = match browser.LocationURL() {
                Ok(value) => value,
                Err(_) => continue,
            };
            return file_url_to_path(&bstr_to_string(url));
        }

        None
    }
}

/// Returns selected filesystem items from the Explorer window that was in the
/// foreground when the request was issued. Passing the captured root avoids a
/// race with async worker scheduling and panel activation.
pub fn get_explorer_selected_paths_for_root(foreground_root: usize) -> Vec<String> {
    get_explorer_selection_for_root(foreground_root)
        .files
        .into_iter()
        .map(|file| file.path)
        .collect()
}

pub fn get_explorer_selection_for_root(foreground_root: usize) -> ExplorerSelection {
    unsafe {
        let Some(_com) = com_init() else {
            return ExplorerSelection::default();
        };

        if foreground_root == 0 {
            return ExplorerSelection::default();
        }

        let shell_windows: IShellWindows = match CoCreateInstance(&ShellWindows, None, CLSCTX_ALL) {
            Ok(value) => value,
            Err(_) => return ExplorerSelection::default(),
        };
        let count = match shell_windows.Count() {
            Ok(value) => value,
            Err(_) => return ExplorerSelection::default(),
        };
        for index in 0..count {
            let dispatch: IDispatch = match shell_windows.Item(&VARIANT::from(index)) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let browser: IWebBrowser2 = match dispatch.cast() {
                Ok(value) => value,
                Err(_) => continue,
            };
            let hwnd = match browser.HWND() {
                Ok(value) => value.0 as usize,
                Err(_) => continue,
            };
            if hwnd != foreground_root {
                continue;
            }

            match get_native_view_selected_paths(&browser) {
                Ok(selection) if !selection.files.is_empty() => return selection,
                _ => return get_legacy_view_selected_paths(&browser),
            }
        }

        ExplorerSelection::default()
    }
}

/// Reads the foreground Explorer view once and derives both its native
/// selection and current folder from the same IWebBrowser2 instance. This is
/// the hot path used by the Super Panel snapshot.
pub fn get_explorer_snapshot_for_root(foreground_root: usize) -> ExplorerSnapshot {
    unsafe {
        let Some(_com) = com_init() else {
            return ExplorerSnapshot::default();
        };
        if foreground_root == 0 {
            return ExplorerSnapshot::default();
        }

        let shell_windows: IShellWindows = match CoCreateInstance(&ShellWindows, None, CLSCTX_ALL) {
            Ok(value) => value,
            Err(_) => return ExplorerSnapshot::default(),
        };
        let count = match shell_windows.Count() {
            Ok(value) => value,
            Err(_) => return ExplorerSnapshot::default(),
        };
        for index in 0..count {
            let dispatch: IDispatch = match shell_windows.Item(&VARIANT::from(index)) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let browser: IWebBrowser2 = match dispatch.cast() {
                Ok(value) => value,
                Err(_) => continue,
            };
            let hwnd = match browser.HWND() {
                Ok(value) => value.0 as usize,
                Err(_) => continue,
            };
            if hwnd != foreground_root {
                continue;
            }

            let folder = browser
                .LocationURL()
                .ok()
                .and_then(|url| file_url_to_path(&bstr_to_string(url)))
                .unwrap_or_default();
            let selection = match get_native_view_selected_paths(&browser) {
                Ok(selection) if !selection.files.is_empty() => selection,
                _ => get_legacy_view_selected_paths(&browser),
            };
            return ExplorerSnapshot { selection, folder };
        }

        ExplorerSnapshot::default()
    }
}
