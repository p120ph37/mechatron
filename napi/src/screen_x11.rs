// Linux x11 screen implementation.
//
// Uses XRandR (XRRGetMonitors) for display geometry and XGetImage for
// pixel capture, both over an Xlib display connection.  Loaded by the
// `mechatron-screen-x11` crate, which links libX11/libXrandr and
// exposes the resulting #[napi] functions through the
// @mechatronic/napi-screen npm package.  The TS facade
// lib/napi/screen-x11.ts imports those exports under the variant-neutral
// names that the rest of mechatron consumes.
//
// Portal token persistence (screen_getPortalToken / screen_setPortalToken)
// lives in screen_portal.rs only — the matrix marks those functions as
// `skip` on linux-napi[x11].

use napi::bindgen_prelude::*;
use napi_derive::napi;

use std::ffi::{c_int, c_long, c_ulong, c_void};
use std::ptr;

use crate::x11::*;

type Rect = (i32, i32, i32, i32);

pub struct RawScreenData {
    bx: i32, by: i32, bw: i32, bh: i32,
    ux: i32, uy: i32, uw: i32, uh: i32,
}

fn intersect_bounds(a: Rect, b: Rect) -> Rect {
    let l = a.0.max(b.0);
    let t = a.1.max(b.1);
    let r = (a.0 + a.2).min(b.0 + b.2);
    let bot = (a.1 + a.3).min(b.1 + b.3);
    if r > l && bot > t { (l, t, r - l, bot - t) } else { (0, 0, 0, 0) }
}

fn platform_synchronize() -> Option<Vec<RawScreenData>> {
    let mut screens: Vec<(Rect, Rect)> = Vec::new();

    unsafe {
        let display = get_display();
        if display.is_null() {
            return None;
        }

        let _xe = XDismissErrors::new();

        let net_workarea = XInternAtom(display, b"_NET_WORKAREA\0".as_ptr() as _, True_);
        let count = XScreenCount(display);
        let mut used_xrandr = false;

        if is_xrandr_available() {
            let root = XDefaultRootWindow(display);
            let mut n: c_int = 0;
            let info = XRRGetMonitors(display, root, True_, &mut n);
            if !info.is_null() && n > 0 {
                let mut primary_seen = false;
                for i in 0..n as usize {
                    let mi = &*info.add(i);
                    let bounds = (mi.x, mi.y, mi.width, mi.height);
                    if mi.primary != 0 && !primary_seen {
                        screens.insert(0, (bounds, bounds));
                        primary_seen = true;
                    } else {
                        screens.push((bounds, bounds));
                    }
                }
                XRRFreeMonitors(info);
                used_xrandr = true;
            }
        }

        if screens.is_empty() {
            let primary = XDefaultScreen(display);
            for i in 0..count {
                let screen = XScreenOfDisplay(display, i);
                let w = XWidthOfScreen(screen);
                let h = XHeightOfScreen(screen);
                let bounds = (0, 0, w, h);
                if i == primary {
                    screens.insert(0, (bounds, bounds));
                } else {
                    screens.push((bounds, bounds));
                }
            }
        }

        if net_workarea != None_ {
            let default_screen = if used_xrandr { XDefaultScreen(display) } else { -1 };
            for i in 0..screens.len() {
                let root_screen = if used_xrandr { default_screen } else { i as c_int };
                let win = XRootWindow(display, root_screen);

                let mut type_: Atom = 0;
                let mut format: c_int = 0;
                let mut n_items: c_ulong = 0;
                let mut bytes_after: c_ulong = 0;
                let mut result: *mut u8 = ptr::null_mut();

                let status = XGetWindowProperty(
                    display, win, net_workarea, 0, 4, False_, AnyPropertyType,
                    &mut type_, &mut format, &mut n_items, &mut bytes_after, &mut result,
                );

                if status == 0 && !result.is_null() && type_ == XA_CARDINAL && format == 32 && n_items == 4 {
                    let usable = result as *const c_long;
                    let u = (
                        *usable.add(0) as i32,
                        *usable.add(1) as i32,
                        *usable.add(2) as i32,
                        *usable.add(3) as i32,
                    );
                    screens[i].1 = if used_xrandr {
                        intersect_bounds(u, screens[i].0)
                    } else {
                        u
                    };
                }
                if !result.is_null() { XFree(result as *mut c_void); }
            }
        }
    }

    if screens.is_empty() {
        return None;
    }

    Some(screens.iter().map(|&(bounds, usable)| {
        RawScreenData {
            bx: bounds.0, by: bounds.1, bw: bounds.2, bh: bounds.3,
            ux: usable.0, uy: usable.1, uw: usable.2, uh: usable.3,
        }
    }).collect())
}

fn platform_grab_screen(x: i32, y: i32, w: i32, h: i32, window_handle: Option<f64>) -> Option<Vec<u32>> {
    if w <= 0 || h <= 0 {
        return None;
    }

    unsafe {
        let display = get_display();
        if display.is_null() {
            return None;
        }
        let _xe = XDismissErrors::new();

        let win = match window_handle {
            Some(h) if h != 0.0 => h as Window,
            _ => XDefaultRootWindow(display),
        };

        let img = XGetImage(display, win, x, y, w as u32, h as u32, AllPlanes, ZPixmap);
        if img.is_null() {
            return None;
        }

        let iw = (*img).width;
        let ih = (*img).height;
        if iw <= 0 || ih <= 0 {
            XDestroyImage(img);
            return None;
        }

        let len = (iw * ih) as usize;
        let mut pixels = vec![0u32; len];
        let red_mask = (*img).red_mask;
        let green_mask = (*img).green_mask;
        let blue_mask = (*img).blue_mask;

        for yy in 0..ih {
            for xx in 0..iw {
                let pixel = XGetPixel(img, xx, yy);
                let r = ((pixel & red_mask) >> 16) as u8;
                let g = ((pixel & green_mask) >> 8) as u8;
                let b = (pixel & blue_mask) as u8;
                pixels[(yy * iw + xx) as usize] = 0xFF000000 | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32);
            }
        }
        XDestroyImage(img);

        Some(pixels)
    }
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
