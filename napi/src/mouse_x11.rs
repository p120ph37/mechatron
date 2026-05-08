// Linux x11 mouse implementation.
//
// Drives input via the XTest extension over an Xlib display connection.
// Loaded by the `mechatron-mouse-x11` crate, which links libX11/libXtst
// and exposes the resulting #[napi] functions through the
// @mechatronic/napi-mouse-x11 npm package.  The TS facade
// lib/napi/mouse-x11.ts imports those exports under the variant-neutral
// names that the rest of mechatron consumes.

use napi::bindgen_prelude::*;
use napi_derive::napi;

use std::ffi::c_uint;

use crate::x11::*;

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

fn platform_get_pos() -> (i32, i32) {
    unsafe {
        if !is_xtest_available() {
            return (0, 0);
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
                return (rx, ry);
            }
        }
    }
    (0, 0)
}

fn platform_set_pos(x: i32, y: i32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        XWarpPointer(display, 0, XDefaultRootWindow(display), 0, 0, 0, 0, x, y);
        XSync(display, False_);
    }
}

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

// ==================== AsyncTask wrappers ====================

#[napi(object)]
pub struct MousePos {
    pub x: i32,
    pub y: i32,
}

pub struct PressTask(i32);
impl Task for PressTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_press(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct ReleaseTask(i32);
impl Task for ReleaseTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_release(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct ScrollHTask(i32);
impl Task for ScrollHTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_scroll_h(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct ScrollVTask(i32);
impl Task for ScrollVTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_scroll_v(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct GetPosTask;
impl Task for GetPosTask {
    type Output = (i32, i32);
    type JsValue = MousePos;
    fn compute(&mut self) -> Result<(i32, i32)> {
        Ok(platform_get_pos())
    }
    fn resolve(&mut self, _env: Env, out: (i32, i32)) -> Result<MousePos> {
        Ok(MousePos { x: out.0, y: out.1 })
    }
}

pub struct SetPosTask(i32, i32);
impl Task for SetPosTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_set_pos(self.0, self.1); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct GetButtonStateTask(i32);
impl Task for GetButtonStateTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_get_button_state(self.0)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

#[napi(js_name = "mouse_press")]
pub fn mouse_press(button: i32) -> AsyncTask<PressTask> {
    AsyncTask::new(PressTask(button))
}

#[napi(js_name = "mouse_release")]
pub fn mouse_release(button: i32) -> AsyncTask<ReleaseTask> {
    AsyncTask::new(ReleaseTask(button))
}

#[napi(js_name = "mouse_scrollH")]
pub fn mouse_scroll_h(amount: i32) -> AsyncTask<ScrollHTask> {
    AsyncTask::new(ScrollHTask(amount))
}

#[napi(js_name = "mouse_scrollV")]
pub fn mouse_scroll_v(amount: i32) -> AsyncTask<ScrollVTask> {
    AsyncTask::new(ScrollVTask(amount))
}

#[napi(js_name = "mouse_getPos")]
pub fn mouse_get_pos() -> AsyncTask<GetPosTask> {
    AsyncTask::new(GetPosTask)
}

#[napi(js_name = "mouse_setPos")]
pub fn mouse_set_pos(x: i32, y: i32) -> AsyncTask<SetPosTask> {
    AsyncTask::new(SetPosTask(x, y))
}

#[napi(js_name = "mouse_getButtonState")]
pub fn mouse_get_button_state(button: i32) -> AsyncTask<GetButtonStateTask> {
    AsyncTask::new(GetButtonStateTask(button))
}
