use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::ffi::c_uint;

use crate::x11::*;
use crate::timer::timer_sleep_range;

// Button constants (matching C++ enum)
const BUTTON_LEFT: i32 = 0;
const BUTTON_MID: i32 = 1;
const BUTTON_RIGHT: i32 = 2;
const BUTTON_X1: i32 = 3;
const BUTTON_X2: i32 = 4;

fn x_button(button: i32) -> Option<u32> {
    match button {
        BUTTON_LEFT => Some(1),
        BUTTON_MID => Some(2),
        BUTTON_RIGHT => Some(3),
        _ => None, // X1, X2 not supported on Linux
    }
}

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
    timer_sleep_range(40, 90);
}

#[napi(js_name = "mouse_scrollV")]
pub fn mouse_scroll_v(amount: i32) {
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
    timer_sleep_range(40, 90);
}

#[napi(js_name = "mouse_getPos")]
pub fn mouse_get_pos(env: Env) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        if !is_xtest_available() {
            obj.set("x", 0i32)?;
            obj.set("y", 0i32)?;
            return Ok(obj);
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
                return Ok(obj);
            }
        }
    }
    obj.set("x", 0i32)?;
    obj.set("y", 0i32)?;
    Ok(obj)
}

#[napi(js_name = "mouse_setPos")]
pub fn mouse_set_pos(x: i32, y: i32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        XWarpPointer(display, 0, XDefaultRootWindow(display), 0, 0, 0, 0, x, y);
        XSync(display, False_);
    }
}

#[napi(js_name = "mouse_getState")]
pub fn mouse_get_state(env: Env) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        if !is_xtest_available() {
            return Ok(obj);
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
                return Ok(obj);
            }
        }
    }
    Ok(obj)
}

#[napi(js_name = "mouse_getButtonState")]
pub fn mouse_get_button_state(button: i32) -> bool {
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
