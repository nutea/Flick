//! Cross-platform synthetic keyboard chords for macOS and Linux.

use rdev::{simulate, EventType, Key};
use std::thread;
use std::time::Duration;

fn modifier_key(name: &str) -> Result<Key, String> {
    match name {
        "control" => Ok(Key::ControlLeft),
        "alt" => Ok(Key::Alt),
        "shift" => Ok(Key::ShiftLeft),
        "super" => Ok(Key::MetaLeft),
        _ => Err(format!("unknown modifier: {name}")),
    }
}

fn key_from_token(key: &str) -> Result<Key, String> {
    let normalized = key.trim().to_ascii_lowercase();
    let parsed = match normalized.as_str() {
        "a" => Key::KeyA,
        "b" => Key::KeyB,
        "c" => Key::KeyC,
        "d" => Key::KeyD,
        "e" => Key::KeyE,
        "f" => Key::KeyF,
        "g" => Key::KeyG,
        "h" => Key::KeyH,
        "i" => Key::KeyI,
        "j" => Key::KeyJ,
        "k" => Key::KeyK,
        "l" => Key::KeyL,
        "m" => Key::KeyM,
        "n" => Key::KeyN,
        "o" => Key::KeyO,
        "p" => Key::KeyP,
        "q" => Key::KeyQ,
        "r" => Key::KeyR,
        "s" => Key::KeyS,
        "t" => Key::KeyT,
        "u" => Key::KeyU,
        "v" => Key::KeyV,
        "w" => Key::KeyW,
        "x" => Key::KeyX,
        "y" => Key::KeyY,
        "z" => Key::KeyZ,
        "0" => Key::Num0,
        "1" => Key::Num1,
        "2" => Key::Num2,
        "3" => Key::Num3,
        "4" => Key::Num4,
        "5" => Key::Num5,
        "6" => Key::Num6,
        "7" => Key::Num7,
        "8" => Key::Num8,
        "9" => Key::Num9,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        "enter" | "return" => Key::Return,
        "tab" => Key::Tab,
        "space" => Key::Space,
        "escape" | "esc" => Key::Escape,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "home" => Key::Home,
        "end" => Key::End,
        "insert" => Key::Insert,
        "-" | "minus" => Key::Minus,
        "=" | "equal" => Key::Equal,
        "`" | "grave" => Key::BackQuote,
        _ => return Err(format!("unsupported key token: {key}")),
    };
    Ok(parsed)
}

fn emit(event: EventType) -> Result<(), String> {
    simulate(&event).map_err(|error| format!("keyboard simulation failed: {error:?}"))?;
    thread::sleep(Duration::from_millis(2));
    Ok(())
}

pub fn send_chord(modifiers: &[String], key: &str) -> Result<(), String> {
    let modifier_keys = modifiers
        .iter()
        .map(|value| modifier_key(value))
        .collect::<Result<Vec<_>, _>>()?;
    let key = key_from_token(key)?;

    for modifier in &modifier_keys {
        emit(EventType::KeyPress(*modifier))?;
    }
    emit(EventType::KeyPress(key))?;
    emit(EventType::KeyRelease(key))?;
    for modifier in modifier_keys.iter().rev() {
        emit(EventType::KeyRelease(*modifier))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{key_from_token, modifier_key};
    use rdev::Key;

    #[test]
    fn maps_shared_shortcut_tokens() {
        assert_eq!(modifier_key("super").unwrap(), Key::MetaLeft);
        assert_eq!(modifier_key("control").unwrap(), Key::ControlLeft);
        assert_eq!(key_from_token("c").unwrap(), Key::KeyC);
        assert_eq!(key_from_token("pageup").unwrap(), Key::PageUp);
        assert_eq!(key_from_token("F12").unwrap(), Key::F12);
    }

    #[test]
    fn rejects_unknown_tokens() {
        assert!(modifier_key("hyper").is_err());
        assert!(key_from_token("f24").is_err());
    }
}
