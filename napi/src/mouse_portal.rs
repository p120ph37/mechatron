// Linux portal mouse implementation.
//
// Drives input via the libei (Emulated Input) protocol over an EIS file
// descriptor obtained from the xdg-desktop-portal RemoteDesktop interface.
// Loaded by the `mechatron-mouse-portal` crate, which has no NEEDED
// shared-library deps — libei is dlopen'd lazily by ei_input.rs and the
// dbus protocol is implemented over a raw socket.  The crate ships as the
// @mechatronic/napi-mouse-portal npm package; the TS facade
// lib/napi/mouse-portal.ts imports it under the variant-neutral names
// that the rest of mechatron consumes.

use napi::bindgen_prelude::*;
use napi_derive::napi;

fn do_press(button: i32) {
    crate::ei_input::ei_button(button, true);
}

fn do_release(button: i32) {
    crate::ei_input::ei_button(button, false);
}

fn platform_scroll_h(amount: i32) {
    crate::ei_input::ei_scroll_discrete(amount, 0);
}

fn platform_scroll_v(amount: i32) {
    crate::ei_input::ei_scroll_discrete(0, -amount);
}

fn platform_get_pos() -> (i32, i32) {
    // libei is write-only — there is no pointer-position query on the EIS
    // side.  Callers that need read-back must use the x11 variant.
    (0, 0)
}

fn platform_set_pos(x: i32, y: i32) {
    crate::ei_input::ei_motion_absolute(x as f64, y as f64);
}

fn platform_get_button_state(_button: i32) -> bool {
    // libei is write-only — there is no button-state query on the EIS
    // side.  Callers that need read-back must use the x11 variant.
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
