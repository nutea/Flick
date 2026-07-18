//! macOS/Linux system integration that mirrors the Windows-facing API.

use crate::ActiveWindowInfo;
#[cfg(target_os = "macos")]
use std::io::Read;
#[cfg(target_os = "linux")]
use std::path::Path;
use std::process::Command;
#[cfg(target_os = "macos")]
use std::process::Stdio;
#[cfg(target_os = "macos")]
use std::thread;
#[cfg(target_os = "macos")]
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
use accessibility_ng::{AXAttribute, AXUIElement};
#[cfg(target_os = "macos")]
use accessibility_sys_ng::{kAXFocusedUIElementAttribute, kAXSelectedTextAttribute};
#[cfg(target_os = "macos")]
use core_foundation::string::CFString;
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

#[cfg(target_os = "linux")]
fn command_output(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

pub fn get_active_window() -> Option<ActiveWindowInfo> {
    let window = active_win_pos_rs::get_active_window().ok()?;
    let path = window.process_path.to_string_lossy().to_string();
    Some(ActiveWindowInfo {
        title: Some(window.title),
        path: (!path.is_empty()).then_some(path),
        processId: u32::try_from(window.process_id).ok(),
        appName: (!window.app_name.is_empty()).then_some(window.app_name),
        x: Some(window.position.x.round() as i32),
        y: Some(window.position.y.round() as i32),
        width: Some(window.position.width.max(0.0).round() as u32),
        height: Some(window.position.height.max(0.0).round() as u32),
    })
}

#[cfg(target_os = "macos")]
fn apple_script(script: &str) -> String {
    let mut child = match Command::new("/usr/bin/osascript")
        .args(["-e", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(_) => return String::new(),
    };
    let deadline = Instant::now() + Duration::from_secs(1);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return String::new();
                }
                let mut output = String::new();
                let Some(mut stdout) = child.stdout.take() else {
                    return String::new();
                };
                if stdout.read_to_string(&mut output).is_err() {
                    return String::new();
                }
                return output.trim().to_string();
            }
            Ok(None) if Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(5));
            }
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return String::new();
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub fn get_folder_open_path(foreground_only: bool) -> String {
    let foreground_guard = if foreground_only {
        "if not frontmost then return \"\"\n"
    } else {
        ""
    };
    apple_script(&format!(
    "tell application \"Finder\"\n{foreground_guard}if (count of Finder windows) is 0 then return POSIX path of (desktop as alias)\nreturn POSIX path of (target of front Finder window as alias)\nend tell"
  ))
}

#[cfg(target_os = "macos")]
pub fn get_selected_file_paths() -> Vec<String> {
    let script = r#"tell application "Finder"
if not frontmost then return ""
set oldDelimiters to AppleScript's text item delimiters
set AppleScript's text item delimiters to linefeed
set selectedPaths to {}
set selectedItems to get selection
repeat with selectedItem in selectedItems
  try
    set selectedPath to POSIX path of ((selectedItem as text) as alias)
    copy selectedPath to end of selectedPaths
  end try
end repeat
set output to selectedPaths as text
set AppleScript's text item delimiters to oldDelimiters
return output
end tell"#;
    apple_script(script)
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(target_os = "macos")]
pub fn get_selected_text() -> String {
    let system = AXUIElement::system_wide();
    let focused_attribute =
        AXAttribute::new(&CFString::from_static_string(kAXFocusedUIElementAttribute));
    let selected_attribute =
        AXAttribute::new(&CFString::from_static_string(kAXSelectedTextAttribute));

    system
        .attribute(&focused_attribute)
        .ok()
        .and_then(|value| value.downcast_into::<AXUIElement>())
        .and_then(|element| element.attribute(&selected_attribute).ok())
        .and_then(|value| value.downcast_into::<CFString>())
        .map(|value| value.to_string())
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
pub fn read_clipboard_file_paths() -> Result<Vec<String>, String> {
    let script = r#"use framework "AppKit"
set pb to current application's NSPasteboard's generalPasteboard()
set urls to pb's readObjectsForClasses:{current application's NSURL} options:(missing value)
if urls is missing value then return ""
set oldDelimiters to AppleScript's text item delimiters
set AppleScript's text item delimiters to linefeed
set paths to {}
repeat with fileUrl in urls
  if (fileUrl's isFileURL()) as boolean then set end of paths to (fileUrl's |path|()) as text
end repeat
set output to paths as text
set AppleScript's text item delimiters to oldDelimiters
return output"#;
    Ok(apple_script(script)
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect())
}

fn escape_apple_script(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "macos")]
pub fn write_clipboard_file_paths(files: &[String]) -> Result<(), String> {
    let aliases = files
        .iter()
        .filter(|value| !value.is_empty())
        .map(|value| format!("POSIX file \"{}\"", escape_apple_script(value)))
        .collect::<Vec<_>>();
    if aliases.is_empty() {
        return Err("write_clipboard_file_paths: empty file list".into());
    }
    let script = format!("set the clipboard to {{{}}}", aliases.join(", "));
    let output = Command::new("/usr/bin/osascript")
        .args(["-e", &script])
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(target_os = "macos")]
pub fn get_clipboard_change_token() -> u32 {
    unsafe {
        let pasteboard: *mut objc::runtime::Object =
            msg_send![class!(NSPasteboard), generalPasteboard];
        if pasteboard.is_null() {
            return 0;
        }
        let count: i64 = msg_send![pasteboard, changeCount];
        u32::try_from(count).unwrap_or(0)
    }
}

#[cfg(target_os = "linux")]
pub fn get_folder_open_path(_foreground_only: bool) -> String {
    // KDE exposes the current directory in the active Dolphin window title.
    // Resolve an absolute title when available; other file managers fall back
    // to selected-file clipboard capture in the caller.
    let title = get_active_window()
        .and_then(|window| window.title)
        .unwrap_or_default();
    let candidate = title.split(" — ").next().unwrap_or(&title).trim();
    let from_title = Path::new(candidate)
        .is_absolute()
        .then(|| candidate.to_string())
        .unwrap_or_default();
    if !from_title.is_empty() {
        return from_title;
    }
    get_selected_file_paths()
        .first()
        .and_then(|value| Path::new(value).parent())
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
pub fn get_selected_file_paths() -> Vec<String> {
    let raw = if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        command_output(
            "wl-paste",
            &["--primary", "--type", "text/uri-list", "--no-newline"],
        )
        .or_else(|| {
            command_output(
                "xclip",
                &["-selection", "primary", "-t", "text/uri-list", "-out"],
            )
        })
    } else {
        command_output(
            "xclip",
            &["-selection", "primary", "-t", "text/uri-list", "-out"],
        )
    }
    .unwrap_or_default();
    decode_uri_list(&raw)
}

#[cfg(target_os = "linux")]
pub fn get_selected_text() -> String {
    get_primary_selection().unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn get_primary_selection() -> Option<String> {
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        command_output("wl-paste", &["--primary", "--no-newline"])
            .or_else(|| command_output("xclip", &["-selection", "primary", "-out"]))
            .or_else(|| command_output("xsel", &["--primary", "--output"]))
    } else {
        command_output("xclip", &["-selection", "primary", "-out"])
            .or_else(|| command_output("xsel", &["--primary", "--output"]))
    }
}

#[cfg(target_os = "linux")]
fn decode_uri_list(raw: &str) -> Vec<String> {
    raw.lines()
        .map(str::trim)
        .filter(|value| value.starts_with("file://"))
        .filter_map(|value| {
            let value = value.trim_start_matches("file://");
            let local_path = value
                .strip_prefix("localhost/")
                .map(|path| format!("/{path}"))
                .unwrap_or_else(|| {
                    if value.starts_with('/') {
                        value.to_string()
                    } else {
                        format!("//{value}")
                    }
                });
            percent_decode(&local_path)
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn percent_encode_path(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                output.push(*byte as char)
            }
            value => {
                use std::fmt::Write;
                let _ = write!(output, "%{value:02X}");
            }
        }
    }
    output
}

#[cfg(target_os = "linux")]
fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let text = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
            output.push(u8::from_str_radix(text, 16).ok()?);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output).ok()
}

#[cfg(target_os = "linux")]
pub fn read_clipboard_file_paths() -> Result<Vec<String>, String> {
    let raw = if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        command_output("wl-paste", &["--type", "text/uri-list", "--no-newline"]).or_else(|| {
            command_output(
                "xclip",
                &["-selection", "clipboard", "-t", "text/uri-list", "-out"],
            )
        })
    } else {
        command_output(
            "xclip",
            &["-selection", "clipboard", "-t", "text/uri-list", "-out"],
        )
    }
    .unwrap_or_default();
    Ok(decode_uri_list(&raw))
}

#[cfg(target_os = "linux")]
pub fn write_clipboard_file_paths(files: &[String]) -> Result<(), String> {
    let payload = files
        .iter()
        .filter(|value| !value.is_empty())
        .map(|value| format!("file://{}", percent_encode_path(value)))
        .collect::<Vec<_>>()
        .join("\r\n");
    if payload.is_empty() {
        return Err("write_clipboard_file_paths: empty file list".into());
    }
    let mut child = if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        Command::new("wl-copy")
            .args(["--type", "text/uri-list"])
            .stdin(std::process::Stdio::piped())
            .spawn()
    } else {
        Command::new("xclip")
            .args(["-selection", "clipboard", "-t", "text/uri-list", "-in"])
            .stdin(std::process::Stdio::piped())
            .spawn()
    }
    .map_err(|error| error.to_string())?;
    use std::io::Write;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "clipboard helper stdin unavailable".to_string())?
        .write_all(payload.as_bytes())
        .map_err(|error| error.to_string())?;
    let status = child.wait().map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("clipboard helper exited with {status}"))
    }
}

#[cfg(target_os = "linux")]
pub fn get_clipboard_change_token() -> u32 {
    0
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::{decode_uri_list, percent_encode_path};

    #[test]
    fn round_trips_uri_list_paths() {
        assert_eq!(
            decode_uri_list("file:///home/flick/My%20File.txt\r\n"),
            vec!["/home/flick/My File.txt"]
        );
        assert_eq!(
            percent_encode_path("/home/flick/中文 file.txt"),
            "/home/flick/%E4%B8%AD%E6%96%87%20file.txt"
        );
    }
}
