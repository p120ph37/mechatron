use napi::bindgen_prelude::*;
use napi::Either;
use napi_derive::napi;

#[napi(object)]
pub struct ClipboardImage {
    pub width: u32,
    pub height: u32,
    pub data: Uint32Array,
}

// =============================================================================
// Linux stubs — no clipboard manager on X11, all operations return false/empty.
// =============================================================================

#[cfg(target_os = "linux")]
fn platform_clear() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn platform_has_text() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn platform_get_text() -> String {
    String::new()
}

#[cfg(target_os = "linux")]
fn platform_set_text(_text: &str) -> bool {
    false
}

#[cfg(target_os = "linux")]
fn platform_has_image() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn platform_get_image() -> Option<(u32, u32, Vec<u32>)> {
    None
}

#[cfg(target_os = "linux")]
fn platform_set_image(_width: u32, _height: u32, _data: &[u32]) -> bool {
    false
}

#[cfg(target_os = "linux")]
fn platform_get_sequence() -> f64 {
    0.0
}

// =============================================================================
// macOS — NSPasteboard via objc2/objc2-app-kit
// =============================================================================

#[cfg(target_os = "macos")]
use objc2_app_kit::NSPasteboard;
#[cfg(target_os = "macos")]
use objc2::AnyThread;
#[cfg(target_os = "macos")]
use objc2_foundation::{NSCopying, NSString};

#[cfg(target_os = "macos")]
fn pasteboard_type_string() -> &'static NSString {
    // NSPasteboardTypeString is "public.utf8-plain-text"
    unsafe { objc2_app_kit::NSPasteboardTypeString }
}

#[cfg(target_os = "macos")]
fn platform_clear() -> bool {
    unsafe {
        let board = NSPasteboard::generalPasteboard();
        board.clearContents();
        true
    }
}

#[cfg(target_os = "macos")]
fn platform_has_text() -> bool {
    unsafe {
        let board = NSPasteboard::generalPasteboard();
        let types = objc2_foundation::NSArray::from_retained_slice(&[
            pasteboard_type_string().copy(),
        ]);
        board.availableTypeFromArray(&types).is_some()
    }
}

#[cfg(target_os = "macos")]
fn platform_get_text() -> String {
    unsafe {
        let board = NSPasteboard::generalPasteboard();
        match board.stringForType(pasteboard_type_string()) {
            Some(s) => s.to_string(),
            None => String::new(),
        }
    }
}

#[cfg(target_os = "macos")]
fn platform_set_text(text: &str) -> bool {
    unsafe {
        let board = NSPasteboard::generalPasteboard();
        board.clearContents();
        let ns_string = NSString::from_str(text);
        board.setString_forType(&ns_string, pasteboard_type_string())
    }
}

#[cfg(target_os = "macos")]
fn pasteboard_type_tiff() -> &'static NSString {
    unsafe { objc2_app_kit::NSPasteboardTypeTIFF }
}

#[cfg(target_os = "macos")]
fn platform_has_image() -> bool {
    unsafe {
        let board = NSPasteboard::generalPasteboard();
        let types = objc2_foundation::NSArray::from_retained_slice(&[
            pasteboard_type_tiff().copy(),
        ]);
        board.availableTypeFromArray(&types).is_some()
    }
}

#[cfg(target_os = "macos")]
fn platform_get_image() -> Option<(u32, u32, Vec<u32>)> {
    use objc2_app_kit::NSBitmapImageRep;

    unsafe {
        let board = NSPasteboard::generalPasteboard();
        let tiff_data = board.dataForType(pasteboard_type_tiff())?;

        let rep = NSBitmapImageRep::imageRepWithData(&tiff_data)?;
        let w = rep.pixelsWide() as u32;
        let h = rep.pixelsHigh() as u32;
        if w == 0 || h == 0 { return None; }

        let ptr = rep.bitmapData();
        if ptr.is_null() { return None; }

        let bps = rep.bitsPerSample() as u32;
        let spp = rep.samplesPerPixel() as u32;
        let bpr = rep.bytesPerRow() as usize;
        let has_alpha = rep.hasAlpha();

        let mut argb = vec![0u32; (w * h) as usize];

        for y in 0..h as usize {
            let row = ptr.add(y * bpr);
            for x in 0..w as usize {
                let (r, g, b, a) = if bps == 8 && spp >= 3 {
                    let off = x * spp as usize;
                    (
                        *row.add(off),
                        *row.add(off + 1),
                        *row.add(off + 2),
                        if has_alpha && spp >= 4 { *row.add(off + 3) } else { 255u8 },
                    )
                } else {
                    (0, 0, 0, 255)
                };
                argb[y * w as usize + x] =
                    (a as u32) << 24 | (r as u32) << 16 | (g as u32) << 8 | (b as u32);
            }
        }
        Some((w, h, argb))
    }
}

#[cfg(target_os = "macos")]
fn platform_set_image(width: u32, height: u32, data: &[u32]) -> bool {
    use objc2_app_kit::{NSBitmapImageRep, NSBitmapFormat};

    unsafe {
        // Create RGBA bitmap data
        let mut rgba = vec![0u8; (width * height * 4) as usize];
        for i in 0..data.len() {
            let argb = data[i];
            let a = ((argb >> 24) & 0xFF) as u8;
            let r = ((argb >> 16) & 0xFF) as u8;
            let g = ((argb >> 8) & 0xFF) as u8;
            let b = (argb & 0xFF) as u8;
            rgba[i * 4] = r;
            rgba[i * 4 + 1] = g;
            rgba[i * 4 + 2] = b;
            rgba[i * 4 + 3] = a;
        }

        let rep = NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bitmapFormat_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(),
            std::ptr::null_mut(),
            width as isize,
            height as isize,
            8,
            4,
            true,
            false,
            objc2_app_kit::NSCalibratedRGBColorSpace,
            NSBitmapFormat::AlphaNonpremultiplied,
            (width * 4) as isize,
            32,
        );
        let rep = match rep {
            Some(r) => r,
            None => return false,
        };

        // Copy pixel data
        let bmp_ptr = rep.bitmapData();
        if bmp_ptr.is_null() { return false; }
        std::ptr::copy_nonoverlapping(rgba.as_ptr(), bmp_ptr, rgba.len());

        // Get TIFF representation
        let tiff = match rep.TIFFRepresentation() {
            Some(t) => t,
            None => return false,
        };

        let board = NSPasteboard::generalPasteboard();
        board.clearContents();
        board.setData_forType(Some(&tiff), pasteboard_type_tiff())
    }
}

#[cfg(target_os = "macos")]
fn platform_get_sequence() -> f64 {
    unsafe {
        let board = NSPasteboard::generalPasteboard();
        board.changeCount() as f64
    }
}

// =============================================================================
// Windows — Win32 clipboard APIs
// =============================================================================

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::BITMAPINFOHEADER;
#[cfg(target_os = "windows")]
use windows::Win32::System::DataExchange::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Memory::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Ole::{CF_BITMAP, CF_DIB, CF_UNICODETEXT};

/// RAII guard that calls CloseClipboard on drop.
#[cfg(target_os = "windows")]
struct ClipboardGuard;

#[cfg(target_os = "windows")]
impl ClipboardGuard {
    fn open() -> Option<Self> {
        unsafe { OpenClipboard(HWND::default()).ok().map(|_| ClipboardGuard) }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_clear() -> bool {
    let _guard = match ClipboardGuard::open() {
        Some(g) => g,
        None => return false,
    };
    unsafe { EmptyClipboard().is_ok() }
}

#[cfg(target_os = "windows")]
fn platform_has_text() -> bool {
    unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT.0 as u32).is_ok() }
}

#[cfg(target_os = "windows")]
fn platform_get_text() -> String {
    let _guard = match ClipboardGuard::open() {
        Some(g) => g,
        None => return String::new(),
    };
    unsafe {
        let handle = GetClipboardData(CF_UNICODETEXT.0 as u32);
        let handle = match handle {
            Ok(h) => h,
            Err(_) => return String::new(),
        };
        let ptr = GlobalLock(HGLOBAL(handle.0)) as *const u16;
        if ptr.is_null() {
            return String::new();
        }
        // Find the null terminator
        let mut len = 0usize;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(ptr, len);
        let result = String::from_utf16_lossy(slice);
        let _ = GlobalUnlock(HGLOBAL(handle.0));
        result
    }
}

#[cfg(target_os = "windows")]
fn platform_set_text(text: &str) -> bool {
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let byte_len = wide.len() * std::mem::size_of::<u16>();

    unsafe {
        let hmem = GlobalAlloc(GMEM_MOVEABLE, byte_len);
        let hmem = match hmem {
            Ok(h) => h,
            Err(_) => return false,
        };
        let ptr = GlobalLock(hmem) as *mut u16;
        if ptr.is_null() {
            let _ = GlobalFree(hmem);
            return false;
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
        let _ = GlobalUnlock(hmem);

        let _guard = match ClipboardGuard::open() {
            Some(g) => g,
            None => {
                let _ = GlobalFree(hmem);
                return false;
            }
        };
        let _ = EmptyClipboard();
        let result = SetClipboardData(CF_UNICODETEXT.0 as u32, HANDLE(hmem.0));
        result.is_ok()
        // Do NOT GlobalFree hmem on success — the clipboard owns it now.
    }
}

#[cfg(target_os = "windows")]
fn platform_has_image() -> bool {
    unsafe {
        IsClipboardFormatAvailable(CF_DIB.0 as u32).is_ok()
            || IsClipboardFormatAvailable(CF_BITMAP.0 as u32).is_ok()
    }
}

#[cfg(target_os = "windows")]
fn platform_get_image() -> Option<(u32, u32, Vec<u32>)> {
    let _guard = ClipboardGuard::open()?;
    unsafe {
        let handle = GetClipboardData(CF_DIB.0 as u32).ok()?;
        let ptr = GlobalLock(HGLOBAL(handle.0)) as *const u8;
        if ptr.is_null() {
            return None;
        }

        // Parse BITMAPINFOHEADER
        let header = &*(ptr as *const BITMAPINFOHEADER);
        let width = header.biWidth as u32;
        let height_raw = header.biHeight;
        let height = height_raw.unsigned_abs();
        let bit_count = header.biBitCount;

        if bit_count != 32 && bit_count != 24 {
            let _ = GlobalUnlock(HGLOBAL(handle.0));
            return None;
        }

        let top_down = height_raw < 0;
        let header_size = header.biSize as usize;
        let pixel_data = ptr.add(header_size);

        let stride = if bit_count == 32 {
            (width * 4) as usize
        } else {
            // 24-bit: rows are padded to 4-byte boundaries
            ((width as usize * 3 + 3) & !3)
        };

        let mut argb = vec![0u32; (width * height) as usize];

        for y in 0..height as usize {
            let src_y = if top_down { y } else { (height as usize) - 1 - y };
            let row_ptr = pixel_data.add(src_y * stride);

            for x in 0..width as usize {
                let (b, g, r, a) = if bit_count == 32 {
                    let off = x * 4;
                    (
                        *row_ptr.add(off),
                        *row_ptr.add(off + 1),
                        *row_ptr.add(off + 2),
                        *row_ptr.add(off + 3),
                    )
                } else {
                    let off = x * 3;
                    (
                        *row_ptr.add(off),
                        *row_ptr.add(off + 1),
                        *row_ptr.add(off + 2),
                        255u8,
                    )
                };
                argb[y * width as usize + x] =
                    (a as u32) << 24 | (r as u32) << 16 | (g as u32) << 8 | (b as u32);
            }
        }

        let _ = GlobalUnlock(HGLOBAL(handle.0));
        Some((width, height, argb))
    }
}

#[cfg(target_os = "windows")]
fn platform_set_image(width: u32, height: u32, data: &[u32]) -> bool {
    let header_size = std::mem::size_of::<BITMAPINFOHEADER>();
    let row_bytes = (width * 4) as usize;
    let pixel_bytes = row_bytes * height as usize;
    let total = header_size + pixel_bytes;

    unsafe {
        let hmem = match GlobalAlloc(GMEM_MOVEABLE, total) {
            Ok(h) => h,
            Err(_) => return false,
        };
        let ptr = GlobalLock(hmem) as *mut u8;
        if ptr.is_null() {
            let _ = GlobalFree(hmem);
            return false;
        }

        // Write BITMAPINFOHEADER (bottom-up)
        let header = &mut *(ptr as *mut BITMAPINFOHEADER);
        *header = std::mem::zeroed();
        header.biSize = header_size as u32;
        header.biWidth = width as i32;
        header.biHeight = height as i32; // positive = bottom-up
        header.biPlanes = 1;
        header.biBitCount = 32;
        header.biSizeImage = pixel_bytes as u32;

        // Convert ARGB to bottom-up BGRA
        let pixel_ptr = ptr.add(header_size);
        for y in 0..height as usize {
            let dst_y = (height as usize) - 1 - y; // flip for bottom-up
            for x in 0..width as usize {
                let argb = data[y * width as usize + x];
                let a = ((argb >> 24) & 0xFF) as u8;
                let r = ((argb >> 16) & 0xFF) as u8;
                let g = ((argb >> 8) & 0xFF) as u8;
                let b = (argb & 0xFF) as u8;
                let off = (dst_y * row_bytes + x * 4) as isize;
                *pixel_ptr.offset(off) = b;
                *pixel_ptr.offset(off + 1) = g;
                *pixel_ptr.offset(off + 2) = r;
                *pixel_ptr.offset(off + 3) = a;
            }
        }

        let _ = GlobalUnlock(hmem);

        let _guard = match ClipboardGuard::open() {
            Some(g) => g,
            None => {
                let _ = GlobalFree(hmem);
                return false;
            }
        };
        let _ = EmptyClipboard();
        SetClipboardData(CF_DIB.0 as u32, HANDLE(hmem.0)).is_ok()
    }
}

#[cfg(target_os = "windows")]
fn platform_get_sequence() -> f64 {
    unsafe { GetClipboardSequenceNumber() as f64 }
}

// =============================================================================
// NAPI exports — delegate to platform functions
// =============================================================================

#[napi(js_name = "clipboard_clear")]
pub fn clipboard_clear() -> bool {
    platform_clear()
}

#[napi(js_name = "clipboard_hasText")]
pub fn clipboard_has_text() -> bool {
    platform_has_text()
}

#[napi(js_name = "clipboard_getText")]
pub fn clipboard_get_text() -> String {
    platform_get_text()
}

#[napi(js_name = "clipboard_setText")]
pub fn clipboard_set_text(text: String) -> bool {
    platform_set_text(&text)
}

#[napi(js_name = "clipboard_hasImage")]
pub fn clipboard_has_image() -> bool {
    platform_has_image()
}

#[napi(js_name = "clipboard_getImage")]
pub fn clipboard_get_image(env: Env) -> Result<Either<ClipboardImage, napi::JsNull>> {
    match platform_get_image() {
        Some((width, height, argb)) => Ok(Either::A(ClipboardImage {
            width,
            height,
            data: Uint32Array::new(argb),
        })),
        None => Ok(Either::B(env.get_null()?)),
    }
}

#[napi(js_name = "clipboard_setImage")]
pub fn clipboard_set_image(width: u32, height: u32, data: Uint32Array) -> bool {
    platform_set_image(width, height, data.as_ref())
}

#[napi(js_name = "clipboard_getSequence")]
pub fn clipboard_get_sequence() -> f64 {
    platform_get_sequence()
}
