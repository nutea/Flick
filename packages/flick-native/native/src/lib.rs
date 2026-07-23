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

mod screen_capture;

use napi::bindgen_prelude::{
  AbortSignal, AsyncTask, Buffer, Env, JsFunction, Result, Task,
};
use napi_derive::napi;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

static SELECTION_CAPTURE_RUNNING: AtomicBool = AtomicBool::new(false);

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

#[napi(object)]
pub struct SelectedFileInfo {
  pub path: String,
  pub name: String,
  pub extension: String,
  pub isFile: bool,
  pub isDirectory: bool,
}

#[napi(object)]
pub struct SelectionSnapshot {
  pub source: String,
  pub text: String,
  pub files: Vec<SelectedFileInfo>,
  pub truncated: bool,
  pub foregroundFolder: String,
  pub activeWindow: Option<ActiveWindowInfo>,
  pub shellMs: u32,
  pub textMs: u32,
  pub totalMs: u32,
}

fn selected_file_info(path: String, is_directory: bool) -> SelectedFileInfo {
  let parsed = Path::new(&path);
  SelectedFileInfo {
    name: parsed
      .file_name()
      .map(|name| name.to_string_lossy().to_string())
      .unwrap_or_else(|| path.clone()),
    extension: parsed
      .extension()
      .map(|extension| format!(".{}", extension.to_string_lossy()))
      .unwrap_or_default(),
    path,
    isFile: !is_directory,
    isDirectory: is_directory,
  }
}

#[cfg(windows)]
mod windows_impl {
  use super::ActiveWindowInfo;
  use std::ffi::c_void;
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

  pub fn get_active_window_for_handle(window_handle: usize) -> Option<ActiveWindowInfo> {
    let hwnd = HWND(window_handle as *mut c_void);
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

  pub fn get_active_window() -> Option<ActiveWindowInfo> {
    let hwnd = unsafe { GetForegroundWindow() };
    get_active_window_for_handle(hwnd.0 as usize)
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

pub struct GetSelectedFilePathsTask {
  #[cfg(windows)]
  foreground_root: usize,
}

impl Task for GetSelectedFilePathsTask {
  type Output = Vec<String>;
  type JsValue = Vec<String>;

  fn compute(&mut self) -> Result<Self::Output> {
    #[cfg(windows)]
    {
      Ok(folder_open_path::get_explorer_selected_paths_for_root(
        self.foreground_root,
      ))
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
  AsyncTask::new(GetSelectedFilePathsTask {
    #[cfg(windows)]
    foreground_root: folder_open_path::get_foreground_root_handle(),
  })
}

pub struct CaptureSelectionTask {
  owns_slot: bool,
  #[cfg(windows)]
  foreground_root: usize,
  #[cfg(windows)]
  focused_handle: usize,
  #[cfg(not(windows))]
  active_window: Option<ActiveWindowInfo>,
  #[cfg(target_os = "macos")]
  source_is_finder: bool,
  #[cfg(target_os = "macos")]
  source_element: Option<accessibility_ng::AXUIElement>,
}

impl Drop for CaptureSelectionTask {
  fn drop(&mut self) {
    if self.owns_slot {
      SELECTION_CAPTURE_RUNNING.store(false, Ordering::Release);
    }
  }
}

impl Task for CaptureSelectionTask {
  type Output = SelectionSnapshot;
  type JsValue = SelectionSnapshot;

  fn compute(&mut self) -> Result<Self::Output> {
    let started_at = Instant::now();

    #[cfg(windows)]
    {
      if !self.owns_slot {
        return Ok(SelectionSnapshot {
          source: "none".to_string(),
          text: String::new(),
          files: Vec::new(),
          truncated: false,
          foregroundFolder: String::new(),
          activeWindow: windows_impl::get_active_window_for_handle(self.foreground_root),
          shellMs: 0,
          textMs: 0,
          totalMs: 0,
        });
      }
      let shell_started_at = Instant::now();
      let explorer =
        folder_open_path::get_explorer_snapshot_for_root(self.foreground_root);
      let shell_ms = shell_started_at.elapsed().as_millis().min(u32::MAX as u128) as u32;

      let text_started_at = Instant::now();
      // Explorer paths are more specific than an editable item label exposed
      // through UI Automation. Avoid the extra provider call when Shell has a
      // concrete filesystem selection.
      let text = if explorer.selection.files.is_empty() {
        selection_win::get_selected_text_for_context(
          self.foreground_root,
          self.focused_handle,
        )
      } else {
        String::new()
      };
      let text_ms = text_started_at.elapsed().as_millis().min(u32::MAX as u128) as u32;
      let files = explorer
        .selection
        .files
        .into_iter()
        .map(|file| selected_file_info(file.path, file.is_directory))
        .collect::<Vec<_>>();
      let source = if !files.is_empty() {
        "shell"
      } else if !text.is_empty() {
        "accessibility"
      } else {
        "none"
      };

      return Ok(SelectionSnapshot {
        source: source.to_string(),
        text,
        files,
        truncated: explorer.selection.truncated,
        foregroundFolder: explorer.folder,
        activeWindow: windows_impl::get_active_window_for_handle(self.foreground_root),
        shellMs: shell_ms,
        textMs: text_ms,
        totalMs: started_at.elapsed().as_millis().min(u32::MAX as u128) as u32,
      });
    }

    #[cfg(target_os = "macos")]
    {
      if !self.owns_slot {
        return Ok(SelectionSnapshot {
          source: "none".to_string(),
          text: String::new(),
          files: Vec::new(),
          truncated: false,
          foregroundFolder: String::new(),
          activeWindow: self.active_window.take(),
          shellMs: 0,
          textMs: 0,
          totalMs: 0,
        });
      }
      let shell_started_at = Instant::now();
      let finder = platform_unix::capture_finder_selection(self.source_is_finder);
      let files = finder
        .files
        .into_iter()
        .map(|item| {
          selected_file_info(item.path, item.is_directory)
        })
        .collect::<Vec<_>>();
      let shell_ms = shell_started_at.elapsed().as_millis().min(u32::MAX as u128) as u32;
      let text_started_at = Instant::now();
      let text = if files.is_empty() {
        platform_unix::get_selected_text_for_source(self.source_element.as_ref())
      } else {
        String::new()
      };
      let text_ms = text_started_at.elapsed().as_millis().min(u32::MAX as u128) as u32;
      let source = if !files.is_empty() {
        "shell"
      } else if !text.is_empty() {
        "accessibility"
      } else {
        "none"
      };
      Ok(SelectionSnapshot {
        source: source.to_string(),
        text,
        files,
        truncated: finder.truncated,
        foregroundFolder: finder.folder,
        activeWindow: self.active_window.take(),
        shellMs: shell_ms,
        textMs: text_ms,
        totalMs: started_at.elapsed().as_millis().min(u32::MAX as u128) as u32,
      })
    }

    #[cfg(target_os = "linux")]
    {
      if !self.owns_slot {
        return Ok(SelectionSnapshot {
          source: "none".to_string(),
          text: String::new(),
          files: Vec::new(),
          truncated: false,
          foregroundFolder: String::new(),
          activeWindow: self.active_window.take(),
          shellMs: 0,
          textMs: 0,
          totalMs: 0,
        });
      }
      let shell_started_at = Instant::now();
      let selected_paths = platform_unix::get_selected_file_paths();
      let truncated = selected_paths.len() > 100;
      let files = selected_paths
        .into_iter()
        .take(100)
        .map(|path| {
          let is_directory = std::fs::metadata(&path)
            .map(|metadata| metadata.is_dir())
            .unwrap_or(false);
          selected_file_info(path, is_directory)
        })
        .collect::<Vec<_>>();
      let foreground_folder = platform_unix::get_folder_open_path(true);
      let shell_ms = shell_started_at.elapsed().as_millis().min(u32::MAX as u128) as u32;
      let text_started_at = Instant::now();
      let text = if files.is_empty() {
        platform_unix::get_selected_text()
      } else {
        String::new()
      };
      let text_ms = text_started_at.elapsed().as_millis().min(u32::MAX as u128) as u32;
      let source = if !files.is_empty() {
        "shell"
      } else if !text.is_empty() {
        "accessibility"
      } else {
        "none"
      };
      Ok(SelectionSnapshot {
        source: source.to_string(),
        text,
        files,
        truncated,
        foregroundFolder: foreground_folder,
        activeWindow: self.active_window.take(),
        shellMs: shell_ms,
        textMs: text_ms,
        totalMs: started_at.elapsed().as_millis().min(u32::MAX as u128) as u32,
      })
    }
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

/// Captures source-window identity, file-manager selection and accessible text
/// as one trigger-time snapshot. The Windows foreground/focus handles or
/// macOS source application are captured synchronously before libuv schedules
/// the worker, so panel activation cannot redirect the query back to Flick.
#[napi(js_name = "captureSelection")]
pub fn capture_selection_napi(
  signal: Option<AbortSignal>,
) -> AsyncTask<CaptureSelectionTask> {
  let owns_slot = SELECTION_CAPTURE_RUNNING
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
    .is_ok();
  #[cfg(windows)]
  {
    let foreground_root = folder_open_path::get_foreground_root_handle();
    let focused_handle = selection_win::get_focused_window_handle(foreground_root);
    AsyncTask::with_optional_signal(
      CaptureSelectionTask {
        owns_slot,
        foreground_root,
        focused_handle,
      },
      signal,
    )
  }
  #[cfg(not(windows))]
  {
    let active_window = windows_impl::get_active_window();
    #[cfg(target_os = "macos")]
    let source_is_finder = platform_unix::is_finder_window(active_window.as_ref());
    #[cfg(target_os = "macos")]
    let source_element = if source_is_finder {
      None
    } else {
      Some(platform_unix::get_application_element(
        active_window.as_ref().and_then(|window| window.processId),
      ))
    };
    AsyncTask::with_optional_signal(
      CaptureSelectionTask {
        owns_slot,
        active_window,
        #[cfg(target_os = "macos")]
        source_is_finder,
        #[cfg(target_os = "macos")]
        source_element,
      },
      signal,
    )
  }
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

#[napi(js_name = "setMouseButtonSuppression")]
pub fn set_mouse_button_suppression_napi(button: Option<String>) -> Result<()> {
  #[cfg(windows)]
  {
    input_hook_win::set_mouse_button_suppression(button.as_deref());
  }
  #[cfg(target_os = "macos")]
  {
    input_hook_macos::set_mouse_button_suppression(button.as_deref());
  }
  #[cfg(target_os = "linux")]
  {
    let _ = button;
  }
  Ok(())
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

pub struct CaptureScreenRegionTask {
  x: i32,
  y: i32,
  width: u32,
  height: u32,
}

impl Task for CaptureScreenRegionTask {
  type Output = Buffer;
  type JsValue = Buffer;

  fn compute(&mut self) -> Result<Self::Output> {
    screen_capture::capture_region(self.x, self.y, self.width, self.height)
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

/// Captures a region expressed in Electron's global display coordinates and
/// returns a PNG buffer. The work runs on libuv's worker pool so display APIs
/// and PNG encoding never block Electron's main thread.
#[napi(js_name = "captureScreenRegion")]
pub fn capture_screen_region_napi(
  x: i32,
  y: i32,
  width: u32,
  height: u32,
) -> AsyncTask<CaptureScreenRegionTask> {
  AsyncTask::new(CaptureScreenRegionTask {
    x,
    y,
    width,
    height,
  })
}
