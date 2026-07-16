//! Windows clipboard file path helpers via Win32 (replaces `electron-clipboard-ex`).
//!
//! - `read_file_paths` reads `CF_HDROP` and decodes paths through `DragQueryFileW`.
//! - `write_file_paths` builds a `DROPFILES + UTF-16LE` payload and publishes it
//!   together with `Preferred DropEffect = COPY` so Explorer treats the data as
//!   a copy operation.

use std::ffi::c_void;
use std::ptr;

use windows::core::w;
use windows::Win32::Foundation::{BOOL, HANDLE, HGLOBAL, HWND, POINT};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Ole::CF_HDROP;
use windows::Win32::UI::Shell::{DragQueryFileW, DROPFILES, HDROP};

// `GlobalFree` is omitted from the `windows` crate's safe wrappers (as of v0.59),
// so link to it directly. We only call it on error paths before ownership of the
// allocation transfers to the clipboard via `SetClipboardData`.
#[link(name = "kernel32")]
extern "system" {
    fn GlobalFree(h_mem: *mut c_void) -> *mut c_void;
}

unsafe fn global_free(h_mem: HGLOBAL) {
    let _ = GlobalFree(h_mem.0);
}

const DROPEFFECT_COPY: u32 = 1;
const OPEN_RETRIES: u32 = 5;
const OPEN_RETRY_SLEEP_MS: u64 = 20;

/// RAII guard that closes the clipboard when dropped.
struct ClipboardSession;

impl ClipboardSession {
    fn open() -> Result<Self, String> {
        for attempt in 0..OPEN_RETRIES {
            if unsafe { OpenClipboard(Some(HWND::default())) }.is_ok() {
                return Ok(Self);
            }
            // Another process may briefly hold the clipboard right after a paste/copy.
            if attempt + 1 < OPEN_RETRIES {
                std::thread::sleep(std::time::Duration::from_millis(OPEN_RETRY_SLEEP_MS));
            }
        }
        Err("OpenClipboard failed".into())
    }
}

impl Drop for ClipboardSession {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}

pub fn read_file_paths() -> Result<Vec<String>, String> {
    let _session = ClipboardSession::open()?;

    let cf_hdrop = CF_HDROP.0 as u32;
    if unsafe { IsClipboardFormatAvailable(cf_hdrop) }.is_err() {
        return Ok(Vec::new());
    }

    let handle = match unsafe { GetClipboardData(cf_hdrop) } {
        Ok(h) => h,
        Err(e) => return Err(format!("GetClipboardData(CF_HDROP) failed: {e:?}")),
    };
    if handle.0.is_null() {
        return Ok(Vec::new());
    }

    let hdrop = HDROP(handle.0);
    let count = unsafe { DragQueryFileW(hdrop, u32::MAX, None) };
    if count == 0 {
        return Ok(Vec::new());
    }

    let mut paths = Vec::with_capacity(count as usize);
    for i in 0..count {
        let needed = unsafe { DragQueryFileW(hdrop, i, None) };
        if needed == 0 {
            continue;
        }
        let mut buffer = vec![0u16; needed as usize + 1];
        let written = unsafe { DragQueryFileW(hdrop, i, Some(&mut buffer)) };
        if written == 0 {
            continue;
        }
        let path = String::from_utf16_lossy(&buffer[..written as usize]);
        if !path.is_empty() {
            paths.push(path);
        }
    }

    Ok(paths)
}

/// Allocates a movable global memory block, runs `fill` against the locked
/// pointer, and returns the handle ready for `SetClipboardData`.
///
/// The closure receives a raw byte pointer and the byte length. It must keep
/// writes inside the requested range. On failure the caller is responsible for
/// freeing the returned handle; on success ownership transfers to the
/// clipboard via `SetClipboardData`.
unsafe fn build_global<F>(byte_len: usize, fill: F) -> Result<HGLOBAL, String>
where
    F: FnOnce(*mut u8, usize) -> Result<(), String>,
{
    let h_mem = GlobalAlloc(GMEM_MOVEABLE, byte_len)
        .map_err(|e| format!("GlobalAlloc({byte_len}) failed: {e:?}"))?;

    let ptr = GlobalLock(h_mem) as *mut u8;
    if ptr.is_null() {
        global_free(h_mem);
        return Err("GlobalLock failed".into());
    }

    let result = fill(ptr, byte_len);
    let _ = GlobalUnlock(h_mem);

    match result {
        Ok(()) => Ok(h_mem),
        Err(e) => {
            global_free(h_mem);
            Err(e)
        }
    }
}

pub fn write_file_paths(files: &[String]) -> Result<(), String> {
    if files.is_empty() {
        return Err("write_file_paths: empty file list".into());
    }

    // Build the UTF-16LE payload: each path NUL-terminated, list closed with another NUL.
    let mut wide_payload: Vec<u16> = Vec::new();
    for file in files {
        if file.is_empty() {
            continue;
        }
        wide_payload.extend(file.encode_utf16());
        wide_payload.push(0);
    }
    if wide_payload.is_empty() {
        return Err("write_file_paths: all entries empty".into());
    }
    wide_payload.push(0);

    let header_size = std::mem::size_of::<DROPFILES>();
    let payload_bytes = wide_payload.len() * std::mem::size_of::<u16>();
    let total = header_size + payload_bytes;

    let h_mem = unsafe {
        build_global(total, |ptr, _| {
            let dropfiles = ptr as *mut DROPFILES;
            ptr::write(
                dropfiles,
                DROPFILES {
                    pFiles: header_size as u32,
                    pt: POINT { x: 0, y: 0 },
                    fNC: BOOL(0),
                    fWide: BOOL(1),
                },
            );
            let dest = ptr.add(header_size) as *mut u16;
            ptr::copy_nonoverlapping(wide_payload.as_ptr(), dest, wide_payload.len());
            Ok(())
        })?
    };

    let session = match ClipboardSession::open() {
        Ok(s) => s,
        Err(e) => {
            unsafe { global_free(h_mem) };
            return Err(e);
        }
    };

    if unsafe { EmptyClipboard() }.is_err() {
        unsafe { global_free(h_mem) };
        return Err("EmptyClipboard failed".into());
    }

    let cf_hdrop = CF_HDROP.0 as u32;
    if let Err(e) = unsafe { SetClipboardData(cf_hdrop, Some(HANDLE(h_mem.0))) } {
        unsafe { global_free(h_mem) };
        return Err(format!("SetClipboardData(CF_HDROP) failed: {e:?}"));
    }
    // Ownership of `h_mem` now belongs to the clipboard; do NOT GlobalFree.

    // Best-effort Preferred DropEffect = COPY so Explorer treats the paste as a copy.
    let dropeffect_format = unsafe { RegisterClipboardFormatW(w!("Preferred DropEffect")) };
    if dropeffect_format != 0 {
        let effect_mem = unsafe {
            build_global(std::mem::size_of::<u32>(), |ptr, _| {
                ptr::write(ptr as *mut u32, DROPEFFECT_COPY);
                Ok(())
            })
        };
        if let Ok(handle) = effect_mem {
            if unsafe { SetClipboardData(dropeffect_format, Some(HANDLE(handle.0))) }.is_err() {
                unsafe { global_free(handle) };
            }
        }
    }

    drop(session);
    Ok(())
}
