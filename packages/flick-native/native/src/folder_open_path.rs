//! Resolve the foreground File Explorer folder path via Shell COM (replaces cdwhere.exe).

use windows::core::{Interface, BSTR, HRESULT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, IDispatch, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{IShellFolderViewDual, IShellWindows, IWebBrowser2, ShellWindows};
use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOT};

const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

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

unsafe fn com_init() {
    let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    if hr.is_err() && hr != RPC_E_CHANGED_MODE {
        let _ = hr;
    }
}

/// Returns the folder path shown in the foreground Explorer window, or the last `file:` folder
/// among open Explorer windows if the foreground window is not Explorer.
pub fn get_folder_open_path() -> Option<String> {
    unsafe {
        com_init();

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
    unsafe {
        com_init();

        let foreground = GetForegroundWindow();
        if foreground.is_invalid() {
            return None;
        }
        let root = GetAncestor(foreground, GA_ROOT);
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
            if hwnd != root.0 as usize && hwnd != foreground.0 as usize {
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

/// Returns filesystem items selected in the foreground File Explorer window.
/// Unlike a simulated copy, querying Shell automation does not publish a new
/// clipboard data object.
pub fn get_explorer_selected_paths() -> Vec<String> {
    unsafe {
        com_init();

        let shell_windows: IShellWindows = match CoCreateInstance(&ShellWindows, None, CLSCTX_ALL) {
            Ok(value) => value,
            Err(_) => return Vec::new(),
        };
        let count = match shell_windows.Count() {
            Ok(value) => value,
            Err(_) => return Vec::new(),
        };
        let foreground = GetForegroundWindow();
        if foreground.is_invalid() {
            return Vec::new();
        }
        let root = GetAncestor(foreground, GA_ROOT);

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
            if hwnd != root.0 as usize && hwnd != foreground.0 as usize {
                continue;
            }

            let document = match browser.Document() {
                Ok(value) => value,
                Err(_) => return Vec::new(),
            };
            let view: IShellFolderViewDual = match document.cast() {
                Ok(value) => value,
                Err(_) => return Vec::new(),
            };
            let items = match view.SelectedItems() {
                Ok(value) => value,
                Err(_) => return Vec::new(),
            };
            let item_count = items.Count().unwrap_or(0);
            let mut paths = Vec::new();
            for item_index in 0..item_count {
                let Ok(item) = items.Item(&VARIANT::from(item_index)) else {
                    continue;
                };
                let Ok(path) = item.Path() else {
                    continue;
                };
                let value = bstr_to_string(path);
                if !value.is_empty() && !value.starts_with("::") {
                    paths.push(value);
                }
            }
            return paths;
        }

        Vec::new()
    }
}
