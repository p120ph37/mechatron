use napi::bindgen_prelude::*;
use napi_derive::napi;

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
fn platform_get_image() -> Option<Vec<u8>> {
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
use objc2_foundation::NSString;

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
fn platform_has_image() -> bool {
    false // Stub — image clipboard support to be added later
}

#[cfg(target_os = "macos")]
fn platform_get_image() -> Option<Vec<u8>> {
    None // Stub — image clipboard support to be added later
}

#[cfg(target_os = "macos")]
fn platform_set_image(_width: u32, _height: u32, _data: &[u32]) -> bool {
    false // Stub — image clipboard support to be added later
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
use windows::Win32::System::DataExchange::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Memory::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Ole::CF_UNICODETEXT;

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
    false // Stub — image clipboard support to be added later
}

#[cfg(target_os = "windows")]
fn platform_get_image() -> Option<Vec<u8>> {
    None // Stub — image clipboard support to be added later
}

#[cfg(target_os = "windows")]
fn platform_set_image(_width: u32, _height: u32, _data: &[u32]) -> bool {
    false // Stub — image clipboard support to be added later
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
pub fn clipboard_get_image(env: Env) -> Result<napi::JsNull> {
    let _ = platform_get_image(); // Always None for now (stubbed)
    env.get_null()
}

#[napi(js_name = "clipboard_setImage")]
pub fn clipboard_set_image(_width: u32, _height: u32, _data: Uint32Array) -> bool {
    // platform_set_image not called with _data since image is stubbed on all platforms
    false
}

#[napi(js_name = "clipboard_getSequence")]
pub fn clipboard_get_sequence() -> f64 {
    platform_get_sequence()
}
