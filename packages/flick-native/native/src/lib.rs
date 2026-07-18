#![allow(non_snake_case)]

#[cfg(windows)]
mod clipboard_win;

#[cfg(windows)]
mod folder_open_path;

#[cfg(windows)]
mod keyboard_win;

#[cfg(windows)]
mod selection_win;

#[cfg(windows)]
mod input_hook_win;

#[cfg(not(windows))]
mod input_hook_unix;

#[cfg(target_os = "macos")]
mod input_hook_macos;

#[cfg(not(windows))]
mod keyboard_unix;

#[cfg(not(windows))]
mod platform_unix;

use napi::bindgen_prelude::{AsyncTask, Env, JsFunction, Result, Task};
use napi_derive::napi;

#[napi(object)]
pub struct ActiveWindowInfo {
  pub title: Option<String>,
  pub path: Option<String>,
  pub processId: Option<u32>,
  pub appName: Option<String>,
  pub x: Option<i32>,
  pub y: Option<i32>,
  pub width: Option<u32>,
  pub height: Option<u32>,
}

#[cfg(windows)]
mod windows_impl {
  use super::ActiveWindowInfo;
  use std::path::Path;
  use windows::core::PWSTR;
  use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, RECT};
  use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
  };
  use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId,
  };

  struct ProcessHandle(HANDLE);

  impl Drop for ProcessHandle {
    fn drop(&mut self) {
      if !self.0.is_invalid() {
        unsafe {
          let _ = CloseHandle(self.0);
        }
      }
    }
  }

  fn from_utf16(buffer: &[u16]) -> String {
    let end = buffer
      .iter()
      .position(|&value| value == 0)
      .unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
  }

  fn get_window_title(hwnd: HWND) -> Option<String> {
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
      return Some(String::new());
    }

    let mut buffer = vec![0u16; length as usize + 1];
    let written = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if written <= 0 {
      return Some(String::new());
    }

    Some(from_utf16(&buffer))
  }

  fn get_window_rect(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
      return None;
    }
    Some(rect)
  }

  fn get_process_id(hwnd: HWND) -> Option<u32> {
    let mut pid = 0u32;
    unsafe {
      GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
      None
    } else {
      Some(pid)
    }
  }

  fn get_process_path(process_id: u32) -> Option<String> {
    let handle =
      unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?;
    let process_handle = ProcessHandle(handle);

    let mut buffer = vec![0u16; 32768];
    let mut size = buffer.len() as u32;

    let result = unsafe {
      QueryFullProcessImageNameW(
        process_handle.0,
        PROCESS_NAME_WIN32,
        PWSTR(buffer.as_mut_ptr()),
        &mut size,
      )
    };

    if result.is_err() || size == 0 {
      return None;
    }

    Some(String::from_utf16_lossy(&buffer[..size as usize]))
  }

  fn get_app_name(path: &Option<String>) -> Option<String> {
    path.as_ref().and_then(|value| {
      Path::new(value)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
    })
  }

  pub fn get_active_window() -> Option<ActiveWindowInfo> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
      return None;
    }

    let title = get_window_title(hwnd);
    let rect = get_window_rect(hwnd);
    let process_id = get_process_id(hwnd);
    let path = process_id.and_then(get_process_path);
    let app_name = get_app_name(&path);

    let (x, y, width, height) = if let Some(window_rect) = rect {
      let raw_width = (window_rect.right - window_rect.left).max(0) as u32;
      let raw_height = (window_rect.bottom - window_rect.top).max(0) as u32;
      (
        Some(window_rect.left),
        Some(window_rect.top),
        Some(raw_width),
        Some(raw_height),
      )
    } else {
      (None, None, None, None)
    };

    Some(ActiveWindowInfo {
      title,
      path,
      processId: process_id,
      appName: app_name,
      x,
      y,
      width,
      height,
    })
  }
}

#[cfg(not(windows))]
mod windows_impl {
  use super::ActiveWindowInfo;

  pub fn get_active_window() -> Option<ActiveWindowInfo> {
    crate::platform_unix::get_active_window()
  }
}

// ---------------------------------------------------------------------------
// Async wrappers (run on the libuv thread pool, free the Node main thread).
// ---------------------------------------------------------------------------

pub struct GetActiveWindowTask;

impl Task for GetActiveWindowTask {
  type Output = Option<ActiveWindowInfo>;
  type JsValue = Option<ActiveWindowInfo>;

  fn compute(&mut self) -> Result<Self::Output> {
    Ok(windows_impl::get_active_window())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi]
pub fn get_active_window() -> AsyncTask<GetActiveWindowTask> {
  AsyncTask::new(GetActiveWindowTask)
}

pub struct GetFolderOpenPathTask;

impl Task for GetFolderOpenPathTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    #[cfg(windows)]
    {
      Ok(folder_open_path::get_folder_open_path().unwrap_or_default())
    }
    #[cfg(not(windows))]
    {
      Ok(platform_unix::get_folder_open_path(false))
    }
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "getFolderOpenPath")]
pub fn get_folder_open_path_async_napi() -> AsyncTask<GetFolderOpenPathTask> {
  AsyncTask::new(GetFolderOpenPathTask)
}

pub struct GetForegroundFolderPathTask;

impl Task for GetForegroundFolderPathTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    #[cfg(windows)]
    {
      Ok(folder_open_path::get_foreground_folder_path().unwrap_or_default())
    }
    #[cfg(not(windows))]
    {
      Ok(platform_unix::get_folder_open_path(true))
    }
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "getForegroundFolderPath")]
pub fn get_foreground_folder_path_async_napi() -> AsyncTask<GetForegroundFolderPathTask> {
  AsyncTask::new(GetForegroundFolderPathTask)
}

pub struct GetSelectedTextTask;

impl Task for GetSelectedTextTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    #[cfg(windows)]
    {
      Ok(selection_win::get_selected_text())
    }
    #[cfg(not(windows))]
    {
      Ok(platform_unix::get_selected_text())
    }
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "getSelectedText")]
pub fn get_selected_text_async_napi() -> AsyncTask<GetSelectedTextTask> {
  AsyncTask::new(GetSelectedTextTask)
}

pub struct GetSelectedFilePathsTask;

impl Task for GetSelectedFilePathsTask {
  type Output = Vec<String>;
  type JsValue = Vec<String>;

  fn compute(&mut self) -> Result<Self::Output> {
    #[cfg(windows)]
    {
      Ok(folder_open_path::get_explorer_selected_paths())
    }
    #[cfg(not(windows))]
    {
      Ok(platform_unix::get_selected_file_paths())
    }
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "getSelectedFilePaths")]
pub fn get_selected_file_paths_async_napi() -> AsyncTask<GetSelectedFilePathsTask> {
  AsyncTask::new(GetSelectedFilePathsTask)
}

/// Synchronous variant retained for `event.returnValue` IPC handlers (e.g.
/// `registerCdwhereIpc`) that cannot await a Promise. Prefer the async form.
#[napi(js_name = "getFolderOpenPathSync")]
pub fn get_folder_open_path_sync_napi() -> Result<String> {
  #[cfg(windows)]
  {
    Ok(folder_open_path::get_folder_open_path().unwrap_or_default())
  }
  #[cfg(not(windows))]
  {
    Ok(platform_unix::get_folder_open_path(false))
  }
}

#[napi(js_name = "sendKeyboardChord")]
pub fn send_keyboard_chord_napi(modifiers: Vec<String>, key: String) -> Result<()> {
  #[cfg(windows)]
  {
    keyboard_win::send_chord(&modifiers, &key).map_err(napi::Error::from_reason)?;
    return Ok(());
  }
  #[cfg(not(windows))]
  {
    keyboard_unix::send_chord(&modifiers, &key).map_err(napi::Error::from_reason)
  }
}

#[napi(js_name = "startInputHook")]
pub fn start_input_hook_napi(env: Env, callback: JsFunction) -> Result<JsFunction> {
  #[cfg(windows)]
  {
    return input_hook_win::start(&env, callback);
  }
  #[cfg(not(windows))]
  {
    input_hook_unix::start(&env, callback)
  }
}

/// Reads file paths from the platform clipboard (`CF_HDROP`, Finder URLs, or
/// `text/uri-list`). Returns an empty array when no file list is present.
#[napi(js_name = "readClipboardFilePaths")]
pub fn read_clipboard_file_paths_napi() -> Result<Vec<String>> {
  #[cfg(windows)]
  {
    return clipboard_win::read_file_paths().map_err(napi::Error::from_reason);
  }
  #[cfg(not(windows))]
  {
    platform_unix::read_clipboard_file_paths().map_err(napi::Error::from_reason)
  }
}

/// Writes file paths using the platform-native file-list clipboard format.
#[napi(js_name = "writeClipboardFilePaths")]
pub fn write_clipboard_file_paths_napi(files: Vec<String>) -> Result<()> {
  #[cfg(windows)]
  {
    return clipboard_win::write_file_paths(&files).map_err(napi::Error::from_reason);
  }
  #[cfg(not(windows))]
  {
    platform_unix::write_clipboard_file_paths(&files).map_err(napi::Error::from_reason)
  }
}

/// Returns a clipboard generation counter when the platform exposes one.
#[napi(js_name = "getClipboardChangeToken")]
pub fn get_clipboard_change_token_napi() -> u32 {
  #[cfg(windows)]
  unsafe {
    return windows::Win32::System::DataExchange::GetClipboardSequenceNumber();
  }
  #[cfg(not(windows))]
  {
    platform_unix::get_clipboard_change_token()
  }
}
