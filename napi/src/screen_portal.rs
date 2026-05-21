// Linux portal screen implementation.
//
// Acquires a ScreenCast session via the xdg-desktop-portal ScreenCast
// interface and pulls frames from the resulting PipeWire stream.
// Links libdbus-1 (portal handshake) and libpipewire-0.3 (frame capture)
// explicitly — if either is absent the binary fails to load and the
// napi resolver falls through to the next variant.
//
// Loaded by the `mechatron-screen-portal` crate, which exposes the
// resulting #[napi] functions through the @mechatronic/napi-screen npm
// package.  The TS facade lib/napi/screen-portal.ts imports those
// exports under the variant-neutral names that the rest of mechatron
// consumes.

use napi::bindgen_prelude::*;
use napi_derive::napi;

pub struct RawScreenData {
    bx: i32, by: i32, bw: i32, bh: i32,
    ux: i32, uy: i32, uw: i32, uh: i32,
}

fn platform_synchronize() -> Option<Vec<RawScreenData>> {
    let monitors = crate::screencast::get_monitors()?;
    let data: Vec<RawScreenData> = monitors.iter().map(|&(mx, my, mw, mh)| {
        RawScreenData {
            bx: mx, by: my, bw: mw as i32, bh: mh as i32,
            ux: mx, uy: my, uw: mw as i32, uh: mh as i32,
        }
    }).collect();
    if data.is_empty() { None } else { Some(data) }
}

fn platform_grab_screen(x: i32, y: i32, w: i32, h: i32, _window_handle: Option<f64>) -> Option<Vec<u32>> {
    if w <= 0 || h <= 0 {
        return None;
    }
    crate::screencast::grab_frame(x, y, w, h)
}

fn platform_get_portal_token() -> Option<String> {
    crate::screencast::get_token()
}

fn platform_set_portal_token(token: Option<String>) {
    crate::screencast::set_token(token);
}

// =============================================================================
// AsyncTask wrappers
// =============================================================================

pub struct SynchronizeTask;
impl Task for SynchronizeTask {
    type Output = Option<Vec<RawScreenData>>;
    type JsValue = Either<napi::JsObject, napi::JsNull>;
    fn compute(&mut self) -> Result<Self::Output> {
        Ok(platform_synchronize())
    }
    fn resolve(&mut self, env: Env, data: Self::Output) -> Result<Self::JsValue> {
        match data {
            None => Ok(Either::B(env.get_null()?)),
            Some(screens) => {
                let mut arr = env.create_array(screens.len() as u32)?;
                for (i, s) in screens.iter().enumerate() {
                    let mut obj = env.create_object()?;
                    let mut bo = env.create_object()?;
                    bo.set("x", s.bx)?;
                    bo.set("y", s.by)?;
                    bo.set("w", s.bw)?;
                    bo.set("h", s.bh)?;
                    let mut uo = env.create_object()?;
                    uo.set("x", s.ux)?;
                    uo.set("y", s.uy)?;
                    uo.set("w", s.uw)?;
                    uo.set("h", s.uh)?;
                    obj.set("bounds", bo)?;
                    obj.set("usable", uo)?;
                    arr.set(i as u32, obj)?;
                }
                Ok(Either::A(arr.coerce_to_object()?))
            }
        }
    }
}

pub struct GrabScreenTask {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    window_handle: Option<f64>,
}
impl Task for GrabScreenTask {
    type Output = Option<Vec<u32>>;
    type JsValue = Either<Uint32Array, napi::JsNull>;
    fn compute(&mut self) -> Result<Self::Output> {
        Ok(platform_grab_screen(self.x, self.y, self.w, self.h, self.window_handle))
    }
    fn resolve(&mut self, env: Env, data: Self::Output) -> Result<Self::JsValue> {
        match data {
            None => Ok(Either::B(env.get_null()?)),
            Some(pixels) => Ok(Either::A(Uint32Array::new(pixels))),
        }
    }
}

pub struct GetPortalTokenTask;
impl Task for GetPortalTokenTask {
    type Output = Option<String>;
    type JsValue = Either<String, napi::JsNull>;
    fn compute(&mut self) -> Result<Self::Output> {
        Ok(platform_get_portal_token())
    }
    fn resolve(&mut self, env: Env, out: Self::Output) -> Result<Self::JsValue> {
        match out {
            Some(s) => Ok(Either::A(s)),
            None => Ok(Either::B(env.get_null()?)),
        }
    }
}

pub struct SetPortalTokenTask {
    token: Option<String>,
}
impl Task for SetPortalTokenTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> {
        platform_set_portal_token(self.token.clone());
        Ok(())
    }
    fn resolve(&mut self, _env: Env, _: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize() -> AsyncTask<SynchronizeTask> {
    AsyncTask::new(SynchronizeTask)
}

#[napi(js_name = "screen_grabScreen")]
pub fn screen_grab_screen(
    x: i32, y: i32, w: i32, h: i32,
    window_handle: Option<f64>,
) -> AsyncTask<GrabScreenTask> {
    AsyncTask::new(GrabScreenTask { x, y, w, h, window_handle })
}

#[napi(js_name = "screen_getPortalToken")]
pub fn screen_get_portal_token() -> AsyncTask<GetPortalTokenTask> {
    AsyncTask::new(GetPortalTokenTask)
}

#[napi(js_name = "screen_setPortalToken")]
pub fn screen_set_portal_token(token: Option<String>) -> AsyncTask<SetPortalTokenTask> {
    AsyncTask::new(SetPortalTokenTask { token })
}
