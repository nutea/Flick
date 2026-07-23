//! Global low-level keyboard / mouse hooks (`WH_KEYBOARD_LL`, `WH_MOUSE_LL`) replacing uiohook-napi on Windows.

use std::ffi::c_void;
use std::mem::{size_of, MaybeUninit};
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use napi::bindgen_prelude::Env;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi::{Error, JsFunction, Result};

// ErrorStrategy::Fatal → JS callback receives a single positional arg (the value),
// not `(err, value)` like CalleeHandled. Keeps the JS side simple: `(payload) => …`.
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::{
    GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
};
use windows::Win32::System::SystemInformation::GetTickCount64;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RIDEV_INPUTSINK,
    RIDEV_REMOVE, RID_INPUT, RIM_TYPEMOUSE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    PeekMessageW, PostThreadMessageW, RegisterClassW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, UnregisterClassW, HHOOK, HWND_MESSAGE, KBDLLHOOKSTRUCT, LLKHF_EXTENDED,
    MSG, MSLLHOOKSTRUCT, PM_NOREMOVE, WH_KEYBOARD_LL, WH_MOUSE_LL, WINDOW_EX_STYLE, WINDOW_STYLE,
    WM_INPUT, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
    WM_MOUSEHWHEEL, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP, WM_USER, WM_XBUTTONDOWN, WM_XBUTTONUP, WNDCLASSW,
};

static TSFN: Mutex<Option<ThreadsafeFunction<String, ErrorStrategy::Fatal>>> = Mutex::new(None);
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
// 0 = starting/stopped, 1 = both hooks installed, 2 = installation failed.
// The JavaScript layer must not treat a thread ID alone as proof that the
// hooks are usable: on some clean Windows 10 systems SetWindowsHookExW fails
// after the hook thread has already started.
static HOOK_READY_STATE: AtomicU32 = AtomicU32::new(0);
static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
static JOIN: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);
static SUPPRESSED_MOUSE_BUTTON: AtomicU32 = AtomicU32::new(0);
static RAW_INPUT_READY: AtomicBool = AtomicBool::new(false);
static LAST_HOOK_MOUSE_CODE: AtomicU32 = AtomicU32::new(0);
static LAST_HOOK_MOUSE_AT: AtomicU64 = AtomicU64::new(0);

static KB_HOOK_PTR: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
static MOUSE_HOOK_PTR: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

fn next_kb_hook() -> Option<HHOOK> {
    let p = KB_HOOK_PTR.load(Ordering::SeqCst);
    (!p.is_null()).then_some(HHOOK(p))
}

fn next_mouse_hook() -> Option<HHOOK> {
    let p = MOUSE_HOOK_PTR.load(Ordering::SeqCst);
    (!p.is_null()).then_some(HHOOK(p))
}

pub fn set_mouse_button_suppression(button: Option<&str>) {
    let code = match button {
        Some("left") => 1,
        Some("right") => 2,
        Some("middle") => 3,
        _ => 0,
    };
    SUPPRESSED_MOUSE_BUTTON.store(code, Ordering::SeqCst);
}

fn should_suppress_mouse_message(message: u32) -> bool {
    match SUPPRESSED_MOUSE_BUTTON.load(Ordering::SeqCst) {
        1 => message == WM_LBUTTONDOWN || message == WM_LBUTTONUP,
        2 => message == WM_RBUTTONDOWN || message == WM_RBUTTONUP,
        3 => message == WM_MBUTTONDOWN || message == WM_MBUTTONUP,
        _ => false,
    }
}

fn push_json(json: String) {
    let guard = TSFN.lock().ok();
    let Some(guard) = guard else {
        return;
    };
    let Some(tsfn) = guard.as_ref() else {
        return;
    };
    let _ = tsfn.call(json, ThreadsafeFunctionCallMode::NonBlocking);
}

const RAW_MOUSE_LEFT_DOWN: u16 = 0x0001;
const RAW_MOUSE_LEFT_UP: u16 = 0x0002;
const RAW_MOUSE_RIGHT_DOWN: u16 = 0x0004;
const RAW_MOUSE_RIGHT_UP: u16 = 0x0008;
const RAW_MOUSE_MIDDLE_DOWN: u16 = 0x0010;
const RAW_MOUSE_MIDDLE_UP: u16 = 0x0020;
const RAW_MOUSE_BACK_DOWN: u16 = 0x0040;
const RAW_MOUSE_BACK_UP: u16 = 0x0080;
const RAW_MOUSE_FORWARD_DOWN: u16 = 0x0100;
const RAW_MOUSE_FORWARD_UP: u16 = 0x0200;

fn emit_mouse_event(state: &str, button: &str, source: &str, hook_observed: Option<bool>) {
    let hook_marker = hook_observed
        .map(|observed| format!(r#","hookObserved":{observed}"#))
        .unwrap_or_default();
    push_json(format!(
        r#"{{"kind":"mouse","state":"{state}","button":"{button}","source":"{source}"{hook_marker}}}"#
    ));
}

fn mouse_event_code(button: &str, state: &str) -> u32 {
    let button_code = match button {
        "left" => 1,
        "right" => 2,
        "middle" => 3,
        "back" => 4,
        "forward" => 5,
        _ => 0,
    };
    button_code * 2 + u32::from(state == "up")
}

fn record_hook_mouse_event(state: &str, button: &str) {
    LAST_HOOK_MOUSE_CODE.store(mouse_event_code(button, state), Ordering::SeqCst);
    LAST_HOOK_MOUSE_AT.store(unsafe { GetTickCount64() }, Ordering::SeqCst);
}

fn hook_observed_raw_event(state: &str, button: &str) -> bool {
    let expected = mouse_event_code(button, state);
    let observed_at = LAST_HOOK_MOUSE_AT.load(Ordering::SeqCst);
    let now = unsafe { GetTickCount64() };
    expected != 0
        && LAST_HOOK_MOUSE_CODE.load(Ordering::SeqCst) == expected
        && now.saturating_sub(observed_at) <= 125
}

unsafe fn handle_raw_input(lparam: LPARAM) {
    let mut raw = MaybeUninit::<RAWINPUT>::zeroed();
    let mut size = size_of::<RAWINPUT>() as u32;
    let read = GetRawInputData(
        HRAWINPUT(lparam.0 as *mut c_void),
        RID_INPUT,
        Some(raw.as_mut_ptr().cast()),
        &mut size,
        size_of::<windows::Win32::UI::Input::RAWINPUTHEADER>() as u32,
    );
    if read == u32::MAX || read < size_of::<RAWINPUT>() as u32 {
        return;
    }
    let raw = raw.assume_init();
    if raw.header.dwType != RIM_TYPEMOUSE.0 {
        return;
    }
    let flags = raw.data.mouse.Anonymous.Anonymous.usButtonFlags;
    for (flag, state, button) in [
        (RAW_MOUSE_LEFT_DOWN, "down", "left"),
        (RAW_MOUSE_LEFT_UP, "up", "left"),
        (RAW_MOUSE_RIGHT_DOWN, "down", "right"),
        (RAW_MOUSE_RIGHT_UP, "up", "right"),
        (RAW_MOUSE_MIDDLE_DOWN, "down", "middle"),
        (RAW_MOUSE_MIDDLE_UP, "up", "middle"),
        (RAW_MOUSE_BACK_DOWN, "down", "back"),
        (RAW_MOUSE_BACK_UP, "up", "back"),
        (RAW_MOUSE_FORWARD_DOWN, "down", "forward"),
        (RAW_MOUSE_FORWARD_UP, "up", "forward"),
    ] {
        if flags & flag != 0 {
            emit_mouse_event(
                state,
                button,
                "raw-input",
                Some(hook_observed_raw_event(state, button)),
            );
        }
    }
}

unsafe extern "system" fn raw_input_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_INPUT {
        handle_raw_input(lparam);
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

unsafe fn create_raw_input_window(hinst: HINSTANCE) -> windows::core::Result<HWND> {
    let class_name = w!("FlickNativeRawInputWindow");
    let class = WNDCLASSW {
        lpfnWndProc: Some(raw_input_window_proc),
        hInstance: hinst,
        lpszClassName: class_name,
        ..Default::default()
    };
    if RegisterClassW(&class) == 0 {
        return Err(windows::core::Error::from_win32());
    }
    let hwnd = match CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        class_name,
        w!(""),
        WINDOW_STYLE::default(),
        0,
        0,
        0,
        0,
        Some(HWND_MESSAGE),
        None,
        Some(hinst),
        None,
    ) {
        Ok(hwnd) => hwnd,
        Err(error) => {
            let _ = UnregisterClassW(class_name, Some(hinst));
            return Err(error);
        }
    };
    let device = RAWINPUTDEVICE {
        usUsagePage: 0x01,
        usUsage: 0x02,
        dwFlags: RIDEV_INPUTSINK,
        hwndTarget: hwnd,
    };
    if let Err(error) = RegisterRawInputDevices(&[device], size_of::<RAWINPUTDEVICE>() as u32) {
        let _ = DestroyWindow(hwnd);
        let _ = UnregisterClassW(class_name, Some(hinst));
        return Err(error);
    }
    Ok(hwnd)
}

unsafe fn destroy_raw_input_window(hwnd: HWND, hinst: HINSTANCE) {
    let remove = RAWINPUTDEVICE {
        usUsagePage: 0x01,
        usUsage: 0x02,
        dwFlags: RIDEV_REMOVE,
        hwndTarget: HWND::default(),
    };
    let _ = RegisterRawInputDevices(&[remove], size_of::<RAWINPUTDEVICE>() as u32);
    let _ = DestroyWindow(hwnd);
    let _ = UnregisterClassW(w!("FlickNativeRawInputWindow"), Some(hinst));
}

fn vk_to_key(vk: u32, extended: bool) -> String {
    match vk {
        0xA2 => "ControlLeft".to_string(),
        0xA3 => "ControlRight".to_string(),
        0xA0 => "ShiftLeft".to_string(),
        0xA1 => "ShiftRight".to_string(),
        0xA4 => "AltLeft".to_string(),
        0xA5 => {
            if extended {
                "AltRight".to_string()
            } else {
                "AltLeft".to_string()
            }
        }
        0x5B => "MetaLeft".to_string(),
        0x5C => "MetaRight".to_string(),
        0x08 => "Backspace".to_string(),
        0x09 => "Tab".to_string(),
        0x0D => {
            if extended {
                "NumpadEnter".to_string()
            } else {
                "Enter".to_string()
            }
        }
        0x10 => "Shift".to_string(),
        0x11 => "Control".to_string(),
        0x12 => "Alt".to_string(),
        0x1B => "Escape".to_string(),
        0x20 => "Space".to_string(),
        0x2E => "Delete".to_string(),
        0x24 => "Home".to_string(),
        0x23 => "End".to_string(),
        0x21 => "PageUp".to_string(),
        0x22 => "PageDown".to_string(),
        0x25 => "Left".to_string(),
        0x26 => "Up".to_string(),
        0x27 => "Right".to_string(),
        0x28 => "Down".to_string(),
        0x2D => "Insert".to_string(),
        0x70..=0x87 => format!("F{}", vk - 0x70 + 1),
        0x30..=0x39 => format!("{}", vk - 0x30),
        0x41..=0x5A => char::from_u32(vk - 0x41 + u32::from(b'A'))
            .unwrap_or('A')
            .to_string(),
        0x60..=0x69 => format!("Numpad{}", vk - 0x60),
        _ => format!("KeyCode:{vk}"),
    }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let hk = next_kb_hook();
    if code < 0 {
        return CallNextHookEx(hk, code, wparam, lparam);
    }

    let msg = wparam.0 as u32;
    if !matches!(msg, WM_KEYDOWN | WM_KEYUP | WM_SYSKEYDOWN | WM_SYSKEYUP) {
        return CallNextHookEx(hk, code, wparam, lparam);
    }

    let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
    let vk = info.vkCode as u32;
    let extended = info.flags.contains(LLKHF_EXTENDED);
    let up = matches!(msg, WM_KEYUP | WM_SYSKEYUP);
    let state = if up { "up" } else { "down" };
    // vk_to_key always returns ASCII tokens (no quote / backslash), so JSON escaping is unnecessary.
    let key = vk_to_key(vk, extended);
    let json = format!(r#"{{"kind":"key","state":"{state}","key":"{key}"}}"#);
    push_json(json);

    CallNextHookEx(hk, code, wparam, lparam)
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let hk = next_mouse_hook();
    if code < 0 {
        return CallNextHookEx(hk, code, wparam, lparam);
    }

    let msg = wparam.0 as u32;
    let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);

    match msg {
        // Do not forward WM_MOUSEMOVE: it fires at pointer poll rate and would flood the
        // Node main thread via threadsafe callbacks, starving the renderer (white screen).
        WM_MOUSEMOVE => {}
        WM_LBUTTONDOWN => {
            record_hook_mouse_event("down", "left");
            if !RAW_INPUT_READY.load(Ordering::SeqCst) {
                emit_mouse_event("down", "left", "hook", None);
            }
        }
        WM_LBUTTONUP => {
            record_hook_mouse_event("up", "left");
            if !RAW_INPUT_READY.load(Ordering::SeqCst) {
                emit_mouse_event("up", "left", "hook", None);
            }
        }
        WM_RBUTTONDOWN => {
            record_hook_mouse_event("down", "right");
            if !RAW_INPUT_READY.load(Ordering::SeqCst) {
                emit_mouse_event("down", "right", "hook", None);
            }
        }
        WM_RBUTTONUP => {
            record_hook_mouse_event("up", "right");
            if !RAW_INPUT_READY.load(Ordering::SeqCst) {
                emit_mouse_event("up", "right", "hook", None);
            }
        }
        WM_MBUTTONDOWN => {
            record_hook_mouse_event("down", "middle");
            if !RAW_INPUT_READY.load(Ordering::SeqCst) {
                emit_mouse_event("down", "middle", "hook", None);
            }
        }
        WM_MBUTTONUP => {
            record_hook_mouse_event("up", "middle");
            if !RAW_INPUT_READY.load(Ordering::SeqCst) {
                emit_mouse_event("up", "middle", "hook", None);
            }
        }
        WM_XBUTTONDOWN | WM_XBUTTONUP => {
            let hi = (info.mouseData >> 16) as u16;
            let button = if hi == 1 {
                "back"
            } else if hi == 2 {
                "forward"
            } else {
                "unknown"
            };
            let state = if msg == WM_XBUTTONDOWN { "down" } else { "up" };
            record_hook_mouse_event(state, button);
            if !RAW_INPUT_READY.load(Ordering::SeqCst) {
                emit_mouse_event(state, button, "hook", None);
            }
        }
        WM_MOUSEWHEEL => {
            let delta = (info.mouseData >> 16) as i16 as i32;
            let json = format!(r#"{{"kind":"wheel","deltaX":0,"deltaY":{delta}}}"#);
            push_json(json);
        }
        WM_MOUSEHWHEEL => {
            let delta = (info.mouseData >> 16) as i16 as i32;
            let json = format!(r#"{{"kind":"wheel","deltaX":{delta},"deltaY":0}}"#);
            push_json(json);
        }
        _ => {}
    }

    // A configured mouse trigger is an application-owned gesture. In
    // particular, Windows 10 Explorer collapses an existing multi-selection
    // when it receives WM_MBUTTONDOWN. Consuming the immediate middle-click
    // trigger preserves the selection until the asynchronous Shell query has
    // captured every selected item.
    if should_suppress_mouse_message(msg) {
        return LRESULT(1);
    }

    CallNextHookEx(hk, code, wparam, lparam)
}

fn hook_thread_main() {
    unsafe {
        let mut module = windows::Win32::Foundation::HMODULE::default();
        let _ = GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
            PCWSTR::from_raw(keyboard_proc as *const u16 as *mut u16),
            &mut module,
        );

        let hinst = Some(HINSTANCE(module.0));
        let raw_input_window = create_raw_input_window(HINSTANCE(module.0)).ok();
        RAW_INPUT_READY.store(raw_input_window.is_some(), Ordering::SeqCst);
        // Ensure this thread owns a message queue even if Raw Input window
        // creation failed. Publish the thread ID only after PostThreadMessageW
        // can safely target it during a concurrent stop request.
        let mut bootstrap_message = MSG::default();
        let _ = PeekMessageW(&mut bootstrap_message, None, WM_USER, WM_USER, PM_NOREMOVE);
        HOOK_THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);

        let kb = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), hinst, 0);
        let mh = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), hinst, 0);

        if let Ok(h) = kb {
            KB_HOOK_PTR.store(h.0, Ordering::SeqCst);
        }
        if let Ok(h) = mh {
            MOUSE_HOOK_PTR.store(h.0, Ordering::SeqCst);
        }

        // The shared subscription serves keyboard and mouse consumers. A
        // partially installed hook would make some configured trigger modes
        // silently dead, so fail the start atomically and let JS retry.
        if KB_HOOK_PTR.load(Ordering::SeqCst).is_null()
            || MOUSE_HOOK_PTR.load(Ordering::SeqCst).is_null()
        {
            let kb_p = KB_HOOK_PTR.swap(std::ptr::null_mut(), Ordering::SeqCst);
            if !kb_p.is_null() {
                let _ = UnhookWindowsHookEx(HHOOK(kb_p));
            }
            let mh_p = MOUSE_HOOK_PTR.swap(std::ptr::null_mut(), Ordering::SeqCst);
            if !mh_p.is_null() {
                let _ = UnhookWindowsHookEx(HHOOK(mh_p));
            }
            if let Some(hwnd) = raw_input_window {
                destroy_raw_input_window(hwnd, HINSTANCE(module.0));
            }
            RAW_INPUT_READY.store(false, Ordering::SeqCst);
            HOOK_THREAD_ID.store(0, Ordering::SeqCst);
            RUNNING.store(false, Ordering::SeqCst);
            HOOK_READY_STATE.store(2, Ordering::SeqCst);
            return;
        }

        HOOK_READY_STATE.store(1, Ordering::SeqCst);
        if !STOP_REQUESTED.load(Ordering::SeqCst) {
            let mut msg = MSG::default();
            loop {
                let r = GetMessageW(&mut msg, None, 0, 0);
                if !r.as_bool() {
                    break;
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        let kb_p = KB_HOOK_PTR.swap(std::ptr::null_mut(), Ordering::SeqCst);
        if !kb_p.is_null() {
            let _ = UnhookWindowsHookEx(HHOOK(kb_p));
        }
        let mh_p = MOUSE_HOOK_PTR.swap(std::ptr::null_mut(), Ordering::SeqCst);
        if !mh_p.is_null() {
            let _ = UnhookWindowsHookEx(HHOOK(mh_p));
        }
        if let Some(hwnd) = raw_input_window {
            destroy_raw_input_window(hwnd, HINSTANCE(module.0));
        }
        RAW_INPUT_READY.store(false, Ordering::SeqCst);
    }

    HOOK_THREAD_ID.store(0, Ordering::SeqCst);
    HOOK_READY_STATE.store(0, Ordering::SeqCst);
    RUNNING.store(false, Ordering::SeqCst);
}

pub fn start(env: &Env, callback: JsFunction) -> Result<JsFunction> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err(Error::from_reason(
            "input hook is already running; stop it first",
        ));
    }

    let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = match callback
        .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<String>| {
            ctx.env
                .create_string_from_std(ctx.value.clone())
                .map(|s| vec![s.into_unknown()])
        }) {
        Ok(t) => t,
        Err(e) => {
            RUNNING.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };

    *TSFN.lock().unwrap() = Some(tsfn);
    HOOK_READY_STATE.store(0, Ordering::SeqCst);
    STOP_REQUESTED.store(false, Ordering::SeqCst);

    let handle = thread::spawn(|| {
        hook_thread_main();
    });

    *JOIN.lock().unwrap() = Some(handle);

    for _ in 0..100 {
        if HOOK_READY_STATE.load(Ordering::SeqCst) != 0 {
            break;
        }
        thread::sleep(Duration::from_millis(2));
    }

    if HOOK_READY_STATE.load(Ordering::SeqCst) != 1 {
        stop_hooks();
        return Err(Error::from_reason(
            "failed to install Windows keyboard and mouse hooks",
        ));
    }

    let stop = match env.create_function_from_closure("stopInputHook", |_ctx| {
        stop_hooks();
        Ok::<(), Error>(())
    }) {
        Ok(stop) => stop,
        Err(error) => {
            stop_hooks();
            return Err(error);
        }
    };

    Ok(stop)
}

fn stop_hooks() {
    STOP_REQUESTED.store(true, Ordering::SeqCst);
    SUPPRESSED_MOUSE_BUTTON.store(0, Ordering::SeqCst);
    RAW_INPUT_READY.store(false, Ordering::SeqCst);
    let tid = HOOK_THREAD_ID.load(Ordering::SeqCst);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM::default(), LPARAM::default());
        }
    }

    if let Some(h) = JOIN.lock().unwrap().take() {
        let _ = h.join();
    }

    *TSFN.lock().unwrap() = None;
    HOOK_READY_STATE.store(0, Ordering::SeqCst);
    RUNNING.store(false, Ordering::SeqCst);
}
