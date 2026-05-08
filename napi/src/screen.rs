// Non-Linux screen implementation.
//
// macOS uses NSScreen (display geometry) and CGDisplay::screenshot
// (pixel capture).  Windows uses EnumDisplayMonitors / GetMonitorInfoW
// for geometry and BitBlt + GetDIBits for capture.  Both platforms
// expose a single OS-native screen-capture API with no variant
// fan-out, so this file is the only screen implementation on those
// platforms.
//
// On Linux, see ../screen_x11.rs (XRandR + XGetImage) and
// ../screen_portal.rs (xdg-desktop-portal ScreenCast + PipeWire) — the
// build system selects one of those crates per backend variant rather
// than runtime-dispatching at the language level.

// Pulled in only by the cfg-gated macOS/Windows code below.  On Linux
// this file is intentionally empty (the per-variant crates
// `mechatron-screen-x11` and `mechatron-screen-portal` carry the screen
// implementation instead).
#[cfg(any(target_os = "macos", target_os = "windows"))]
use napi::bindgen_prelude::*;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use napi_derive::napi;

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct RawScreenData {
    bx: i32, by: i32, bw: i32, bh: i32,
    ux: i32, uy: i32, uw: i32, uh: i32,
}

// =============================================================================
// platform_synchronize
// =============================================================================

#[cfg(target_os = "windows")]
fn platform_synchronize() -> Option<Vec<RawScreenData>> {
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
        return None;
    }

    // Put primary monitor first (origin at 0,0)
    raw.sort_by(|a, b| {
        let a_primary = a.0 == 0 && a.1 == 0;
        let b_primary = b.0 == 0 && b.1 == 0;
        b_primary.cmp(&a_primary)
    });

    Some(raw.iter().map(|&(bx, by, bw, bh, ux, uy, uw, uh)| {
        RawScreenData { bx, by, bw, bh, ux, uy, uw, uh }
    }).collect())
}

#[cfg(target_os = "macos")]
fn platform_synchronize() -> Option<Vec<RawScreenData>> {
    use objc2_app_kit::NSScreen;
    use objc2::MainThreadMarker;

    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let ns_screens = NSScreen::screens(mtm);
    let count = ns_screens.count();
    if count == 0 {
        return None;
    }

    let mut data = Vec::with_capacity(count);

    for i in 0..count {
        let screen = ns_screens.objectAtIndex(i);
        let frame = screen.frame();
        let visible = screen.visibleFrame();

        data.push(RawScreenData {
            bx: frame.origin.x as i32,
            by: frame.origin.y as i32,
            bw: frame.size.width as i32,
            bh: frame.size.height as i32,
            ux: visible.origin.x as i32,
            uy: visible.origin.y as i32,
            uw: visible.size.width as i32,
            uh: visible.size.height as i32,
        });
    }

    Some(data)
}

// =============================================================================
// platform_grab_screen
// =============================================================================

#[cfg(target_os = "windows")]
fn platform_grab_screen(x: i32, y: i32, w: i32, h: i32, window_handle: Option<f64>) -> Option<Vec<u32>> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::Foundation::*;

    if w <= 0 || h <= 0 {
        return None;
    }

    unsafe {
        let hwnd = match window_handle {
            Some(h) if h != 0.0 => HWND(h as isize as *mut _),
            _ => HWND::default(),
        };
        let hdc_screen = GetDC(hwnd);
        if hdc_screen.is_invalid() {
            return None;
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

        Some(buf)
    }
}

#[cfg(target_os = "macos")]
fn platform_grab_screen(x: i32, y: i32, w: i32, h: i32, window_handle: Option<f64>) -> Option<Vec<u32>> {
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
        return None;
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
        None => return None,
    };

    let iw = image.width();
    let ih = image.height();
    if iw == 0 || ih == 0 {
        return None;
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
            return None;
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

    Some(pixels)
}

// =============================================================================
// AsyncTask wrappers
// =============================================================================

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct SynchronizeTask;
#[cfg(any(target_os = "macos", target_os = "windows"))]
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct GrabScreenTask {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    window_handle: Option<f64>,
}
#[cfg(any(target_os = "macos", target_os = "windows"))]
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct GetPortalTokenTask;
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for GetPortalTokenTask {
    type Output = Option<String>;
    type JsValue = Option<String>;
    fn compute(&mut self) -> Result<Self::Output> {
        // Portal token persistence is portal-only — no-op on macOS/Windows.
        Ok(None)
    }
    fn resolve(&mut self, _env: Env, out: Self::Output) -> Result<Self::JsValue> {
        Ok(out)
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct SetPortalTokenTask {
    _token: String,
}
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for SetPortalTokenTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> {
        // Portal token persistence is portal-only — no-op on macOS/Windows.
        Ok(())
    }
    fn resolve(&mut self, _env: Env, _: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

// =============================================================================
// Exported napi functions
// =============================================================================

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "screen_synchronize")]
pub fn screen_synchronize() -> AsyncTask<SynchronizeTask> {
    AsyncTask::new(SynchronizeTask)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "screen_grabScreen")]
pub fn screen_grab_screen(
    x: i32, y: i32, w: i32, h: i32,
    window_handle: Option<f64>,
) -> AsyncTask<GrabScreenTask> {
    AsyncTask::new(GrabScreenTask { x, y, w, h, window_handle })
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "screen_getPortalToken")]
pub fn screen_get_portal_token() -> AsyncTask<GetPortalTokenTask> {
    AsyncTask::new(GetPortalTokenTask)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "screen_setPortalToken")]
pub fn screen_set_portal_token(token: String) -> AsyncTask<SetPortalTokenTask> {
    AsyncTask::new(SetPortalTokenTask { _token: token })
}
