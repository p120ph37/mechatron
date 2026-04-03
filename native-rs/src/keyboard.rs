use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg(target_os = "linux")]
use crate::x11::*;
use crate::keys::*;
use crate::timer::timer_sleep_range;

// --- Keyboard compile parser (pure logic, no platform deps) ---

fn cancel_mods(modkeys: &mut [i8; 4], group: i8, result: &mut Vec<(bool, u32)>) {
    let mod_keys_map = [KEY_ALT, KEY_CONTROL, KEY_SHIFT, KEY_SYSTEM];
    for i in 0..4 {
        if modkeys[i] == group {
            result.push((false, mod_keys_map[i]));
            modkeys[i] = -1;
        }
    }
}

pub fn compile_keys(keys: &str, result: &mut Vec<(bool, u32)>) -> bool {
    let bytes = keys.as_bytes();
    let len = bytes.len();
    let mut modkeys: [i8; 4] = [-1, -1, -1, -1];
    let mut group: i8 = 0;
    result.clear();

    let mut i = 0;
    while i < len {
        match bytes[i] {
            b'}' => return false,
            b'{' => {
                i += 1;
                let mut token = String::new();
                let mut count_str = String::new();
                let mut in_count = false;

                loop {
                    if i >= len { return false; }
                    if in_count {
                        if count_str.len() >= 4 { return false; }
                        if bytes[i] == b'}' { break; }
                        count_str.push(bytes[i] as char);
                    } else {
                        if token.len() >= 16 { return false; }
                        if bytes[i] == b'}' { break; }
                        if bytes[i] == b' ' {
                            in_count = true;
                            i += 1;
                            continue;
                        }
                        token.push((bytes[i] as char).to_ascii_uppercase());
                    }
                    i += 1;
                }

                let key = match KEY_NAMES.get(token.as_str()) {
                    Some(k) => *k,
                    None => return false,
                };

                let key_count = if in_count {
                    match count_str.parse::<i32>() {
                        Ok(c) if (0..=99).contains(&c) => c,
                        _ => return false,
                    }
                } else {
                    1
                };

                for _ in 0..key_count {
                    result.push((true, key));
                    result.push((false, key));
                }
                cancel_mods(&mut modkeys, 0, result);
            }
            b'%' => {
                if modkeys[0] != -1 { return false; }
                result.push((true, KEY_ALT));
                modkeys[0] = 0;
            }
            b'^' => {
                if modkeys[1] != -1 { return false; }
                result.push((true, KEY_CONTROL));
                modkeys[1] = 0;
            }
            b'+' => {
                if modkeys[2] != -1 { return false; }
                result.push((true, KEY_SHIFT));
                modkeys[2] = 0;
            }
            b'$' => {
                if modkeys[3] != -1 { return false; }
                result.push((true, KEY_SYSTEM));
                modkeys[3] = 0;
            }
            b'(' => {
                group += 1;
                if group > 4 { return false; }
                for j in 0..4 {
                    if modkeys[j] == 0 { modkeys[j] = group; }
                }
            }
            b')' => {
                if group < 1 { return false; }
                cancel_mods(&mut modkeys, group, result);
                group -= 1;
            }
            b'\t' | b'\n' | b'\x0b' | b'\x0c' | b'\r' => {}
            ch => {
                let upper = (ch as char).to_ascii_uppercase().to_string();
                let key = match KEY_NAMES.get(upper.as_str()) {
                    Some(k) => *k,
                    None => return false,
                };
                result.push((true, key));
                result.push((false, key));
                cancel_mods(&mut modkeys, 0, result);
            }
        }
        i += 1;
    }
    group == 0
}

// --- Platform keyboard operations ---

// ==================== Linux ====================

#[cfg(target_os = "linux")]
fn do_press(keycode: u32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        let xkeycode = XKeysymToKeycode(display, keycode as KeySym);
        XTestFakeKeyEvent(display, xkeycode as u32, True_, CurrentTime);
        XSync(display, False_);
    }
}

#[cfg(target_os = "linux")]
fn do_release(keycode: u32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        let xkeycode = XKeysymToKeycode(display, keycode as KeySym);
        XTestFakeKeyEvent(display, xkeycode as u32, False_, CurrentTime);
        XSync(display, False_);
    }
}

#[cfg(target_os = "linux")]
fn platform_get_key_state(keycode: i32) -> bool {
    unsafe {
        if !is_xtest_available() { return false; }
        let display = get_display();
        let mut keys = [0i8; 32];
        XQueryKeymap(display, &mut keys as *mut [i8; 32] as *mut [std::ffi::c_char; 32]);
        let xkeycode = XKeysymToKeycode(display, keycode as KeySym);
        (keys[(xkeycode / 8) as usize] & (1 << (xkeycode % 8))) != 0
    }
}

#[cfg(target_os = "linux")]
fn platform_get_state(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    unsafe {
        if !is_xtest_available() {
            return Ok(());
        }
        let display = get_display();
        let mut keys = [0i8; 32];
        XQueryKeymap(display, &mut keys as *mut [i8; 32] as *mut [std::ffi::c_char; 32]);

        for &keyval in ALL_KEYS.iter() {
            let xkeycode = XKeysymToKeycode(display, keyval as KeySym);
            let pressed = (keys[(xkeycode / 8) as usize] & (1 << (xkeycode % 8))) != 0;
            obj.set(keyval.to_string().as_str(), pressed)?;
        }
    }
    Ok(())
}

// ==================== macOS ====================

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::c_void;
    pub type CGEventSourceRef = *mut c_void;
    pub type CGEventRef = *mut c_void;
    pub type CGKeyCode = u16;
    pub type CGEventSourceStateID = u32;
    pub type CGEventTapLocation = u32;
    pub const kCGEventSourceStateHIDSystemState: CGEventSourceStateID = 1;
    pub const kCGHIDEventTap: CGEventTapLocation = 0;
    extern "C" {
        pub fn CGEventSourceCreate(stateID: CGEventSourceStateID) -> CGEventSourceRef;
        pub fn CGEventCreateKeyboardEvent(source: CGEventSourceRef, virtualKey: CGKeyCode, keyDown: bool) -> CGEventRef;
        pub fn CGEventPost(tap: CGEventTapLocation, event: CGEventRef);
        pub fn CGEventSourceKeyState(stateID: CGEventSourceStateID, key: CGKeyCode) -> bool;
        pub fn CFRelease(cf: *mut c_void);
    }
}

#[cfg(target_os = "macos")]
fn do_press(keycode: u32) {
    unsafe {
        let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
        if src.is_null() { return; }
        let evt = mac::CGEventCreateKeyboardEvent(src, keycode as mac::CGKeyCode, true);
        if !evt.is_null() {
            mac::CGEventPost(mac::kCGHIDEventTap, evt);
            mac::CFRelease(evt);
        }
        mac::CFRelease(src);
    }
}

#[cfg(target_os = "macos")]
fn do_release(keycode: u32) {
    unsafe {
        let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
        if src.is_null() { return; }
        let evt = mac::CGEventCreateKeyboardEvent(src, keycode as mac::CGKeyCode, false);
        if !evt.is_null() {
            mac::CGEventPost(mac::kCGHIDEventTap, evt);
            mac::CFRelease(evt);
        }
        mac::CFRelease(src);
    }
}

#[cfg(target_os = "macos")]
fn platform_get_key_state(keycode: i32) -> bool {
    unsafe {
        mac::CGEventSourceKeyState(mac::kCGEventSourceStateHIDSystemState, keycode as mac::CGKeyCode)
    }
}

#[cfg(target_os = "macos")]
fn platform_get_state(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    for &keyval in ALL_KEYS.iter() {
        let pressed = unsafe {
            mac::CGEventSourceKeyState(mac::kCGEventSourceStateHIDSystemState, keyval as mac::CGKeyCode)
        };
        obj.set(keyval.to_string().as_str(), pressed)?;
    }
    Ok(())
}

// ==================== Windows ====================

#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::*;

#[cfg(target_os = "windows")]
fn do_press(keycode: u32) {
    unsafe {
        let vk = VIRTUAL_KEY(keycode as u16);
        let scan = MapVirtualKeyW(keycode, MAPVK_VK_TO_VSC) as u16;
        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: scan,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn do_release(keycode: u32) {
    unsafe {
        let vk = VIRTUAL_KEY(keycode as u16);
        let scan = MapVirtualKeyW(keycode, MAPVK_VK_TO_VSC) as u16;
        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: scan,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn platform_get_key_state(keycode: i32) -> bool {
    unsafe {
        GetAsyncKeyState(keycode) & (0x8000u16 as i16) != 0
    }
}

#[cfg(target_os = "windows")]
fn platform_get_state(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    for &keyval in ALL_KEYS.iter() {
        let pressed = unsafe {
            GetAsyncKeyState(keyval as i32) & (0x8000u16 as i16) != 0
        };
        obj.set(keyval.to_string().as_str(), pressed)?;
    }
    Ok(())
}

// --- NAPI exports ---

#[napi(js_name = "keyboard_click")]
pub fn keyboard_click(keycode: i32) {
    do_press(keycode as u32);
    timer_sleep_range(40, 90);
    do_release(keycode as u32);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "keyboard_press")]
pub fn keyboard_press(keycode: i32) {
    do_press(keycode as u32);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "keyboard_release")]
pub fn keyboard_release(keycode: i32) {
    do_release(keycode as u32);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "keyboard_compile")]
pub fn keyboard_compile(env: Env, keys: String) -> Result<napi::JsObject> {
    let mut pairs = Vec::new();
    compile_keys(&keys, &mut pairs);
    let mut arr = env.create_array(pairs.len() as u32)?;
    for (i, (down, key)) in pairs.iter().enumerate() {
        let mut obj = env.create_object()?;
        obj.set("down", *down)?;
        obj.set("key", *key)?;
        arr.set(i as u32, obj)?;
    }
    Ok(arr.coerce_to_object()?)
}

#[napi(js_name = "keyboard_getState")]
pub fn keyboard_get_state(env: Env) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    platform_get_state(&env, &mut obj)?;
    Ok(obj)
}

#[napi(js_name = "keyboard_getKeyState")]
pub fn keyboard_get_key_state(keycode: i32) -> bool {
    platform_get_key_state(keycode)
}
