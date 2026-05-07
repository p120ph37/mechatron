// Linux x11 keyboard implementation.
//
// Drives input via the XTest extension over an Xlib display connection.
// Loaded by the `mechatron-keyboard-x11` crate, which links libX11/libXtst
// and exposes the resulting #[napi] functions through the
// @mechatronic/napi-keyboard-x11 npm package.  The TS facade
// lib/napi/keyboard-x11.ts imports those exports under the variant-neutral
// names that the rest of mechatron consumes.

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::x11::*;

fn do_press(keycode: u32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        let xkeycode = XKeysymToKeycode(display, keycode as KeySym);
        XTestFakeKeyEvent(display, xkeycode as u32, True_, CurrentTime);
        XSync(display, False_);
    }
}

fn do_release(keycode: u32) {
    unsafe {
        if !is_xtest_available() { return; }
        let display = get_display();
        let xkeycode = XKeysymToKeycode(display, keycode as KeySym);
        XTestFakeKeyEvent(display, xkeycode as u32, False_, CurrentTime);
        XSync(display, False_);
    }
}

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

// ==================== AsyncTask wrappers ====================

struct PressTask(u32);
impl Task for PressTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_press(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct ReleaseTask(u32);
impl Task for ReleaseTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_release(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct GetKeyStateTask(i32);
impl Task for GetKeyStateTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_get_key_state(self.0)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

#[napi(js_name = "keyboard_press")]
pub fn keyboard_press(keycode: i32) -> AsyncTask<PressTask> {
    AsyncTask::new(PressTask(keycode as u32))
}

#[napi(js_name = "keyboard_release")]
pub fn keyboard_release(keycode: i32) -> AsyncTask<ReleaseTask> {
    AsyncTask::new(ReleaseTask(keycode as u32))
}

#[napi(js_name = "keyboard_getKeyState")]
pub fn keyboard_get_key_state(keycode: i32) -> AsyncTask<GetKeyStateTask> {
    AsyncTask::new(GetKeyStateTask(keycode))
}
