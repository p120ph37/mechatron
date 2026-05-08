// Linux portal keyboard implementation.
//
// Drives input via the libei (Emulated Input) protocol over an EIS file
// descriptor obtained from the xdg-desktop-portal RemoteDesktop interface.
// Loaded by the `mechatron-keyboard-portal` crate, which has no NEEDED
// shared-library deps — libei is dlopen'd lazily by ei_input.rs and the
// dbus protocol is implemented over a raw socket.  The crate ships as the
// @mechatronic/napi-keyboard-portal npm package; the TS facade
// lib/napi/keyboard-portal.ts imports it under the variant-neutral names
// that the rest of mechatron consumes.

use napi::bindgen_prelude::*;
use napi_derive::napi;

fn do_press(keycode: u32) {
    crate::ei_input::ei_key(keycode, true);
}

fn do_release(keycode: u32) {
    crate::ei_input::ei_key(keycode, false);
}

fn platform_get_key_state(_keycode: i32) -> bool {
    // libei is write-only — there is no key-state query on the EIS side.
    // Callers that need read-back must use the x11 variant.
    false
}

// ==================== AsyncTask wrappers ====================

pub struct PressTask(u32);
impl Task for PressTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_press(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct ReleaseTask(u32);
impl Task for ReleaseTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_release(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct GetKeyStateTask(i32);
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
