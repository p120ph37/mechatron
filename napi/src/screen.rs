use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg(target_os = "linux")]
use std::ffi::{c_int, c_long, c_ulong, c_void};
#[cfg(target_os = "linux")]
use std::ptr;

#[cfg(target_os = "linux")]
use crate::x11::*;

type Rect = (i32, i32, i32, i32);

#[cfg(target_os = "linux")]
fn intersects(a: Rect, b: Rect) -> bool {
    a.0 < b.0 + b.2 && a.0 + a.2 > b.0 && a.1 < b.1 + b.3 && a.1 + a.3 > b.1
}

#[cfg(target_os = "linux")]
fn intersect_bounds(a: Rect, b: Rect) -> Rect {
    let l = a.0.max(b.0);
    let t = a.1.max(b.1);
    let r = (a.0 + a.2).min(b.0 + b.2);
    let bot = (a.1 + a.3).min(b.1 + b.3);
    if r > l && bot > t { (l, t, r - l, bot - t) } else { (0, 0, 0, 0) }
}

// =============================================================================
// screen_synchronize
// =============================================================================

#[cfg(target_os = "linux")]
#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize(env: Env) -> Result<Either<napi::JsObject, napi::JsNull>> {
    let mut screens: Vec<(Rect, Rect)> = Vec::new();

    unsafe {
        let display = get_display();
        if display.is_null() {
            return Ok(Either::B(env.get_null()?));
        }

        let _xe = XDismissErrors::new();

        let net_workarea = XInternAtom(display, b"_NET_WORKAREA\0".as_ptr() as _, True_);
        let count = XScreenCount(display);
        let mut used_xrandr = false;

        // XRandR (RandR 1.5 XRRGetMonitors) replaces the older Xinerama
        // query.  Unlike Xinerama, it returns a primary-monitor flag and
        // per-monitor name atom; we only consume the geometry here but
        // the richer data is available for future callers.  get_active=1
        // filters out disabled outputs so we don't enumerate monitors
        // that aren't currently driving a display.
        if is_xrandr_available() {
            let root = XDefaultRootWindow(display);
            let mut n: c_int = 0;
            let info = XRRGetMonitors(display, root, True_, &mut n);
            if !info.is_null() && n > 0 {
                // XRandR reports primary via a flag; place it at index 0 to
                // match the Windows/macOS convention and the legacy
                // Xinerama+XDefaultScreen behaviour.
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
            // Under XRandR every monitor shares the single X screen returned
            // by XDefaultScreen; no point calling it once per iteration.
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
        return Ok(Either::B(env.get_null()?));
    }

    let mut arr = env.create_array(screens.len() as u32)?;
    for (i, &(bounds, usable)) in screens.iter().enumerate() {
        let mut obj = env.create_object()?;
        let mut bo = env.create_object()?;
        bo.set("x", bounds.0)?;
        bo.set("y", bounds.1)?;
        bo.set("w", bounds.2)?;
        bo.set("h", bounds.3)?;
        let mut uo = env.create_object()?;
        uo.set("x", usable.0)?;
        uo.set("y", usable.1)?;
        uo.set("w", usable.2)?;
        uo.set("h", usable.3)?;
        obj.set("bounds", bo)?;
        obj.set("usable", uo)?;
        arr.set(i as u32, obj)?;
    }

    Ok(Either::A(arr.coerce_to_object()?))
}

#[cfg(target_os = "windows")]
#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize(env: Env) -> Result<Either<napi::JsObject, napi::JsNull>> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::Foundation::*;

    unsafe extern "system" fn enum_proc(
        hmon: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let monitors = &mut *(lparam.0 as *mut Vec<(i32, i32, i32, i32, i32, i32, i32, i32)>);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let b = mi.rcMonitor;
            let w = mi.rcWork;
            monitors.push((
                b.left, b.top, b.right - b.left, b.bottom - b.top,
                w.left, w.top, w.right - w.left, w.bottom - w.top,
            ));
        }
        TRUE
    }

    let mut raw: Vec<(i32, i32, i32, i32, i32, i32, i32, i32)> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(enum_proc),
            LPARAM(&mut raw as *mut _ as isize),
        );
    }

    if raw.is_empty() {
        return Ok(Either::B(env.get_null()?));
    }

    // Put primary monitor first (origin at 0,0)
    raw.sort_by(|a, b| {
        let a_primary = a.0 == 0 && a.1 == 0;
        let b_primary = b.0 == 0 && b.1 == 0;
        b_primary.cmp(&a_primary)
    });

    let mut arr = env.create_array(raw.len() as u32)?;
    for (i, &(bx, by, bw, bh, ux, uy, uw, uh)) in raw.iter().enumerate() {
        let mut obj = env.create_object()?;
        let mut bo = env.create_object()?;
        bo.set("x", bx)?;
        bo.set("y", by)?;
        bo.set("w", bw)?;
        bo.set("h", bh)?;
        let mut uo = env.create_object()?;
        uo.set("x", ux)?;
        uo.set("y", uy)?;
        uo.set("w", uw)?;
        uo.set("h", uh)?;
        obj.set("bounds", bo)?;
        obj.set("usable", uo)?;
        arr.set(i as u32, obj)?;
    }

    Ok(Either::A(arr.coerce_to_object()?))
}

#[cfg(target_os = "macos")]
#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize(env: Env) -> Result<Either<napi::JsObject, napi::JsNull>> {
    use objc2_app_kit::NSScreen;
    use objc2::MainThreadMarker;

    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let ns_screens = NSScreen::screens(mtm);
    let count = ns_screens.count();
    if count == 0 {
        return Ok(Either::B(env.get_null()?));
    }

    let mut arr = env.create_array(count as u32)?;

    for i in 0..count {
        let screen = ns_screens.objectAtIndex(i);
        let frame = screen.frame();
        let visible = screen.visibleFrame();

        let fx = frame.origin.x as i32;
        let fy = frame.origin.y as i32;
        let fw = frame.size.width as i32;
        let fh = frame.size.height as i32;
        let vx = visible.origin.x as i32;
        let vy = visible.origin.y as i32;
        let vw = visible.size.width as i32;
        let vh = visible.size.height as i32;

        let mut bo = env.create_object()?;
        bo.set("x", fx)?;
        bo.set("y", fy)?;
        bo.set("w", fw)?;
        bo.set("h", fh)?;

        let mut uo = env.create_object()?;
        uo.set("x", vx)?;
        uo.set("y", vy)?;
        uo.set("w", vw)?;
        uo.set("h", vh)?;

        let mut obj = env.create_object()?;
        obj.set("bounds", bo)?;
        obj.set("usable", uo)?;
        arr.set(i as u32, obj)?;
    }

    Ok(Either::A(arr.coerce_to_object()?))
}

// =============================================================================
// screen_grabScreen
// =============================================================================

#[cfg(target_os = "linux")]
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
                pixels[(yy * iw + xx) as usize] = 0xFF000000 | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32);
            }
        }
        XDestroyImage(img);

        Ok(Either::A(Uint32Array::new(pixels)))
    }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "screen_grabScreen")]
pub fn screen_grab_screen(
    env: Env,
    x: i32, y: i32, w: i32, h: i32,
    window_handle: Option<f64>,
) -> Result<Either<Uint32Array, napi::JsNull>> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::Foundation::*;

    if w <= 0 || h <= 0 {
        return Ok(Either::B(env.get_null()?));
    }

    unsafe {
        let hwnd = match window_handle {
            Some(h) if h != 0.0 => HWND(h as isize as *mut _),
            _ => HWND::default(),
        };
        let hdc_screen = GetDC(hwnd);
        if hdc_screen.is_invalid() {
            return Ok(Either::B(env.get_null()?));
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbmp = CreateCompatibleBitmap(hdc_screen, w, h);
        let old = SelectObject(hdc_mem, hbmp);

        let _ = BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, x, y, SRCCOPY);

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0, // BI_RGB
                ..Default::default()
            },
            ..Default::default()
        };

        let len = (w * h) as usize;
        let mut buf = vec![0u32; len];
        GetDIBits(
            hdc_mem,
            hbmp,
            0,
            h as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old);
        let _ = DeleteObject(hbmp);
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(hwnd, hdc_screen);

        Ok(Either::A(Uint32Array::new(buf)))
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "screen_grabScreen")]
pub fn screen_grab_screen(
    env: Env,
    x: i32, y: i32, w: i32, h: i32,
    window_handle: Option<f64>,
) -> Result<Either<Uint32Array, napi::JsNull>> {
    use core_graphics::display::*;
    use core_graphics::geometry::{CGPoint, CGSize, CGRect};

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGBitmapContextCreate(
            data: *mut std::ffi::c_void,
            width: usize,
            height: usize,
            bits_per_component: usize,
            bytes_per_row: usize,
            space: *mut std::ffi::c_void,
            bitmap_info: u32,
        ) -> *mut std::ffi::c_void;
        fn CGContextDrawImage(
            context: *mut std::ffi::c_void,
            rect: CGRect,
            image: *mut std::ffi::c_void,
        );
        fn CGContextFlush(context: *mut std::ffi::c_void);
        fn CGContextRelease(context: *mut std::ffi::c_void);
        fn CGColorSpaceCreateDeviceRGB() -> *mut std::ffi::c_void;
        fn CGColorSpaceRelease(space: *mut std::ffi::c_void);
    }

    #[cfg(target_endian = "little")]
    const BITMAP_INFO: u32 = (2 << 12) | 2;
    #[cfg(target_endian = "big")]
    const BITMAP_INFO: u32 = (4 << 12) | 2;

    if w <= 0 || h <= 0 {
        return Ok(Either::B(env.get_null()?));
    }

    let rect = CGRect::new(
        &CGPoint::new(x as f64, y as f64),
        &CGSize::new(w as f64, h as f64),
    );

    let window_id = window_handle
        .filter(|&h| h != 0.0)
        .map(|h| h as u32)
        .unwrap_or(kCGNullWindowID);

    let list_option = if window_id != kCGNullWindowID {
        kCGWindowListOptionIncludingWindow
    } else {
        kCGWindowListOptionOnScreenOnly
    };

    let image = CGDisplay::screenshot(
        rect,
        list_option,
        window_id,
        kCGWindowImageBoundsIgnoreFraming,
    );

    let image = match image {
        Some(img) => img,
        None => return Ok(Either::B(env.get_null()?)),
    };

    let iw = image.width();
    let ih = image.height();
    if iw == 0 || ih == 0 {
        return Ok(Either::B(env.get_null()?));
    }

    let len = iw * ih;
    let mut pixels = vec![0u32; len];

    unsafe {
        let color_space = CGColorSpaceCreateDeviceRGB();
        let context = CGBitmapContextCreate(
            pixels.as_mut_ptr() as *mut std::ffi::c_void,
            iw,
            ih,
            8,
            iw * 4,
            color_space,
            BITMAP_INFO,
        );
        CGColorSpaceRelease(color_space);

        if context.is_null() {
            return Ok(Either::B(env.get_null()?));
        }

        let draw_rect = CGRect::new(
            &CGPoint::new(0.0, 0.0),
            &CGSize::new(iw as f64, ih as f64),
        );

        use foreign_types::ForeignType;
        let img_ref = image.as_ptr() as *mut std::ffi::c_void;

        CGContextDrawImage(context, draw_rect, img_ref);
        CGContextFlush(context);
        CGContextRelease(context);
    }

    Ok(Either::A(Uint32Array::new(pixels)))
}
