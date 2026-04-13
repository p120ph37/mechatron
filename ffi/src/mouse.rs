//! Mouse FFI surface.  Plain C-ABI functions for `bun:ffi` consumption.
//!
//! `mouse_getPos` writes its result into a caller-provided `i32[2]` buffer
//! since FFI cannot return arbitrary objects.

#[cfg(target_os = "linux")]
use std::ffi::c_uint;

#[cfg(target_os = "linux")]
use mechatron_ffi_shared::x11::*;

const BUTTON_LEFT: i32 = 0;
const BUTTON_MID: i32 = 1;
const BUTTON_RIGHT: i32 = 2;
#[cfg(target_os = "windows")]
const BUTTON_X1: i32 = 3;
#[cfg(target_os = "windows")]
const BUTTON_X2: i32 = 4;

// ==================== Linux ====================

#[cfg(target_os = "linux")]
fn x_button(button: i32) -> Option<u32> {
    match button {
        BUTTON_LEFT => Some(1),
        BUTTON_MID => Some(2),
        BUTTON_RIGHT => Some(3),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn do_press(button: i32) {
    if let Some(xbtn) = x_button(button) {
        unsafe {
            if !is_xtest_available() { return; }
            let display = get_display();
            XTestFakeButtonEvent(display, xbtn, True_, CurrentTime);
            XSync(display, False_);
        }
    }
}

#[cfg(target_os = "linux")]
fn do_release(button: i32) {
    if let Some(xbtn) = x_button(button) {
        unsafe {
            if !is_xtest_available() { return; }
            let display = get_display();
            XTestFakeButtonEvent(display, xbtn, False_, CurrentTime);
            XSync(display, False_);
        }
    }
}

#[cfg(target_os = "linux")]
fn platform_scroll_h(amount: i32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        let repeat = amount.unsigned_abs() as i32;
        let button: u32 = if amount < 0 { 6 } else { 7 };
        for _ in 0..repeat {
            XTestFakeButtonEvent(display, button, True_, CurrentTime);
            XTestFakeButtonEvent(display, button, False_, CurrentTime);
        }
        XSync(display, False_);
    }
}

#[cfg(target_os = "linux")]
fn platform_scroll_v(amount: i32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        let repeat = amount.unsigned_abs() as i32;
        let button: u32 = if amount < 0 { 5 } else { 4 };
        for _ in 0..repeat {
            XTestFakeButtonEvent(display, button, True_, CurrentTime);
            XTestFakeButtonEvent(display, button, False_, CurrentTime);
        }
        XSync(display, False_);
    }
}

#[cfg(target_os = "linux")]
fn platform_get_pos(out_x: &mut i32, out_y: &mut i32) {
    unsafe {
        if !is_xtest_available() {
            *out_x = 0; *out_y = 0;
            return;
        }
        let display = get_display();
        let screens = XScreenCount(display);
        let mut root: Window = 0;
        let mut child: Window = 0;
        let mut rx: i32 = 0;
        let mut ry: i32 = 0;
        let mut wx: i32 = 0;
        let mut wy: i32 = 0;
        let mut mask: c_uint = 0;

        for i in 0..screens {
            if XQueryPointer(
                display, XRootWindow(display, i),
                &mut root, &mut child,
                &mut rx, &mut ry, &mut wx, &mut wy, &mut mask,
            ) != 0 {
                *out_x = rx; *out_y = ry;
                return;
            }
        }
        *out_x = 0; *out_y = 0;
    }
}

#[cfg(target_os = "linux")]
fn platform_set_pos(x: i32, y: i32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        XWarpPointer(display, 0, XDefaultRootWindow(display), 0, 0, 0, 0, x, y);
        XSync(display, False_);
    }
}

#[cfg(target_os = "linux")]
fn platform_get_button_state(button: i32) -> bool {
    unsafe {
        if !is_xtest_available() { return false; }
        let display = get_display();
        let screens = XScreenCount(display);
        let mut root: Window = 0;
        let mut child: Window = 0;
        let mut rx: i32 = 0;
        let mut ry: i32 = 0;
        let mut wx: i32 = 0;
        let mut wy: i32 = 0;
        let mut mask: c_uint = 0;

        for i in 0..screens {
            if XQueryPointer(
                display, XRootWindow(display, i),
                &mut root, &mut child,
                &mut rx, &mut ry, &mut wx, &mut wy, &mut mask,
            ) != 0 {
                return match button {
                    BUTTON_LEFT => (mask & Button1Mask) >> 8 != 0,
                    BUTTON_MID => (mask & Button2Mask) >> 8 != 0,
                    BUTTON_RIGHT => (mask & Button3Mask) >> 8 != 0,
                    _ => false,
                };
            }
        }
    }
    false
}

// ==================== Windows ====================

#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::*;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;

#[cfg(target_os = "windows")]
fn win_buttons_swapped() -> bool {
    unsafe { GetSystemMetrics(SM_SWAPBUTTON) != 0 }
}

#[cfg(target_os = "windows")]
fn win_mouse_flags(button: i32, press: bool) -> Option<(MOUSE_EVENT_FLAGS, u32)> {
    let swapped = win_buttons_swapped();
    match (button, press) {
        (BUTTON_LEFT, true) => {
            if swapped { Some((MOUSEEVENTF_RIGHTDOWN, 0)) } else { Some((MOUSEEVENTF_LEFTDOWN, 0)) }
        }
        (BUTTON_LEFT, false) => {
            if swapped { Some((MOUSEEVENTF_RIGHTUP, 0)) } else { Some((MOUSEEVENTF_LEFTUP, 0)) }
        }
        (BUTTON_RIGHT, true) => {
            if swapped { Some((MOUSEEVENTF_LEFTDOWN, 0)) } else { Some((MOUSEEVENTF_RIGHTDOWN, 0)) }
        }
        (BUTTON_RIGHT, false) => {
            if swapped { Some((MOUSEEVENTF_LEFTUP, 0)) } else { Some((MOUSEEVENTF_RIGHTUP, 0)) }
        }
        (BUTTON_MID, true) => Some((MOUSEEVENTF_MIDDLEDOWN, 0)),
        (BUTTON_MID, false) => Some((MOUSEEVENTF_MIDDLEUP, 0)),
        (BUTTON_X1, true) => Some((MOUSEEVENTF_XDOWN, XBUTTON1 as u32)),
        (BUTTON_X1, false) => Some((MOUSEEVENTF_XUP, XBUTTON1 as u32)),
        (BUTTON_X2, true) => Some((MOUSEEVENTF_XDOWN, XBUTTON2 as u32)),
        (BUTTON_X2, false) => Some((MOUSEEVENTF_XUP, XBUTTON2 as u32)),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn do_press(button: i32) {
    if let Some((flags, mouse_data)) = win_mouse_flags(button, true) {
        unsafe {
            let input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0, dy: 0, mouseData: mouse_data, dwFlags: flags,
                        time: 0, dwExtraInfo: 0,
                    },
                },
            };
            SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }
}

#[cfg(target_os = "windows")]
fn do_release(button: i32) {
    if let Some((flags, mouse_data)) = win_mouse_flags(button, false) {
        unsafe {
            let input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0, dy: 0, mouseData: mouse_data, dwFlags: flags,
                        time: 0, dwExtraInfo: 0,
                    },
                },
            };
            SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_scroll_h(amount: i32) {
    unsafe {
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0,
                    mouseData: (amount * WHEEL_DELTA as i32) as u32,
                    dwFlags: MOUSEEVENTF_HWHEEL,
                    time: 0, dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn platform_scroll_v(amount: i32) {
    unsafe {
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0,
                    mouseData: (amount * WHEEL_DELTA as i32) as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0, dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn platform_get_pos(out_x: &mut i32, out_y: &mut i32) {
    unsafe {
        let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        let _ = GetCursorPos(&mut point);
        *out_x = point.x;
        *out_y = point.y;
    }
}

#[cfg(target_os = "windows")]
fn platform_set_pos(x: i32, y: i32) {
    unsafe { let _ = SetCursorPos(x, y); }
}

#[cfg(target_os = "windows")]
fn platform_get_button_state(button: i32) -> bool {
    let swapped = win_buttons_swapped();
    let vk = match button {
        BUTTON_LEFT => if swapped { VK_RBUTTON } else { VK_LBUTTON },
        BUTTON_MID => VK_MBUTTON,
        BUTTON_RIGHT => if swapped { VK_LBUTTON } else { VK_RBUTTON },
        BUTTON_X1 => VK_XBUTTON1,
        BUTTON_X2 => VK_XBUTTON2,
        _ => return false,
    };
    unsafe { GetAsyncKeyState(vk.0 as i32) & (0x8000u16 as i16) != 0 }
}

// ==================== macOS placeholder ====================

#[cfg(target_os = "macos")]
fn do_press(_button: i32) {}
#[cfg(target_os = "macos")]
fn do_release(_button: i32) {}
#[cfg(target_os = "macos")]
fn platform_scroll_h(_amount: i32) {}
#[cfg(target_os = "macos")]
fn platform_scroll_v(_amount: i32) {}
#[cfg(target_os = "macos")]
fn platform_get_pos(out_x: &mut i32, out_y: &mut i32) { *out_x = 0; *out_y = 0; }
#[cfg(target_os = "macos")]
fn platform_set_pos(_x: i32, _y: i32) {}
#[cfg(target_os = "macos")]
fn platform_get_button_state(_button: i32) -> bool { false }

// ==================== C ABI exports ====================

#[no_mangle]
pub extern "C" fn mouse_press(button: i32) { do_press(button); }

#[no_mangle]
pub extern "C" fn mouse_release(button: i32) { do_release(button); }

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn mouse_scrollH(amount: i32) { platform_scroll_h(amount); }

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn mouse_scrollV(amount: i32) { platform_scroll_v(amount); }

/// Writes mouse position into `out[0]=x, out[1]=y`.
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn mouse_getPos(out: *mut i32) {
    if out.is_null() { return; }
    let x = &mut *out;
    let y = &mut *out.add(1);
    platform_get_pos(x, y);
}

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn mouse_setPos(x: i32, y: i32) { platform_set_pos(x, y); }

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn mouse_getButtonState(button: i32) -> bool {
    platform_get_button_state(button)
}
