//! Global input subscription for macOS and Linux, backed by the platform event tap/X11 listener.

#[cfg(target_os = "linux")]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
#[cfg(target_os = "linux")]
use std::thread;
#[cfg(target_os = "linux")]
use std::time::Duration;

use napi::bindgen_prelude::Env;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi::{Error, JsFunction, Result};
use rdev::{Button, Event, EventType, Key};

static TSFN: Mutex<Option<ThreadsafeFunction<String, ErrorStrategy::Fatal>>> = Mutex::new(None);
#[cfg(target_os = "linux")]
static LISTENER_STARTED: AtomicBool = AtomicBool::new(false);

pub(crate) fn debug_enabled() -> bool {
    std::env::var_os("FLICK_NATIVE_DEBUG").is_some()
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
}

#[cfg(target_os = "macos")]
fn request_input_monitoring_access() {
    unsafe {
        let trusted = CGPreflightListenEventAccess();
        if debug_enabled() {
            eprintln!("[flick-native] macOS input monitoring trusted: {trusted}");
        }
        if !trusted {
            // macOS displays the system Input Monitoring consent prompt. The
            // result remains false until the user grants access, so the hook
            // thread below keeps retrying while a JS subscriber is active.
            let granted = CGRequestListenEventAccess();
            if debug_enabled() {
                eprintln!("[flick-native] macOS input monitoring request result: {granted}");
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn request_input_monitoring_access() {}

pub(crate) fn has_subscriber() -> bool {
    TSFN.lock().map(|guard| guard.is_some()).unwrap_or(false)
}

fn key_name(key: Key) -> String {
    match key {
        Key::ControlLeft => "ControlLeft".into(),
        Key::ControlRight => "ControlRight".into(),
        Key::ShiftLeft => "ShiftLeft".into(),
        Key::ShiftRight => "ShiftRight".into(),
        Key::Alt => "AltLeft".into(),
        Key::AltGr => "AltRight".into(),
        Key::MetaLeft => "MetaLeft".into(),
        Key::MetaRight => "MetaRight".into(),
        Key::Backspace => "Backspace".into(),
        Key::Tab => "Tab".into(),
        Key::Return => "Enter".into(),
        Key::KpReturn => "NumpadEnter".into(),
        Key::Escape => "Escape".into(),
        Key::Space => "Space".into(),
        Key::Delete => "Delete".into(),
        Key::Home => "Home".into(),
        Key::End => "End".into(),
        Key::PageUp => "PageUp".into(),
        Key::PageDown => "PageDown".into(),
        Key::LeftArrow => "Left".into(),
        Key::RightArrow => "Right".into(),
        Key::UpArrow => "Up".into(),
        Key::DownArrow => "Down".into(),
        Key::Insert => "Insert".into(),
        Key::F1 => "F1".into(),
        Key::F2 => "F2".into(),
        Key::F3 => "F3".into(),
        Key::F4 => "F4".into(),
        Key::F5 => "F5".into(),
        Key::F6 => "F6".into(),
        Key::F7 => "F7".into(),
        Key::F8 => "F8".into(),
        Key::F9 => "F9".into(),
        Key::F10 => "F10".into(),
        Key::F11 => "F11".into(),
        Key::F12 => "F12".into(),
        Key::Num0 => "0".into(),
        Key::Num1 => "1".into(),
        Key::Num2 => "2".into(),
        Key::Num3 => "3".into(),
        Key::Num4 => "4".into(),
        Key::Num5 => "5".into(),
        Key::Num6 => "6".into(),
        Key::Num7 => "7".into(),
        Key::Num8 => "8".into(),
        Key::Num9 => "9".into(),
        Key::KeyA => "A".into(),
        Key::KeyB => "B".into(),
        Key::KeyC => "C".into(),
        Key::KeyD => "D".into(),
        Key::KeyE => "E".into(),
        Key::KeyF => "F".into(),
        Key::KeyG => "G".into(),
        Key::KeyH => "H".into(),
        Key::KeyI => "I".into(),
        Key::KeyJ => "J".into(),
        Key::KeyK => "K".into(),
        Key::KeyL => "L".into(),
        Key::KeyM => "M".into(),
        Key::KeyN => "N".into(),
        Key::KeyO => "O".into(),
        Key::KeyP => "P".into(),
        Key::KeyQ => "Q".into(),
        Key::KeyR => "R".into(),
        Key::KeyS => "S".into(),
        Key::KeyT => "T".into(),
        Key::KeyU => "U".into(),
        Key::KeyV => "V".into(),
        Key::KeyW => "W".into(),
        Key::KeyX => "X".into(),
        Key::KeyY => "Y".into(),
        Key::KeyZ => "Z".into(),
        Key::Unknown(code) => format!("KeyCode:{code}"),
        other => format!("{other:?}"),
    }
}

fn escape_json(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\u{08}' => escaped.push_str("\\b"),
            '\u{0c}' => escaped.push_str("\\f"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            value if value <= '\u{1f}' => {
                use std::fmt::Write;
                let _ = write!(escaped, "\\u{:04x}", value as u32);
            }
            value => escaped.push(value),
        }
    }
    escaped
}

fn button_name(button: Button) -> &'static str {
    match button {
        Button::Left => "left",
        Button::Right => "right",
        Button::Middle => "middle",
        Button::Unknown(_) => "unknown",
    }
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn event_json(event: Event) -> Option<String> {
    match event.event_type {
        EventType::KeyPress(key) | EventType::KeyRelease(key) => {
            let state = if matches!(event.event_type, EventType::KeyPress(_)) {
                "down"
            } else {
                "up"
            };
            let key = key_name(key);
            let text = event.name.filter(|value| !value.is_empty());
            Some(match text {
                Some(value) => format!(
                    r#"{{"kind":"key","state":"{state}","key":"{}","text":"{}"}}"#,
                    escape_json(&key),
                    escape_json(&value)
                ),
                None => format!(
                    r#"{{"kind":"key","state":"{state}","key":"{}"}}"#,
                    escape_json(&key)
                ),
            })
        }
        EventType::ButtonPress(button) | EventType::ButtonRelease(button) => {
            let state = if matches!(event.event_type, EventType::ButtonPress(_)) {
                "down"
            } else {
                "up"
            };
            Some(format!(
                r#"{{"kind":"mouse","state":"{state}","button":"{}"}}"#,
                button_name(button)
            ))
        }
        EventType::Wheel { delta_x, delta_y } => Some(format!(
            r#"{{"kind":"wheel","deltaX":{delta_x},"deltaY":{delta_y}}}"#
        )),
        EventType::MouseMove { .. } => None,
    }
}

#[cfg(target_os = "linux")]
fn forward(event: Event) {
    let Some(payload) = event_json(event) else {
        return;
    };
    push_json(payload);
}

pub(crate) fn push_json(payload: String) {
    if debug_enabled() && payload.contains(r#""kind":"mouse""#) {
        eprintln!("[flick-native] input event: {payload}");
    }
    let Ok(guard) = TSFN.lock() else {
        return;
    };
    let Some(tsfn) = guard.as_ref() else {
        return;
    };
    let _ = tsfn.call(payload, ThreadsafeFunctionCallMode::NonBlocking);
}

pub fn start(env: &Env, callback: JsFunction) -> Result<JsFunction> {
    let tsfn = callback.create_threadsafe_function(0, |ctx: ThreadSafeCallContext<String>| {
        ctx.env
            .create_string_from_std(ctx.value)
            .map(|value| vec![value.into_unknown()])
    })?;
    *TSFN
        .lock()
        .map_err(|_| Error::from_reason("input hook state is poisoned"))? = Some(tsfn);

    request_input_monitoring_access();

    #[cfg(target_os = "linux")]
    if !LISTENER_STARTED.swap(true, Ordering::SeqCst) {
        thread::spawn(|| {
            let mut attempts = 0u32;
            while has_subscriber() {
                if rdev::listen(forward).is_ok() {
                    break;
                }
                attempts += 1;
                if debug_enabled() && (attempts == 1 || attempts % 10 == 0) {
                    eprintln!(
                        "[flick-native] global input hook unavailable; retry attempt {attempts}"
                    );
                }
                thread::sleep(Duration::from_secs(1));
            }
            LISTENER_STARTED.store(false, Ordering::SeqCst);
        });
    }

    #[cfg(target_os = "macos")]
    crate::input_hook_macos::start();

    env.create_function_from_closure("stopInputHook", |_| {
        *TSFN
            .lock()
            .map_err(|_| Error::from_reason("input hook state is poisoned"))? = None;
        Ok::<(), Error>(())
    })
}

#[cfg(test)]
mod tests {
    use super::event_json;
    use rdev::{Button, Event, EventType, Key};
    use std::time::SystemTime;

    fn event(event_type: EventType, name: Option<&str>) -> Event {
        Event {
            time: SystemTime::now(),
            name: name.map(str::to_string),
            event_type,
        }
    }

    #[test]
    fn normalizes_modifier_and_mouse_events() {
        assert_eq!(
            event_json(event(EventType::KeyPress(Key::MetaLeft), None)).unwrap(),
            r#"{"kind":"key","state":"down","key":"MetaLeft"}"#
        );
        assert_eq!(
            event_json(event(EventType::ButtonRelease(Button::Middle), None)).unwrap(),
            r#"{"kind":"mouse","state":"up","button":"middle"}"#
        );
    }

    #[test]
    fn escapes_layout_text_in_json() {
        assert_eq!(
            event_json(event(EventType::KeyPress(Key::KeyA), Some("\"\n"))).unwrap(),
            r#"{"kind":"key","state":"down","key":"A","text":"\"\n"}"#
        );
        assert_eq!(
            event_json(event(EventType::KeyPress(Key::Tab), Some("\t"))).unwrap(),
            r#"{"kind":"key","state":"down","key":"Tab","text":"\t"}"#
        );
    }

    #[test]
    fn suppresses_high_frequency_mouse_move_events() {
        assert!(event_json(event(EventType::MouseMove { x: 1.0, y: 2.0 }, None)).is_none());
    }
}
