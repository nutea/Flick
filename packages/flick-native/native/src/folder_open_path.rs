//! Resolve the foreground File Explorer folder path via Shell COM (replaces cdwhere.exe).

use windows::core::{Interface, HRESULT, BSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, IDispatch, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{IShellWindows, IWebBrowser2, ShellWindows};
use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOT};

const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

fn file_url_to_path(url: &str) -> Option<String> {
    let u = url.trim();
    if u.is_empty() {
        return None;
    }

    if u.len() >= 8 && u[..8].eq_ignore_ascii_case("file:///") {
        let rest = &u[8..];
        return Some(rest.replace('/', "\\"));
    }

    if u.len() >= 7 && u[..7].eq_ignore_ascii_case("file://") {
        let rest = u.get(7..)?;
        let rest = rest.trim_start_matches('/');
        return Some(format!("\\\\{}", rest.replace('/', "\\")));
    }

    None
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

        let shell_windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL).ok()?;
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
