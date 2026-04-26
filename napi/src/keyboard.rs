use napi_derive::napi;

#[cfg(target_os = "linux")]
use crate::x11::*;

// ==================== Linux ====================

#[cfg(target_os = "linux")]
fn do_press(keycode: u32) {
    if crate::ei_input::is_available() {
        crate::ei_input::ei_key(keycode, true);
        return;
    }
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
    if crate::ei_input::is_available() {
        crate::ei_input::ei_key(keycode, false);
        return;
    }
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

// ==================== macOS ====================

#[cfg(target_os = "macos")]
#[allow(non_upper_case_globals)]
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

#[napi(js_name = "keyboard_press")]
pub fn keyboard_press(keycode: i32) {
    do_press(keycode as u32);
}

#[napi(js_name = "keyboard_release")]
pub fn keyboard_release(keycode: i32) {
    do_release(keycode as u32);
}

#[napi(js_name = "keyboard_getKeyState")]
pub fn keyboard_get_key_state(keycode: i32) -> bool {
    platform_get_key_state(keycode)
}
