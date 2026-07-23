//! macOS/Linux system integration that mirrors the Windows-facing API.

use crate::ActiveWindowInfo;
#[cfg(target_os = "macos")]
use std::io::Read;
#[cfg(target_os = "macos")]
use std::ffi::CStr;
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
#[cfg(target_os = "macos")]
use objc::rc::autoreleasepool;
#[cfg(target_os = "macos")]
use objc::runtime::Object;

#[cfg(target_os = "macos")]
#[link(name = "AppKit", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
const MAX_SELECTED_ITEMS: usize = 100;
#[cfg(target_os = "macos")]
const FINDER_RECORD_SEPARATOR: char = '\u{001e}';
#[cfg(target_os = "macos")]
const FINDER_FIELD_SEPARATOR: char = '\u{001f}';
#[cfg(target_os = "macos")]
const MAX_SELECTED_TEXT_CHARS: usize = 262_144;

#[cfg(target_os = "macos")]
pub struct FinderSelectedItem {
    pub path: String,
    pub is_directory: bool,
}

#[cfg(target_os = "macos")]
#[derive(Default)]
pub struct FinderSelectionSnapshot {
    pub files: Vec<FinderSelectedItem>,
    pub truncated: bool,
    pub folder: String,
}

#[cfg(target_os = "linux")]
fn command_output(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

#[cfg(target_os = "linux")]
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
unsafe fn nsstring_to_string(value: *mut Object) -> String {
    if value.is_null() {
        return String::new();
    }
    let utf8: *const std::os::raw::c_char = msg_send![value, UTF8String];
    if utf8.is_null() {
        return String::new();
    }
    CStr::from_ptr(utf8).to_string_lossy().into_owned()
}

#[cfg(target_os = "macos")]
pub fn get_active_window() -> Option<ActiveWindowInfo> {
    autoreleasepool(|| unsafe {
        let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        if workspace.is_null() {
            return None;
        }
        let application: *mut Object = msg_send![workspace, frontmostApplication];
        if application.is_null() {
            return None;
        }
        let process_id: i32 = msg_send![application, processIdentifier];
        let localized_name: *mut Object = msg_send![application, localizedName];
        let app_name = nsstring_to_string(localized_name);
        let bundle_url: *mut Object = msg_send![application, bundleURL];
        let bundle_path = if bundle_url.is_null() {
            String::new()
        } else {
            let path: *mut Object = msg_send![bundle_url, path];
            nsstring_to_string(path)
        };
        Some(ActiveWindowInfo {
            title: (!app_name.is_empty()).then(|| app_name.clone()),
            path: (!bundle_path.is_empty()).then_some(bundle_path),
            processId: u32::try_from(process_id).ok(),
            appName: (!app_name.is_empty()).then_some(app_name),
            x: None,
            y: None,
            width: None,
            height: None,
        })
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
    "tell application \"Finder\"\n{foreground_guard}if (count of Finder windows) is 0 then return POSIX path of (desktop as alias)\nreturn POSIX path of ((target of front Finder window) as alias)\nend tell"
  ))
}

#[cfg(target_os = "macos")]
pub fn is_finder_window(window: Option<&ActiveWindowInfo>) -> bool {
    let Some(window) = window else {
        return false;
    };
    window
        .appName
        .as_deref()
        .is_some_and(|value| value.eq_ignore_ascii_case("finder"))
        || window.path.as_deref().is_some_and(|value| {
            value
                .to_ascii_lowercase()
                .contains("/finder.app/")
                || value.to_ascii_lowercase().ends_with("/finder.app")
        })
}

#[cfg(target_os = "macos")]
fn finder_snapshot_script() -> &'static str {
    r#"tell application "Finder"
set recordSeparator to ASCII character 30
set fieldSeparator to ASCII character 31
set outputRecords to {}
set folderPath to ""
try
  if (count of Finder windows) is 0 then
    set folderPath to POSIX path of (desktop as alias)
  else
    set folderPath to POSIX path of (target of front Finder window as alias)
  end if
end try
set end of outputRecords to "F" & fieldSeparator & folderPath
set selectedItems to get selection
set selectedCount to count of selectedItems
if selectedCount > 100 then
  set end of outputRecords to "T" & fieldSeparator & "1"
  set itemLimit to 100
else
  set end of outputRecords to "T" & fieldSeparator & "0"
  set itemLimit to selectedCount
end if
repeat with itemIndex from 1 to itemLimit
  try
    set selectedItem to item itemIndex of selectedItems
    set selectedPath to POSIX path of ((selectedItem as text) as alias)
    if class of selectedItem is folder then
      set directoryFlag to "1"
    else
      set directoryFlag to "0"
    end if
    set end of outputRecords to "I" & fieldSeparator & directoryFlag & fieldSeparator & selectedPath
  end try
end repeat
set oldDelimiters to AppleScript's text item delimiters
set AppleScript's text item delimiters to recordSeparator
set output to outputRecords as text
set AppleScript's text item delimiters to oldDelimiters
return output
end tell"#
}

#[cfg(target_os = "macos")]
fn parse_finder_snapshot_output(output: &str) -> FinderSelectionSnapshot {
    let mut snapshot = FinderSelectionSnapshot::default();
    for record in output.split(FINDER_RECORD_SEPARATOR) {
        let mut fields = record.splitn(3, FINDER_FIELD_SEPARATOR);
        match fields.next().unwrap_or_default() {
            "F" => snapshot.folder = fields.next().unwrap_or_default().to_string(),
            "T" => snapshot.truncated = fields.next() == Some("1"),
            "I" => {
                let is_directory = fields.next() == Some("1");
                let path = fields.next().unwrap_or_default();
                if !path.is_empty() && snapshot.files.len() < MAX_SELECTED_ITEMS {
                    snapshot.files.push(FinderSelectedItem {
                        path: path.to_string(),
                        is_directory,
                    });
                }
            }
            _ => {}
        }
    }
    snapshot
}

/// Reads the Finder folder and its selection in one Apple event. The caller
/// decides whether Finder owned the trigger-time foreground; the script does
/// not re-check `frontmost`, because focus can move while the async task is
/// waiting for a worker.
#[cfg(target_os = "macos")]
pub fn capture_finder_selection(source_is_finder: bool) -> FinderSelectionSnapshot {
    if !source_is_finder {
        return FinderSelectionSnapshot::default();
    }
    parse_finder_snapshot_output(&apple_script(finder_snapshot_script()))
}

#[cfg(target_os = "macos")]
pub fn get_selected_file_paths() -> Vec<String> {
    let active_window = get_active_window();
    capture_finder_selection(is_finder_window(active_window.as_ref()))
        .files
        .into_iter()
        .map(|item| item.path)
        .collect()
}

#[cfg(target_os = "macos")]
pub fn get_application_element(process_id: Option<u32>) -> AXUIElement {
    let source = process_id
        .and_then(|value| i32::try_from(value).ok())
        .map(AXUIElement::application)
        .unwrap_or_else(AXUIElement::system_wide);
    // Accessibility providers are out-of-process. Bound a stalled target so a
    // hung application cannot monopolize the native selection worker.
    let _ = source.set_messaging_timeout(0.25);
    source
}

#[cfg(target_os = "macos")]
pub fn get_selected_text_for_source(source: Option<&AXUIElement>) -> String {
    let Some(source) = source else {
        return String::new();
    };
    let focused_attribute =
        AXAttribute::new(&CFString::from_static_string(kAXFocusedUIElementAttribute));
    let focused = source
        .attribute(&focused_attribute)
        .ok()
        .and_then(|value| value.downcast_into::<AXUIElement>());
    let selected_attribute =
        AXAttribute::new(&CFString::from_static_string(kAXSelectedTextAttribute));
    let value = focused
        .as_ref()
        .and_then(|element| element.attribute(&selected_attribute).ok())
        .and_then(|value| value.downcast_into::<CFString>())
        .map(|value| value.to_string())
        .unwrap_or_default();
    if value.chars().count() <= MAX_SELECTED_TEXT_CHARS {
        value
    } else {
        value.chars().take(MAX_SELECTED_TEXT_CHARS).collect()
    }
}

#[cfg(target_os = "macos")]
pub fn get_selected_text() -> String {
    let source = get_application_element(None);
    get_selected_text_for_source(Some(&source))
}

#[cfg(target_os = "macos")]
pub fn read_clipboard_file_paths() -> Result<Vec<String>, String> {
    autoreleasepool(|| unsafe {
        let pasteboard: *mut Object = msg_send![class!(NSPasteboard), generalPasteboard];
        if pasteboard.is_null() {
            return Ok(Vec::new());
        }
        let classes: *mut Object = msg_send![class!(NSArray), arrayWithObject: class!(NSURL)];
        let options: *mut Object = std::ptr::null_mut();
        let urls: *mut Object =
            msg_send![pasteboard, readObjectsForClasses: classes options: options];
        if urls.is_null() {
            return Ok(Vec::new());
        }
        let count: usize = msg_send![urls, count];
        // Return one sentinel item beyond the panel limit so JS can preserve
        // an accurate truncation indicator during the clipboard fallback.
        let clipboard_limit = MAX_SELECTED_ITEMS + 1;
        let mut paths = Vec::with_capacity(count.min(clipboard_limit));
        for index in 0..count.min(clipboard_limit) {
            let url: *mut Object = msg_send![urls, objectAtIndex: index];
            if url.is_null() {
                continue;
            }
            let is_file_url: bool = msg_send![url, isFileURL];
            if !is_file_url {
                continue;
            }
            let path: *mut Object = msg_send![url, path];
            if path.is_null() {
                continue;
            }
            let utf8: *const std::os::raw::c_char = msg_send![path, UTF8String];
            if utf8.is_null() {
                continue;
            }
            paths.push(CStr::from_ptr(utf8).to_string_lossy().into_owned());
        }
        Ok(paths)
    })
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

#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    use super::{
        is_finder_window, parse_finder_snapshot_output, ActiveWindowInfo,
        FINDER_FIELD_SEPARATOR, FINDER_RECORD_SEPARATOR, MAX_SELECTED_ITEMS,
    };

    #[test]
    fn parses_atomic_finder_snapshot_and_package_items() {
        let output = format!(
            "F{field}/Users/flick/Desktop/{record}T{field}1{record}I{field}1{field}/Users/flick/Desktop/Folder{record}I{field}0{field}/Applications/Notes.app",
            field = FINDER_FIELD_SEPARATOR,
            record = FINDER_RECORD_SEPARATOR
        );
        let snapshot = parse_finder_snapshot_output(&output);
        assert_eq!(snapshot.folder, "/Users/flick/Desktop/");
        assert!(snapshot.truncated);
        assert_eq!(snapshot.files.len(), 2);
        assert!(snapshot.files[0].is_directory);
        assert!(!snapshot.files[1].is_directory);
    }

    #[test]
    fn caps_untrusted_finder_output() {
        let records = (0..MAX_SELECTED_ITEMS + 5)
            .map(|index| {
                format!(
                    "I{field}0{field}/tmp/{index}",
                    field = FINDER_FIELD_SEPARATOR
                )
            })
            .collect::<Vec<_>>()
            .join(&FINDER_RECORD_SEPARATOR.to_string());
        assert_eq!(
            parse_finder_snapshot_output(&records).files.len(),
            MAX_SELECTED_ITEMS
        );
    }

    #[test]
    fn identifies_finder_from_trigger_window_identity() {
        let finder = ActiveWindowInfo {
            title: Some("Desktop".into()),
            path: Some("/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder".into()),
            processId: Some(123),
            appName: Some("Finder".into()),
            x: None,
            y: None,
            width: None,
            height: None,
        };
        assert!(is_finder_window(Some(&finder)));
        assert!(!is_finder_window(None));
    }
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
