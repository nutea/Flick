//! macOS global keyboard, mouse, and wheel event tap.
//!
//! This deliberately avoids `rdev::listen`: that backend omits auxiliary
//! mouse events and performs keyboard-layout translation from its event-tap
//! thread. Recent macOS releases assert because the input source API must run
//! on the main dispatch queue. Flick only needs normalized physical key tokens,
//! so this implementation never calls the input-method API.

use std::collections::HashSet;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use core_graphics::event::{CGEvent, CGEventTapLocation, CGEventType, EventField};

use crate::input_hook_unix::{debug_enabled, has_subscriber, push_json};

type CFMachPortRef = *const c_void;
type CFRunLoopRef = *mut c_void;
type CFRunLoopSourceRef = *mut c_void;
type CFRunLoopMode = *mut c_void;
type CGEventTapProxy = *mut c_void;
type CGEventMask = u64;

const HEAD_INSERT_EVENT_TAP: u32 = 0;
const LISTEN_ONLY: u32 = 1;
const INPUT_MASK: CGEventMask = (1 << CGEventType::LeftMouseDown as u64)
    | (1 << CGEventType::LeftMouseUp as u64)
    | (1 << CGEventType::RightMouseDown as u64)
    | (1 << CGEventType::RightMouseUp as u64)
    | (1 << CGEventType::OtherMouseDown as u64)
    | (1 << CGEventType::OtherMouseUp as u64)
    | (1 << CGEventType::KeyDown as u64)
    | (1 << CGEventType::KeyUp as u64)
    | (1 << CGEventType::FlagsChanged as u64)
    | (1 << CGEventType::ScrollWheel as u64);

static STARTED: AtomicBool = AtomicBool::new(false);
static PRESSED_MODIFIERS: Mutex<Option<HashSet<i64>>> = Mutex::new(None);

type EventTapCallback = unsafe extern "C" fn(
    proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: CGEvent,
    user_info: *mut c_void,
) -> CGEvent;

#[link(name = "CoreGraphics", kind = "framework")]
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: CGEventTapLocation,
        place: u32,
        options: u32,
        events_of_interest: CGEventMask,
        callback: EventTapCallback,
        user_info: *mut c_void,
    ) -> CFMachPortRef;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    fn CFMachPortCreateRunLoopSource(
        allocator: *const c_void,
        tap: CFMachPortRef,
        order: isize,
    ) -> CFRunLoopSourceRef;
    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CFRunLoopAddSource(run_loop: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFRunLoopMode);
    fn CFRunLoopRun();
    static kCFRunLoopCommonModes: CFRunLoopMode;
}

fn button_name(button_number: i64) -> &'static str {
    match button_number {
        2 => "middle",
        3 => "back",
        4 => "forward",
        _ => "unknown",
    }
}

fn key_name(key_code: i64) -> String {
    match key_code {
        0x00 => "A".into(),
        0x0b => "B".into(),
        0x08 => "C".into(),
        0x02 => "D".into(),
        0x0e => "E".into(),
        0x03 => "F".into(),
        0x05 => "G".into(),
        0x04 => "H".into(),
        0x22 => "I".into(),
        0x26 => "J".into(),
        0x28 => "K".into(),
        0x25 => "L".into(),
        0x2e => "M".into(),
        0x2d => "N".into(),
        0x1f => "O".into(),
        0x23 => "P".into(),
        0x0c => "Q".into(),
        0x0f => "R".into(),
        0x01 => "S".into(),
        0x11 => "T".into(),
        0x20 => "U".into(),
        0x09 => "V".into(),
        0x0d => "W".into(),
        0x07 => "X".into(),
        0x10 => "Y".into(),
        0x06 => "Z".into(),
        0x1d => "0".into(),
        0x12 => "1".into(),
        0x13 => "2".into(),
        0x14 => "3".into(),
        0x15 => "4".into(),
        0x17 => "5".into(),
        0x16 => "6".into(),
        0x1a => "7".into(),
        0x1c => "8".into(),
        0x19 => "9".into(),
        0x24 => "Enter".into(),
        0x30 => "Tab".into(),
        0x31 => "Space".into(),
        0x33 => "Backspace".into(),
        0x35 => "Escape".into(),
        0x75 => "Delete".into(),
        0x73 => "Home".into(),
        0x77 => "End".into(),
        0x74 => "PageUp".into(),
        0x79 => "PageDown".into(),
        0x7b => "Left".into(),
        0x7c => "Right".into(),
        0x7d => "Down".into(),
        0x7e => "Up".into(),
        0x3b => "ControlLeft".into(),
        0x3e => "ControlRight".into(),
        0x38 => "ShiftLeft".into(),
        0x3c => "ShiftRight".into(),
        0x3a => "AltLeft".into(),
        0x3d => "AltRight".into(),
        0x37 => "MetaLeft".into(),
        0x36 => "MetaRight".into(),
        0x7a => "F1".into(),
        0x78 => "F2".into(),
        0x63 => "F3".into(),
        0x76 => "F4".into(),
        0x60 => "F5".into(),
        0x61 => "F6".into(),
        0x62 => "F7".into(),
        0x64 => "F8".into(),
        0x65 => "F9".into(),
        0x6d => "F10".into(),
        0x67 => "F11".into(),
        0x6f => "F12".into(),
        value => format!("KeyCode:{value}"),
    }
}

fn modifier_state(key_code: i64) -> &'static str {
    let Ok(mut guard) = PRESSED_MODIFIERS.lock() else {
        return "down";
    };
    let pressed = guard.get_or_insert_with(HashSet::new);
    if pressed.remove(&key_code) {
        "up"
    } else {
        pressed.insert(key_code);
        "down"
    }
}

unsafe extern "C" fn callback(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: CGEvent,
    _user_info: *mut c_void,
) -> CGEvent {
    match event_type {
        CGEventType::LeftMouseDown | CGEventType::LeftMouseUp => {
            let state = if matches!(event_type, CGEventType::LeftMouseDown) {
                "down"
            } else {
                "up"
            };
            push_json(format!(
                r#"{{"kind":"mouse","state":"{state}","button":"left"}}"#
            ));
        }
        CGEventType::RightMouseDown | CGEventType::RightMouseUp => {
            let state = if matches!(event_type, CGEventType::RightMouseDown) {
                "down"
            } else {
                "up"
            };
            push_json(format!(
                r#"{{"kind":"mouse","state":"{state}","button":"right"}}"#
            ));
        }
        CGEventType::OtherMouseDown | CGEventType::OtherMouseUp => {
            let state = if matches!(event_type, CGEventType::OtherMouseDown) {
                "down"
            } else {
                "up"
            };
            let button =
                button_name(event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER));
            push_json(format!(
                r#"{{"kind":"mouse","state":"{state}","button":"{button}"}}"#
            ));
        }
        CGEventType::KeyDown | CGEventType::KeyUp => {
            let state = if matches!(event_type, CGEventType::KeyDown) {
                "down"
            } else {
                "up"
            };
            let key = key_name(event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE));
            push_json(format!(
                r#"{{"kind":"key","state":"{state}","key":"{key}"}}"#
            ));
        }
        CGEventType::FlagsChanged => {
            let code = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
            let state = modifier_state(code);
            let key = key_name(code);
            push_json(format!(
                r#"{{"kind":"key","state":"{state}","key":"{key}"}}"#
            ));
        }
        CGEventType::ScrollWheel => {
            let delta_y =
                event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_1);
            let delta_x =
                event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_2);
            push_json(format!(
                r#"{{"kind":"wheel","deltaX":{delta_x},"deltaY":{delta_y}}}"#
            ));
        }
        _ => {}
    }
    event
}

fn listen() -> Result<(), ()> {
    unsafe {
        let tap = CGEventTapCreate(
            CGEventTapLocation::HID,
            HEAD_INSERT_EVENT_TAP,
            LISTEN_ONLY,
            INPUT_MASK,
            callback,
            std::ptr::null_mut(),
        );
        if tap.is_null() {
            return Err(());
        }
        let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
        if source.is_null() {
            return Err(());
        }
        let run_loop = CFRunLoopGetCurrent();
        CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);
        if debug_enabled() {
            eprintln!("[flick-native] macOS input hook started");
        }
        CFRunLoopRun();
    }
    Ok(())
}

pub fn start() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(|| {
        let mut attempts = 0u32;
        while has_subscriber() {
            if listen().is_ok() {
                break;
            }
            attempts += 1;
            if debug_enabled() && (attempts == 1 || attempts % 10 == 0) {
                eprintln!("[flick-native] macOS input hook unavailable; retry attempt {attempts}");
            }
            thread::sleep(Duration::from_secs(1));
        }
        STARTED.store(false, Ordering::SeqCst);
    });
}

#[cfg(test)]
mod tests {
    use super::{button_name, key_name};

    #[test]
    fn maps_macos_auxiliary_button_numbers() {
        assert_eq!(button_name(2), "middle");
        assert_eq!(button_name(3), "back");
        assert_eq!(button_name(4), "forward");
        assert_eq!(button_name(8), "unknown");
    }

    #[test]
    fn maps_macos_modifier_and_copy_key_codes() {
        assert_eq!(key_name(0x37), "MetaLeft");
        assert_eq!(key_name(0x08), "C");
        assert_eq!(key_name(0x7e), "Up");
    }
}
