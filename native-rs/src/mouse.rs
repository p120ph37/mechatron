use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg(target_os = "linux")]
use std::ffi::c_uint;

#[cfg(target_os = "linux")]
use crate::x11::*;
use crate::timer::timer_sleep_range;

// Button constants (matching C++ enum)
const BUTTON_LEFT: i32 = 0;
const BUTTON_MID: i32 = 1;
const BUTTON_RIGHT: i32 = 2;
const BUTTON_X1: i32 = 3;
const BUTTON_X2: i32 = 4;

// ==================== Linux ====================

#[cfg(target_os = "linux")]
fn x_button(button: i32) -> Option<u32> {
    match button {
        BUTTON_LEFT => Some(1),
        BUTTON_MID => Some(2),
        BUTTON_RIGHT => Some(3),
        _ => None, // X1, X2 not supported on Linux
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
fn platform_get_pos(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    unsafe {
        if !is_xtest_available() {
            obj.set("x", 0i32)?;
            obj.set("y", 0i32)?;
            return Ok(());
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
                obj.set("x", rx)?;
                obj.set("y", ry)?;
                return Ok(());
            }
        }
    }
    obj.set("x", 0i32)?;
    obj.set("y", 0i32)?;
    Ok(())
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
fn platform_get_state(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    unsafe {
        if !is_xtest_available() {
            return Ok(());
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
                obj.set("0", ((mask & Button1Mask) >> 8) != 0)?; // Left
                obj.set("1", ((mask & Button2Mask) >> 8) != 0)?; // Mid
                obj.set("2", ((mask & Button3Mask) >> 8) != 0)?; // Right
                obj.set("3", false)?; // X1
                obj.set("4", false)?; // X2
                return Ok(());
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn platform_get_button_state(button: i32) -> bool {
    unsafe {
        if button == BUTTON_X1 || button == BUTTON_X2 || !is_xtest_available() {
            return false;
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

// ==================== macOS ====================

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::c_void;
    pub type CGEventSourceRef = *mut c_void;
    pub type CGEventRef = *mut c_void;
    pub type CGMouseButton = u32;
    pub type CGEventType = u32;
    pub type CGEventSourceStateID = u32;
    pub type CGEventTapLocation = u32;
    pub type CGScrollEventUnit = u32;

    #[repr(C)]
    #[derive(Copy, Clone)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }

    pub const kCGEventSourceStateHIDSystemState: CGEventSourceStateID = 1;
    pub const kCGHIDEventTap: CGEventTapLocation = 0;

    pub const kCGEventLeftMouseDown: CGEventType = 1;
    pub const kCGEventLeftMouseUp: CGEventType = 2;
    pub const kCGEventRightMouseDown: CGEventType = 3;
    pub const kCGEventRightMouseUp: CGEventType = 4;
    pub const kCGEventOtherMouseDown: CGEventType = 25;
    pub const kCGEventOtherMouseUp: CGEventType = 26;

    pub const kCGMouseButtonLeft: CGMouseButton = 0;
    pub const kCGMouseButtonRight: CGMouseButton = 1;
    pub const kCGMouseButtonCenter: CGMouseButton = 2;

    pub const kCGScrollEventUnitPixel: CGScrollEventUnit = 1;

    extern "C" {
        pub fn CGEventSourceCreate(stateID: CGEventSourceStateID) -> CGEventSourceRef;
        pub fn CGEventCreate(source: CGEventSourceRef) -> CGEventRef;
        pub fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
        pub fn CGEventCreateMouseEvent(
            source: CGEventSourceRef,
            mouseType: CGEventType,
            mouseCursorPosition: CGPoint,
            mouseButton: CGMouseButton,
        ) -> CGEventRef;
        pub fn CGEventCreateScrollWheelEvent(
            source: CGEventSourceRef,
            units: CGScrollEventUnit,
            wheelCount: u32,
            wheel1: i32,
            ...
        ) -> CGEventRef;
        pub fn CGEventPost(tap: CGEventTapLocation, event: CGEventRef);
        pub fn CGEventSourceButtonState(
            stateID: CGEventSourceStateID,
            button: CGMouseButton,
        ) -> bool;
        pub fn CGWarpMouseCursorPosition(newCursorPosition: CGPoint) -> i32;
        pub fn CGAssociateMouseAndMouseCursorPosition(connected: bool) -> i32;
        pub fn CFRelease(cf: *mut c_void);
    }
}

#[cfg(target_os = "macos")]
fn mac_get_cursor_pos() -> mac::CGPoint {
    unsafe {
        let evt = mac::CGEventCreate(std::ptr::null_mut());
        if evt.is_null() {
            return mac::CGPoint { x: 0.0, y: 0.0 };
        }
        let pt = mac::CGEventGetLocation(evt);
        mac::CFRelease(evt);
        pt
    }
}

#[cfg(target_os = "macos")]
fn mac_button_params(button: i32, press: bool) -> Option<(mac::CGEventType, mac::CGMouseButton)> {
    match (button, press) {
        (BUTTON_LEFT, true) => Some((mac::kCGEventLeftMouseDown, mac::kCGMouseButtonLeft)),
        (BUTTON_LEFT, false) => Some((mac::kCGEventLeftMouseUp, mac::kCGMouseButtonLeft)),
        (BUTTON_RIGHT, true) => Some((mac::kCGEventRightMouseDown, mac::kCGMouseButtonRight)),
        (BUTTON_RIGHT, false) => Some((mac::kCGEventRightMouseUp, mac::kCGMouseButtonRight)),
        (BUTTON_MID, true) => Some((mac::kCGEventOtherMouseDown, mac::kCGMouseButtonCenter)),
        (BUTTON_MID, false) => Some((mac::kCGEventOtherMouseUp, mac::kCGMouseButtonCenter)),
        _ => None, // X1, X2 not directly supported
    }
}

#[cfg(target_os = "macos")]
fn do_press(button: i32) {
    if let Some((evt_type, cg_button)) = mac_button_params(button, true) {
        unsafe {
            let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
            if src.is_null() { return; }
            let pt = mac_get_cursor_pos();
            let evt = mac::CGEventCreateMouseEvent(src, evt_type, pt, cg_button);
            if !evt.is_null() {
                mac::CGEventPost(mac::kCGHIDEventTap, evt);
                mac::CFRelease(evt);
            }
            mac::CFRelease(src);
        }
    }
}

#[cfg(target_os = "macos")]
fn do_release(button: i32) {
    if let Some((evt_type, cg_button)) = mac_button_params(button, false) {
        unsafe {
            let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
            if src.is_null() { return; }
            let pt = mac_get_cursor_pos();
            let evt = mac::CGEventCreateMouseEvent(src, evt_type, pt, cg_button);
            if !evt.is_null() {
                mac::CGEventPost(mac::kCGHIDEventTap, evt);
                mac::CFRelease(evt);
            }
            mac::CFRelease(src);
        }
    }
}

#[cfg(target_os = "macos")]
fn platform_scroll_h(amount: i32) {
    unsafe {
        let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
        if src.is_null() { return; }
        let dx = amount * -120;
        let evt = mac::CGEventCreateScrollWheelEvent(
            src,
            mac::kCGScrollEventUnitPixel,
            2,
            0i32,
            dx,
        );
        if !evt.is_null() {
            mac::CGEventPost(mac::kCGHIDEventTap, evt);
            mac::CFRelease(evt);
        }
        mac::CFRelease(src);
    }
}

#[cfg(target_os = "macos")]
fn platform_scroll_v(amount: i32) {
    unsafe {
        let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
        if src.is_null() { return; }
        let dy = amount * 120;
        let evt = mac::CGEventCreateScrollWheelEvent(
            src,
            mac::kCGScrollEventUnitPixel,
            2,
            dy,
            0i32,
        );
        if !evt.is_null() {
            mac::CGEventPost(mac::kCGHIDEventTap, evt);
            mac::CFRelease(evt);
        }
        mac::CFRelease(src);
    }
}

#[cfg(target_os = "macos")]
fn platform_get_pos(env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    let pt = mac_get_cursor_pos();
    obj.set("x", pt.x as i32)?;
    obj.set("y", pt.y as i32)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn platform_set_pos(x: i32, y: i32) {
    unsafe {
        let pt = mac::CGPoint { x: x as f64, y: y as f64 };
        mac::CGWarpMouseCursorPosition(pt);
        mac::CGAssociateMouseAndMouseCursorPosition(true);
    }
}

#[cfg(target_os = "macos")]
fn platform_get_state(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    unsafe {
        obj.set("0", mac::CGEventSourceButtonState(mac::kCGEventSourceStateHIDSystemState, mac::kCGMouseButtonLeft))?;
        obj.set("1", mac::CGEventSourceButtonState(mac::kCGEventSourceStateHIDSystemState, mac::kCGMouseButtonCenter))?;
        obj.set("2", mac::CGEventSourceButtonState(mac::kCGEventSourceStateHIDSystemState, mac::kCGMouseButtonRight))?;
        obj.set("3", false)?; // X1
        obj.set("4", false)?; // X2
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn platform_get_button_state(button: i32) -> bool {
    let cg_button = match button {
        BUTTON_LEFT => mac::kCGMouseButtonLeft,
        BUTTON_MID => mac::kCGMouseButtonCenter,
        BUTTON_RIGHT => mac::kCGMouseButtonRight,
        _ => return false,
    };
    unsafe {
        mac::CGEventSourceButtonState(mac::kCGEventSourceStateHIDSystemState, cg_button)
    }
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
            if swapped { Some((MOUSEEVENTF_RIGHTDOWN, 0)) }
            else { Some((MOUSEEVENTF_LEFTDOWN, 0)) }
        }
        (BUTTON_LEFT, false) => {
            if swapped { Some((MOUSEEVENTF_RIGHTUP, 0)) }
            else { Some((MOUSEEVENTF_LEFTUP, 0)) }
        }
        (BUTTON_RIGHT, true) => {
            if swapped { Some((MOUSEEVENTF_LEFTDOWN, 0)) }
            else { Some((MOUSEEVENTF_RIGHTDOWN, 0)) }
        }
        (BUTTON_RIGHT, false) => {
            if swapped { Some((MOUSEEVENTF_LEFTUP, 0)) }
            else { Some((MOUSEEVENTF_RIGHTUP, 0)) }
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
                        dx: 0,
                        dy: 0,
                        mouseData: mouse_data,
                        dwFlags: flags,
                        time: 0,
                        dwExtraInfo: 0,
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
                        dx: 0,
                        dy: 0,
                        mouseData: mouse_data,
                        dwFlags: flags,
                        time: 0,
                        dwExtraInfo: 0,
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
                    dx: 0,
                    dy: 0,
                    mouseData: (amount * WHEEL_DELTA as i32) as u32,
                    dwFlags: MOUSEEVENTF_HWHEEL,
                    time: 0,
                    dwExtraInfo: 0,
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
                    dx: 0,
                    dy: 0,
                    mouseData: (amount * WHEEL_DELTA as i32) as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn platform_get_pos(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    unsafe {
        let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        GetCursorPos(&mut point);
        obj.set("x", point.x)?;
        obj.set("y", point.y)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn platform_set_pos(x: i32, y: i32) {
    unsafe {
        SetCursorPos(x, y);
    }
}

#[cfg(target_os = "windows")]
fn platform_get_state(_env: &Env, obj: &mut napi::JsObject) -> Result<()> {
    let swapped = win_buttons_swapped();
    unsafe {
        let (lbtn, rbtn) = if swapped {
            (VK_RBUTTON, VK_LBUTTON)
        } else {
            (VK_LBUTTON, VK_RBUTTON)
        };
        obj.set("0", GetAsyncKeyState(lbtn.0 as i32) & (0x8000u16 as i16) != 0)?;
        obj.set("1", GetAsyncKeyState(VK_MBUTTON.0 as i32) & (0x8000u16 as i16) != 0)?;
        obj.set("2", GetAsyncKeyState(rbtn.0 as i32) & (0x8000u16 as i16) != 0)?;
        obj.set("3", GetAsyncKeyState(VK_XBUTTON1.0 as i32) & (0x8000u16 as i16) != 0)?;
        obj.set("4", GetAsyncKeyState(VK_XBUTTON2.0 as i32) & (0x8000u16 as i16) != 0)?;
    }
    Ok(())
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
    unsafe {
        GetAsyncKeyState(vk.0 as i32) & (0x8000u16 as i16) != 0
    }
}

// --- NAPI exports ---

#[napi(js_name = "mouse_click")]
pub fn mouse_click(button: i32) {
    do_press(button);
    timer_sleep_range(40, 90);
    do_release(button);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "mouse_press")]
pub fn mouse_press(button: i32) {
    do_press(button);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "mouse_release")]
pub fn mouse_release(button: i32) {
    do_release(button);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "mouse_scrollH")]
pub fn mouse_scroll_h(amount: i32) {
    platform_scroll_h(amount);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "mouse_scrollV")]
pub fn mouse_scroll_v(amount: i32) {
    platform_scroll_v(amount);
    timer_sleep_range(40, 90);
}

#[napi(js_name = "mouse_getPos")]
pub fn mouse_get_pos(env: Env) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    platform_get_pos(&env, &mut obj)?;
    Ok(obj)
}

#[napi(js_name = "mouse_setPos")]
pub fn mouse_set_pos(x: i32, y: i32) {
    platform_set_pos(x, y);
}

#[napi(js_name = "mouse_getState")]
pub fn mouse_get_state(env: Env) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    platform_get_state(&env, &mut obj)?;
    Ok(obj)
}

#[napi(js_name = "mouse_getButtonState")]
pub fn mouse_get_button_state(button: i32) -> bool {
    platform_get_button_state(button)
}
