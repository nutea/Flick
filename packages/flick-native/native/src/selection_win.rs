//! Read the focused control's text selection through Windows UI Automation.
//!
//! This path does not synthesize input and never touches the clipboard. Some
//! custom-rendered or elevated controls do not expose TextPattern; callers are
//! expected to fall back to a single copy shortcut in that case.

use std::ffi::c_void;
use std::mem::size_of;

use windows::core::HRESULT;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
    GA_ROOT,
};

const MAX_SELECTED_TEXT_CHARS: i32 = 262_144;
const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

struct ComGuard(bool);

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

fn hwnd_from_usize(value: usize) -> HWND {
    HWND(value as *mut c_void)
}

/// Captures the native focused HWND belonging to the trigger-time foreground
/// thread. UI Automation can then start from this stable HWND even if Flick
/// gains focus before the worker executes.
pub fn get_focused_window_handle(foreground_root: usize) -> usize {
    if foreground_root == 0 {
        return 0;
    }
    unsafe {
        let thread_id = GetWindowThreadProcessId(hwnd_from_usize(foreground_root), None);
        if thread_id == 0 {
            return 0;
        }
        let mut info = GUITHREADINFO {
            cbSize: size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        if GetGUIThreadInfo(thread_id, &mut info).is_err() || info.hwndFocus.is_invalid() {
            return 0;
        }
        info.hwndFocus.0 as usize
    }
}

pub fn get_selected_text() -> String {
    get_selected_text_for_context(0, 0)
}

pub fn get_selected_text_for_context(
    foreground_root: usize,
    focused_handle: usize,
) -> String {
    unsafe {
        let com_result = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if com_result.is_err() && com_result != RPC_E_CHANGED_MODE {
            return String::new();
        }
        let _com = ComGuard(com_result.is_ok());

        let automation: IUIAutomation =
            match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                Ok(value) => value,
                Err(_) => return String::new(),
            };
        let current_foreground = GetForegroundWindow();
        let current_root = if current_foreground.is_invalid() {
            HWND::default()
        } else {
            GetAncestor(current_foreground, GA_ROOT)
        };
        // Chromium and many custom editors expose TextPattern only on the
        // focused UIA descendant, not on their renderer HWND. Use that richer
        // path while the original source window is still foreground. If focus
        // moved during worker scheduling, use the captured HWND rather than
        // accidentally reading a later application.
        let can_use_current_focus =
            foreground_root == 0 || current_root.0 as usize == foreground_root;
        let focused = if can_use_current_focus {
            match automation.GetFocusedElement() {
                Ok(value) => value,
                Err(_) if focused_handle != 0 => {
                    match automation.ElementFromHandle(hwnd_from_usize(focused_handle)) {
                        Ok(value) => value,
                        Err(_) => return String::new(),
                    }
                }
                Err(_) => return String::new(),
            }
        } else if focused_handle != 0 {
            match automation.ElementFromHandle(hwnd_from_usize(focused_handle)) {
                Ok(value) => value,
                Err(_) => return String::new(),
            }
        } else {
            return String::new();
        };
        let text_pattern: IUIAutomationTextPattern =
            match focused.GetCurrentPatternAs(UIA_TextPatternId) {
                Ok(value) => value,
                Err(_) => return String::new(),
            };
        let ranges = match text_pattern.GetSelection() {
            Ok(value) => value,
            Err(_) => return String::new(),
        };
        let count = ranges.Length().unwrap_or(0);
        if count <= 0 {
            return String::new();
        }

        let mut selected = Vec::new();
        for index in 0..count {
            let Ok(range) = ranges.GetElement(index) else {
                continue;
            };
            let Ok(value) = range.GetText(MAX_SELECTED_TEXT_CHARS) else {
                continue;
            };
            let text = value.to_string();
            if !text.is_empty() {
                selected.push(text);
            }
        }
        selected
            .join("\n")
            .chars()
            .take(MAX_SELECTED_TEXT_CHARS as usize)
            .collect()
    }
}
