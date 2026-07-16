//! Synthetic keyboard chords via `SendInput` (replaces @nut-tree/nut-js on Windows).

use windows::Win32::Foundation::GetLastError;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_BACK, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_HOME, VK_LCONTROL,
    VK_LEFT, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_NEXT, VK_OEM_3, VK_OEM_MINUS, VK_OEM_PLUS,
    VK_INSERT, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SPACE, VK_TAB, VK_UP, VK_0, VK_A,
};

fn key_input(vk: VIRTUAL_KEY, key_up: bool) -> INPUT {
    let mut flags = KEYBD_EVENT_FLAGS::default();
    if key_up {
        flags |= KEYEVENTF_KEYUP;
    }

    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn modifier_vk(name: &str) -> Result<VIRTUAL_KEY, String> {
    match name {
        "control" => Ok(VK_LCONTROL),
        "alt" => Ok(VK_LMENU),
        "shift" => Ok(VK_LSHIFT),
        "super" => Ok(VK_LWIN),
        _ => Err(format!("unknown modifier: {name}")),
    }
}

fn vk_from_key(key: &str) -> Result<VIRTUAL_KEY, String> {
    let k = key.trim();
    if k.is_empty() {
        return Err("empty key".into());
    }

    if let Some(rest) = k.strip_prefix('f').or_else(|| k.strip_prefix('F')) {
        let n: u32 = rest
            .parse()
            .map_err(|_| format!("bad function key: {key}"))?;
        if !(1..=24).contains(&n) {
            return Err(format!("function key out of range: {key}"));
        }
        let base = VK_F1.0 + (n as u16) - 1;
        return Ok(VIRTUAL_KEY(base));
    }

    if k.len() == 1 {
        let b = k.as_bytes()[0];
        match b {
            b'a'..=b'z' => {
                return Ok(VIRTUAL_KEY(VK_A.0 + (b - b'a') as u16));
            }
            b'A'..=b'Z' => {
                return Ok(VIRTUAL_KEY(VK_A.0 + (b - b'A') as u16));
            }
            b'0'..=b'9' => {
                return Ok(VIRTUAL_KEY(VK_0.0 + (b - b'0') as u16));
            }
            _ => {}
        }
    }

    match k {
        "enter" | "return" => Ok(VK_RETURN),
        "tab" => Ok(VK_TAB),
        "space" => Ok(VK_SPACE),
        "escape" | "esc" => Ok(VK_ESCAPE),
        "backspace" => Ok(VK_BACK),
        "delete" | "del" => Ok(VK_DELETE),
        "up" => Ok(VK_UP),
        "down" => Ok(VK_DOWN),
        "left" => Ok(VK_LEFT),
        "right" => Ok(VK_RIGHT),
        "pageup" => Ok(VK_PRIOR),
        "pagedown" => Ok(VK_NEXT),
        "home" => Ok(VK_HOME),
        "end" => Ok(VK_END),
        "insert" => Ok(VK_INSERT),
        "-" | "minus" => Ok(VK_OEM_MINUS),
        "=" | "equal" => Ok(VK_OEM_PLUS),
        "`" | "grave" => Ok(VK_OEM_3),
        _ => Err(format!("unsupported key token: {key}")),
    }
}

/// Presses `modifiers` then `key`, then releases in reverse order (same semantics as the old
/// nut-js `pressKey` / `releaseKey` pair for a chord).
pub fn send_chord(modifiers: &[String], key: &str) -> Result<(), String> {
    let mut vk_mods = Vec::new();
    for m in modifiers {
        vk_mods.push(modifier_vk(m.as_str())?);
    }
    let vk_key = vk_from_key(key)?;

    let mut inputs: Vec<INPUT> = Vec::new();
    for vk in &vk_mods {
        inputs.push(key_input(*vk, false));
    }
    inputs.push(key_input(vk_key, false));
    inputs.push(key_input(vk_key, true));
    for vk in vk_mods.iter().rev() {
        inputs.push(key_input(*vk, true));
    }

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        return Err(format!(
            "SendInput sent {sent} of {} events (last error {:?})",
            inputs.len(),
            unsafe { GetLastError() }
        ));
    }

    Ok(())
}
