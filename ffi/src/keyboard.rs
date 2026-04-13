//! Keyboard FFI surface.  Plain C-ABI functions for `bun:ffi` consumption.
//!
//! Mirrors the napi `keyboard_*` surface but with primitive arguments only.

#[cfg(target_os = "linux")]
use mechatron_ffi_shared::x11::*;

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

// ==================== macOS placeholder ====================
//
// macOS FFI is intentionally unimplemented for now; loading the macOS
// dylib will succeed but the symbols will no-op.  See PLAN.md Phase 5.

#[cfg(target_os = "macos")]
fn do_press(_keycode: u32) {}
#[cfg(target_os = "macos")]
fn do_release(_keycode: u32) {}
#[cfg(target_os = "macos")]
fn platform_get_key_state(_keycode: i32) -> bool { false }

// ==================== C ABI exports ====================

#[no_mangle]
pub extern "C" fn keyboard_press(keycode: i32) {
    do_press(keycode as u32);
}

#[no_mangle]
pub extern "C" fn keyboard_release(keycode: i32) {
    do_release(keycode as u32);
}

// Symbol name kept camelCase to match the napi `js_name`, so the JS-side
// loader can call the same property name regardless of backend.
#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn keyboard_getKeyState(keycode: i32) -> bool {
    platform_get_key_state(keycode)
}
