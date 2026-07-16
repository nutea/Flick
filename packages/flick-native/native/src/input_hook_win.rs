//! Global low-level keyboard / mouse hooks (`WH_KEYBOARD_LL`, `WH_MOUSE_LL`) replacing uiohook-napi on Windows.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, Ordering};
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
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::{GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, LLKHF_EXTENDED, MSLLHOOKSTRUCT,
    MSG, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP,
    WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEHWHEEL, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_QUIT,
    WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

static TSFN: Mutex<Option<ThreadsafeFunction<String, ErrorStrategy::Fatal>>> =
    Mutex::new(None);
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
static RUNNING: AtomicBool = AtomicBool::new(false);
static JOIN: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);

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
    if !matches!(
        msg,
        WM_KEYDOWN | WM_KEYUP | WM_SYSKEYDOWN | WM_SYSKEYUP
    ) {
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
            push_json(r#"{"kind":"mouse","state":"down","button":"left"}"#.to_string());
        }
        WM_LBUTTONUP => {
            push_json(r#"{"kind":"mouse","state":"up","button":"left"}"#.to_string());
        }
        WM_RBUTTONDOWN => {
            push_json(r#"{"kind":"mouse","state":"down","button":"right"}"#.to_string());
        }
        WM_RBUTTONUP => {
            push_json(r#"{"kind":"mouse","state":"up","button":"right"}"#.to_string());
        }
        WM_MBUTTONDOWN => {
            push_json(r#"{"kind":"mouse","state":"down","button":"middle"}"#.to_string());
        }
        WM_MBUTTONUP => {
            push_json(r#"{"kind":"mouse","state":"up","button":"middle"}"#.to_string());
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
            let state = if msg == WM_XBUTTONDOWN {
                "down"
            } else {
                "up"
            };
            let json = format!(r#"{{"kind":"mouse","state":"{state}","button":"{button}"}}"#);
            push_json(json);
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

    CallNextHookEx(hk, code, wparam, lparam)
}

fn hook_thread_main() {
    HOOK_THREAD_ID.store(unsafe { GetCurrentThreadId() }, Ordering::SeqCst);

    unsafe {
        let mut module = windows::Win32::Foundation::HMODULE::default();
        let _ = GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
            PCWSTR::from_raw(keyboard_proc as *const u16 as *mut u16),
            &mut module,
        );

        let hinst = Some(HINSTANCE(module.0));

        let kb = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), hinst, 0);
        let mh = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), hinst, 0);

        if let Ok(h) = kb {
            KB_HOOK_PTR.store(h.0, Ordering::SeqCst);
        }
        if let Ok(h) = mh {
            MOUSE_HOOK_PTR.store(h.0, Ordering::SeqCst);
        }

        if KB_HOOK_PTR.load(Ordering::SeqCst).is_null()
            && MOUSE_HOOK_PTR.load(Ordering::SeqCst).is_null()
        {
            HOOK_THREAD_ID.store(0, Ordering::SeqCst);
            RUNNING.store(false, Ordering::SeqCst);
            return;
        }

        let mut msg = MSG::default();
        loop {
            let r = GetMessageW(&mut msg, None, 0, 0);
            if !r.as_bool() {
                break;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let kb_p = KB_HOOK_PTR.swap(std::ptr::null_mut(), Ordering::SeqCst);
        if !kb_p.is_null() {
            let _ = UnhookWindowsHookEx(HHOOK(kb_p));
        }
        let mh_p = MOUSE_HOOK_PTR.swap(std::ptr::null_mut(), Ordering::SeqCst);
        if !mh_p.is_null() {
            let _ = UnhookWindowsHookEx(HHOOK(mh_p));
        }
    }

    HOOK_THREAD_ID.store(0, Ordering::SeqCst);
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

    let handle = thread::spawn(|| {
        hook_thread_main();
    });

    *JOIN.lock().unwrap() = Some(handle);

    for _ in 0..80 {
        if HOOK_THREAD_ID.load(Ordering::SeqCst) != 0 {
            break;
        }
        thread::sleep(Duration::from_millis(2));
    }

    let stop = env.create_function_from_closure("stopInputHook", |_ctx| {
        stop_hooks();
        Ok::<(), Error>(())
    })?;

    Ok(stop)
}

fn stop_hooks() {
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
    RUNNING.store(false, Ordering::SeqCst);
}
