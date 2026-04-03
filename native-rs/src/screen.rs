use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg(target_os = "linux")]
use std::ffi::{c_int, c_long, c_ulong, c_void};
#[cfg(target_os = "linux")]
use std::ptr;

#[cfg(target_os = "linux")]
use crate::x11::*;

// Cached screen data from last synchronize
#[cfg(target_os = "linux")]
struct ScreenInfo {
    bounds: (i32, i32, i32, i32),
    usable: (i32, i32, i32, i32),
}

#[cfg(target_os = "linux")]
static mut SCREENS: Vec<ScreenInfo> = Vec::new();
#[cfg(target_os = "linux")]
static mut TOTAL_BOUNDS: (i32, i32, i32, i32) = (0, 0, 0, 0);
#[cfg(target_os = "linux")]
static mut TOTAL_USABLE: (i32, i32, i32, i32) = (0, 0, 0, 0);

// Windows cached screen data
#[cfg(target_os = "windows")]
struct WinScreenInfo {
    bounds: (i32, i32, i32, i32),
    usable: (i32, i32, i32, i32),
}

#[cfg(target_os = "windows")]
static mut WIN_SCREENS: Vec<WinScreenInfo> = Vec::new();
#[cfg(target_os = "windows")]
static mut WIN_TOTAL_BOUNDS: (i32, i32, i32, i32) = (0, 0, 0, 0);
#[cfg(target_os = "windows")]
static mut WIN_TOTAL_USABLE: (i32, i32, i32, i32) = (0, 0, 0, 0);

#[cfg(target_os = "macos")]
static mut MAC_TOTAL_BOUNDS: (i32, i32, i32, i32) = (0, 0, 0, 0);
#[cfg(target_os = "macos")]
static mut MAC_TOTAL_USABLE: (i32, i32, i32, i32) = (0, 0, 0, 0);

// Union two bounds (x, y, w, h)
#[allow(dead_code)]
fn union_bounds(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> (i32, i32, i32, i32) {
    if a.2 == 0 && a.3 == 0 { return b; }
    if b.2 == 0 && b.3 == 0 { return a; }
    let l = a.0.min(b.0);
    let t = a.1.min(b.1);
    let r = (a.0 + a.2).max(b.0 + b.2);
    let bot = (a.1 + a.3).max(b.1 + b.3);
    (l, t, r - l, bot - t)
}

#[allow(dead_code)]
fn intersects(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> bool {
    a.0 < b.0 + b.2 && a.0 + a.2 > b.0 && a.1 < b.1 + b.3 && a.1 + a.3 > b.1
}

#[allow(dead_code)]
fn intersect_bounds(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> (i32, i32, i32, i32) {
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

        if count == 1 && is_xinerama_available() && XineramaIsActive(display) == True_ {
            let mut xine_count: c_int = 0;
            let info = XineramaQueryScreens(display, &mut xine_count);
            if !info.is_null() && xine_count > 0 {
                for i in 0..xine_count as usize {
                    let si = &*info.add(i);
                    let bounds = (si.x_org as i32, si.y_org as i32, si.width as i32, si.height as i32);

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

        for s in SCREENS.iter() {
            TOTAL_BOUNDS = union_bounds(TOTAL_BOUNDS, s.bounds);
            TOTAL_USABLE = union_bounds(TOTAL_USABLE, s.usable);
        }

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

        let mut tb = env.create_object()?;
        tb.set("x", TOTAL_BOUNDS.0)?;
        tb.set("y", TOTAL_BOUNDS.1)?;
        tb.set("w", TOTAL_BOUNDS.2)?;
        tb.set("h", TOTAL_BOUNDS.3)?;
        let mut tu = env.create_object()?;
        tu.set("x", TOTAL_USABLE.0)?;
        tu.set("y", TOTAL_USABLE.1)?;
        tu.set("w", TOTAL_USABLE.2)?;
        tu.set("h", TOTAL_USABLE.3)?;

        let mut result = env.create_object()?;
        result.set("screens", arr)?;
        result.set("totalBounds", tb)?;
        result.set("totalUsable", tu)?;
        Ok(Either::A(result))
    }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize(env: Env) -> Result<Either<napi::JsObject, napi::JsNull>> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::Foundation::*;

    unsafe {
        WIN_SCREENS.clear();
        WIN_TOTAL_BOUNDS = (0, 0, 0, 0);
        WIN_TOTAL_USABLE = (0, 0, 0, 0);

        // Collect monitors via EnumDisplayMonitors with callback
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
        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(enum_proc),
            LPARAM(&mut raw as *mut _ as isize),
        );

        if raw.is_empty() {
            return Ok(Either::B(env.get_null()?));
        }

        // Put primary monitor first (origin at 0,0)
        raw.sort_by(|a, b| {
            let a_primary = a.0 == 0 && a.1 == 0;
            let b_primary = b.0 == 0 && b.1 == 0;
            b_primary.cmp(&a_primary)
        });

        for &(bx, by, bw, bh, ux, uy, uw, uh) in &raw {
            let bounds = (bx, by, bw, bh);
            let usable = (ux, uy, uw, uh);
            WIN_SCREENS.push(WinScreenInfo { bounds, usable });
            WIN_TOTAL_BOUNDS = union_bounds(WIN_TOTAL_BOUNDS, bounds);
            WIN_TOTAL_USABLE = union_bounds(WIN_TOTAL_USABLE, usable);
        }

        let mut arr = env.create_array(WIN_SCREENS.len() as u32)?;
        for (i, s) in WIN_SCREENS.iter().enumerate() {
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

        let mut tb = env.create_object()?;
        tb.set("x", WIN_TOTAL_BOUNDS.0)?;
        tb.set("y", WIN_TOTAL_BOUNDS.1)?;
        tb.set("w", WIN_TOTAL_BOUNDS.2)?;
        tb.set("h", WIN_TOTAL_BOUNDS.3)?;
        let mut tu = env.create_object()?;
        tu.set("x", WIN_TOTAL_USABLE.0)?;
        tu.set("y", WIN_TOTAL_USABLE.1)?;
        tu.set("w", WIN_TOTAL_USABLE.2)?;
        tu.set("h", WIN_TOTAL_USABLE.3)?;

        let mut result = env.create_object()?;
        result.set("screens", arr)?;
        result.set("totalBounds", tb)?;
        result.set("totalUsable", tu)?;
        Ok(Either::A(result))
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize(env: Env) -> Result<Either<napi::JsObject, napi::JsNull>> {
    use objc2_app_kit::NSScreen;
    use objc2::MainThreadMarker;

    unsafe {
        let mtm = MainThreadMarker::new_unchecked();
        let screens = NSScreen::screens(mtm);
        let count = screens.count();
        if count == 0 {
            return Ok(Either::B(env.get_null()?));
        }

        let mut b_min_x = i32::MAX;
        let mut b_min_y = i32::MAX;
        let mut b_max_x = i32::MIN;
        let mut b_max_y = i32::MIN;
        let mut u_min_x = i32::MAX;
        let mut u_min_y = i32::MAX;
        let mut u_max_x = i32::MIN;
        let mut u_max_y = i32::MIN;

        let mut arr = env.create_array(count as u32)?;

        for i in 0..count {
            let screen = screens.objectAtIndex(i);
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

            b_min_x = b_min_x.min(fx);
            b_min_y = b_min_y.min(fy);
            b_max_x = b_max_x.max(fx + fw);
            b_max_y = b_max_y.max(fy + fh);
            u_min_x = u_min_x.min(vx);
            u_min_y = u_min_y.min(vy);
            u_max_x = u_max_x.max(vx + vw);
            u_max_y = u_max_y.max(vy + vh);

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

        MAC_TOTAL_BOUNDS = (b_min_x, b_min_y, b_max_x - b_min_x, b_max_y - b_min_y);
        MAC_TOTAL_USABLE = (u_min_x, u_min_y, u_max_x - u_min_x, u_max_y - u_min_y);

        let mut tb = env.create_object()?;
        tb.set("x", MAC_TOTAL_BOUNDS.0)?;
        tb.set("y", MAC_TOTAL_BOUNDS.1)?;
        tb.set("w", MAC_TOTAL_BOUNDS.2)?;
        tb.set("h", MAC_TOTAL_BOUNDS.3)?;
        let mut tu = env.create_object()?;
        tu.set("x", MAC_TOTAL_USABLE.0)?;
        tu.set("y", MAC_TOTAL_USABLE.1)?;
        tu.set("w", MAC_TOTAL_USABLE.2)?;
        tu.set("h", MAC_TOTAL_USABLE.3)?;

        let mut result = env.create_object()?;
        result.set("screens", arr)?;
        result.set("totalBounds", tb)?;
        result.set("totalUsable", tu)?;
        Ok(Either::A(result))
    }
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
            Some(h) if h != 0.0 => HWND(h as *mut _),
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

        // Read pixel data using GetDIBits
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

    // kCGBitmapByteOrder32Host | kCGImageAlphaPremultipliedFirst
    #[cfg(target_endian = "little")]
    const BITMAP_INFO: u32 = (2 << 12) | 2; // kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst
    #[cfg(target_endian = "big")]
    const BITMAP_INFO: u32 = (4 << 12) | 2; // kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedFirst

    if w <= 0 || h <= 0 {
        return Ok(Either::B(env.get_null()?));
    }

    let rect = CGRect::new(
        &CGPoint::new(x as f64, y as f64),
        &CGSize::new(w as f64, h as f64),
    );

    // Determine window ID and capture option
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

    // Use CGBitmapContextCreate + CGContextDrawImage to extract pixels,
    // matching the C++ implementation exactly.
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

        // CGImage is stored as a CFType; get the raw pointer for FFI
        use core_foundation::base::TCFType;
        let img_ref = image.as_concrete_TypeRef() as *mut std::ffi::c_void;

        CGContextDrawImage(context, draw_rect, img_ref);
        CGContextFlush(context);
        CGContextRelease(context);
    }

    Ok(Either::A(Uint32Array::new(pixels)))
}

// =============================================================================
// screen_isCompositing
// =============================================================================

#[cfg(target_os = "linux")]
#[napi(js_name = "screen_isCompositing")]
pub fn screen_is_compositing() -> bool {
    true
}

#[cfg(target_os = "windows")]
#[napi(js_name = "screen_isCompositing")]
pub fn screen_is_compositing() -> bool {
    // DWM is always enabled on Windows 8+
    unsafe {
        match windows::Win32::Graphics::Dwm::DwmIsCompositionEnabled() {
            Ok(enabled) => enabled.as_bool(),
            Err(_) => true,
        }
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "screen_isCompositing")]
pub fn screen_is_compositing() -> bool {
    true // macOS always uses Quartz Compositor
}

// =============================================================================
// screen_setCompositing
// =============================================================================

#[napi(js_name = "screen_setCompositing")]
pub fn screen_set_compositing(_enabled: bool) {
    // No-op on all platforms
}

