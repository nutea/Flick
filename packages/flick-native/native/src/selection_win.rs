//! Read the focused control's text selection through Windows UI Automation.
//!
//! This path does not synthesize input and never touches the clipboard. Some
//! custom-rendered or elevated controls do not expose TextPattern; callers are
//! expected to fall back to a single copy shortcut in that case.

use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
};

const MAX_SELECTED_TEXT_CHARS: i32 = 1_048_576;

struct ComGuard;

impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

pub fn get_selected_text() -> String {
    unsafe {
        if CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_err() {
            return String::new();
        }
        let _com = ComGuard;

        let automation: IUIAutomation =
            match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                Ok(value) => value,
                Err(_) => return String::new(),
            };
        let focused = match automation.GetFocusedElement() {
            Ok(value) => value,
            Err(_) => return String::new(),
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
        selected.join("\n")
    }
}
