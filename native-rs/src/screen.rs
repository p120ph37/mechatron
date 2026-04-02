use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::ffi::{c_int, c_long, c_ulong, c_void};
use std::ptr;

use crate::x11::*;

// Cached screen data from last synchronize
struct ScreenInfo {
    bounds: (i32, i32, i32, i32),
    usable: (i32, i32, i32, i32),
}

static mut SCREENS: Vec<ScreenInfo> = Vec::new();
static mut TOTAL_BOUNDS: (i32, i32, i32, i32) = (0, 0, 0, 0);
static mut TOTAL_USABLE: (i32, i32, i32, i32) = (0, 0, 0, 0);

// Union two bounds (x, y, w, h)
fn union_bounds(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> (i32, i32, i32, i32) {
    if a.2 == 0 && a.3 == 0 { return b; }
    if b.2 == 0 && b.3 == 0 { return a; }
    let l = a.0.min(b.0);
    let t = a.1.min(b.1);
    let r = (a.0 + a.2).max(b.0 + b.2);
    let bot = (a.1 + a.3).max(b.1 + b.3);
    (l, t, r - l, bot - t)
}

fn intersects(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> bool {
    a.0 < b.0 + b.2 && a.0 + a.2 > b.0 && a.1 < b.1 + b.3 && a.1 + a.3 > b.1
}

fn intersect_bounds(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> (i32, i32, i32, i32) {
    let l = a.0.max(b.0);
    let t = a.1.max(b.1);
    let r = (a.0 + a.2).min(b.0 + b.2);
    let bot = (a.1 + a.3).min(b.1 + b.3);
    if r > l && bot > t { (l, t, r - l, bot - t) } else { (0, 0, 0, 0) }
}

#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize(env: Env) -> Result<Either<napi::JsObject, napi::JsNull>> {
    unsafe {
        SCREENS.clear();
        TOTAL_BOUNDS = (0, 0, 0, 0);
        TOTAL_USABLE = (0, 0, 0, 0);

        let display = get_display();
        if display.is_null() {
            return Ok(Either::B(env.get_null()?));
        }

        let _xe = XDismissErrors::new();

        let net_workarea = XInternAtom(display, b"_NET_WORKAREA\0".as_ptr() as _, True_);
        let count = XScreenCount(display);
        let mut used_xinerama = false;

        // Try Xinerama first (only when single logical X screen with Xinerama active)
        if count == 1 && is_xinerama_available() && XineramaIsActive(display) == True_ {
            let mut xine_count: c_int = 0;
            let info = XineramaQueryScreens(display, &mut xine_count);
            if !info.is_null() && xine_count > 0 {
                for i in 0..xine_count as usize {
                    let si = &*info.add(i);
                    let bounds = (si.x_org as i32, si.y_org as i32, si.width as i32, si.height as i32);

                    // Merge cloned/mirrored screens
                    if let Some(last) = SCREENS.last_mut() {
                        if intersects(last.bounds, bounds) {
                            let la = last.bounds.2 * last.bounds.3;
                            let ba = bounds.2 * bounds.3;
                            if ba > la {
                                last.bounds = bounds;
                                last.usable = bounds;
                            }
                            continue;
                        }
                    }
                    SCREENS.push(ScreenInfo { bounds, usable: bounds });
                }
                XFree(info as *mut c_void);
                used_xinerama = true;
            }
        }

        // Fallback: traditional multi-screen
        if SCREENS.is_empty() {
            let primary = XDefaultScreen(display);
            for i in 0..count {
                let screen = XScreenOfDisplay(display, i);
                let w = XWidthOfScreen(screen);
                let h = XHeightOfScreen(screen);
                let bounds = (0, 0, w, h);
                let si = ScreenInfo { bounds, usable: bounds };
                if i == primary {
                    SCREENS.insert(0, si);
                } else {
                    SCREENS.push(si);
                }
            }
        }

        // Try to get usable work area from _NET_WORKAREA
        if net_workarea != None_ {
            for i in 0..SCREENS.len() {
                let root_screen = if used_xinerama { XDefaultScreen(display) } else { i as c_int };
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
                    SCREENS[i].usable = if used_xinerama {
                        intersect_bounds(u, SCREENS[i].bounds)
                    } else {
                        u
                    };
                }
                if !result.is_null() { XFree(result as *mut c_void); }
            }
        }

        if SCREENS.is_empty() {
            return Ok(Either::B(env.get_null()?));
        }

        // Compute totals
        for s in SCREENS.iter() {
            TOTAL_BOUNDS = union_bounds(TOTAL_BOUNDS, s.bounds);
            TOTAL_USABLE = union_bounds(TOTAL_USABLE, s.usable);
        }

        // Build JS result array
        let mut arr = env.create_array(SCREENS.len() as u32)?;
        for (i, s) in SCREENS.iter().enumerate() {
            let mut obj = env.create_object()?;
            let mut bo = env.create_object()?;
            bo.set("x", s.bounds.0)?;
            bo.set("y", s.bounds.1)?;
            bo.set("w", s.bounds.2)?;
            bo.set("h", s.bounds.3)?;
            let mut uo = env.create_object()?;
            uo.set("x", s.usable.0)?;
            uo.set("y", s.usable.1)?;
            uo.set("w", s.usable.2)?;
            uo.set("h", s.usable.3)?;
            obj.set("bounds", bo)?;
            obj.set("usable", uo)?;
            arr.set(i as u32, obj)?;
        }
        Ok(Either::A(arr.coerce_to_object()?))
    }
}

#[napi(js_name = "screen_grabScreen")]
pub fn screen_grab_screen(
    env: Env,
    x: i32, y: i32, w: i32, h: i32,
    window_handle: Option<f64>,
) -> Result<Either<Uint32Array, napi::JsNull>> {
    unsafe {
        let display = get_display();
        if display.is_null() || w <= 0 || h <= 0 {
            return Ok(Either::B(env.get_null()?));
        }
        let _xe = XDismissErrors::new();

        let win = match window_handle {
            Some(h) if h != 0.0 => h as Window,
            _ => XDefaultRootWindow(display),
        };

        let img = XGetImage(display, win, x, y, w as u32, h as u32, AllPlanes, ZPixmap);
        if img.is_null() {
            return Ok(Either::B(env.get_null()?));
        }

        let iw = (*img).width;
        let ih = (*img).height;
        if iw <= 0 || ih <= 0 {
            XDestroyImage(img);
            return Ok(Either::B(env.get_null()?));
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
                // ARGB format matching C++ (Alpha=255, R, G, B)
                pixels[(yy * iw + xx) as usize] = 0xFF000000 | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32);
            }
        }
        XDestroyImage(img);

        Ok(Either::A(Uint32Array::new(pixels)))
    }
}

#[napi(js_name = "screen_isCompositing")]
pub fn screen_is_compositing() -> bool {
    true // Always true on Linux (matching C++ behavior)
}

#[napi(js_name = "screen_setCompositing")]
pub fn screen_set_compositing(_enabled: bool) {
    // No-op on Linux (matching C++ behavior)
}

#[napi(js_name = "screen_getTotalBounds")]
pub fn screen_get_total_bounds(env: Env) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        obj.set("x", TOTAL_BOUNDS.0)?;
        obj.set("y", TOTAL_BOUNDS.1)?;
        obj.set("w", TOTAL_BOUNDS.2)?;
        obj.set("h", TOTAL_BOUNDS.3)?;
    }
    Ok(obj)
}

#[napi(js_name = "screen_getTotalUsable")]
pub fn screen_get_total_usable(env: Env) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        obj.set("x", TOTAL_USABLE.0)?;
        obj.set("y", TOTAL_USABLE.1)?;
        obj.set("w", TOTAL_USABLE.2)?;
        obj.set("h", TOTAL_USABLE.3)?;
    }
    Ok(obj)
}
