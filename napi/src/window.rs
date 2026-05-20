use napi::bindgen_prelude::*;
use napi_derive::napi;

// ==================== Linux implementation ====================

#[cfg(target_os = "linux")]
use std::ffi::{c_char, c_int, c_long, c_uint, c_ulong, c_void, CString};
#[cfg(target_os = "linux")]
use std::ptr;
#[cfg(target_os = "linux")]
use crate::x11::*;

// --- Atom cache ---
#[cfg(target_os = "linux")]
static mut WM_STATE: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_ABOVE: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_HIDDEN: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_HMAX: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_VMAX: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_DESKTOP: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_CURDESK: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_NAME: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_UTF8: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_PID: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_ACTIVE: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_HINTS: Atom = 0;
#[cfg(target_os = "linux")]
static mut WM_EXTENTS: Atom = 0;
#[cfg(target_os = "linux")]
static mut XA_WM_NAME: Atom = 0;

#[cfg(target_os = "linux")]
static ATOMS_INIT: std::sync::Once = std::sync::Once::new();

#[cfg(target_os = "linux")]
unsafe fn load_atoms() {
    ATOMS_INIT.call_once(|| {
        let d = get_display();
        if d.is_null() { return; }
        WM_STATE   = XInternAtom(d, b"_NET_WM_STATE\0".as_ptr() as _, True_);
        WM_ABOVE   = XInternAtom(d, b"_NET_WM_STATE_ABOVE\0".as_ptr() as _, True_);
        WM_HIDDEN  = XInternAtom(d, b"_NET_WM_STATE_HIDDEN\0".as_ptr() as _, True_);
        WM_HMAX    = XInternAtom(d, b"_NET_WM_STATE_MAXIMIZED_HORZ\0".as_ptr() as _, True_);
        WM_VMAX    = XInternAtom(d, b"_NET_WM_STATE_MAXIMIZED_VERT\0".as_ptr() as _, True_);
        WM_DESKTOP = XInternAtom(d, b"_NET_WM_DESKTOP\0".as_ptr() as _, True_);
        WM_CURDESK = XInternAtom(d, b"_NET_CURRENT_DESKTOP\0".as_ptr() as _, True_);
        WM_NAME    = XInternAtom(d, b"_NET_WM_NAME\0".as_ptr() as _, True_);
        WM_UTF8    = XInternAtom(d, b"UTF8_STRING\0".as_ptr() as _, True_);
        WM_PID     = XInternAtom(d, b"_NET_WM_PID\0".as_ptr() as _, True_);
        WM_ACTIVE  = XInternAtom(d, b"_NET_ACTIVE_WINDOW\0".as_ptr() as _, True_);
        WM_HINTS   = XInternAtom(d, b"_MOTIF_WM_HINTS\0".as_ptr() as _, True_);
        WM_EXTENTS = XInternAtom(d, b"_NET_FRAME_EXTENTS\0".as_ptr() as _, True_);
        XA_WM_NAME = XInternAtom(d, b"WM_NAME\0".as_ptr() as _, False_);
    });
}

#[cfg(target_os = "linux")]
unsafe fn win_is_valid(handle: u64) -> bool {
    if handle == 0 { return false; }
    let d = get_display();
    if d.is_null() { return false; }
    load_atoms();
    let _xe = XDismissErrors::new();
    let result = get_window_property(handle as Window, WM_PID, None);
    if result.is_null() { return false; }
    XFree(result as *mut c_void);
    true
}

#[cfg(target_os = "linux")]
unsafe fn validate_handle(handle: u64) -> u64 {
    if handle == 0 { return 0; }
    if win_is_valid(handle) { handle } else { 0 }
}

#[cfg(target_os = "linux")]
const STATE_TOPMOST: u8 = 0;
#[cfg(target_os = "linux")]
const STATE_MINIMIZE: u8 = 1;
#[cfg(target_os = "linux")]
const STATE_MAXIMIZE: u8 = 2;

#[cfg(target_os = "linux")]
unsafe fn get_wm_state(win: Window, setting: u8) -> bool {
    load_atoms();
    if WM_STATE == None_ || WM_ABOVE == None_ || WM_VMAX == None_
        || WM_HMAX == None_ || WM_HIDDEN == None_ { return false; }

    let mut n_items: u32 = 0;
    let atoms = get_window_property(win, WM_STATE, Some(&mut n_items));
    if atoms.is_null() { return false; }

    let atoms_slice = std::slice::from_raw_parts(atoms as *const Atom, n_items as usize);
    let mut test1 = false;
    let mut test2 = false;
    for &a in atoms_slice {
        match setting {
            STATE_TOPMOST => {
                if a == WM_ABOVE { test1 = true; test2 = true; }
            }
            STATE_MINIMIZE => {
                if a == WM_HIDDEN { test1 = true; test2 = true; }
            }
            STATE_MAXIMIZE => {
                if a == WM_HMAX { test1 = true; }
                if a == WM_VMAX { test2 = true; }
            }
            _ => {}
        }
        if test1 && test2 { break; }
    }
    XFree(atoms as *mut c_void);
    test1 && test2
}

#[cfg(target_os = "linux")]
unsafe fn set_wm_state(win: Window, setting: u8, state: bool) {
    load_atoms();
    let d = get_display();

    if setting == STATE_MINIMIZE {
        if state {
            let mut attr: XWindowAttributes = std::mem::zeroed();
            XGetWindowAttributes(d, win, &mut attr);
            let s = XScreenNumberOfScreen(attr.screen);
            XIconifyWindow(d, win, s);
        } else {
            window_set_active_internal(win);
        }
        return;
    }

    if WM_STATE == None_ || WM_HMAX == None_ || WM_ABOVE == None_ || WM_VMAX == None_ {
        return;
    }

    let mut attr: XWindowAttributes = std::mem::zeroed();
    XGetWindowAttributes(d, win, &mut attr);
    let s = XScreenNumberOfScreen(attr.screen);

    let mut e: XClientMessageEvent = std::mem::zeroed();
    e.type_ = ClientMessage;
    e.window = win;
    e.format = 32;
    e.message_type = WM_STATE;
    e.display = d;

    match setting {
        STATE_TOPMOST => {
            e.data.l[0] = if state { 1 } else { 0 };
            e.data.l[1] = WM_ABOVE as c_long;
        }
        STATE_MAXIMIZE => {
            e.data.l[0] = if state { 1 } else { 0 };
            e.data.l[1] = WM_HMAX as c_long;
            e.data.l[2] = WM_VMAX as c_long;
        }
        _ => return,
    }

    XSendEvent(d, XRootWindow(d, s), False_,
        SubstructureNotifyMask | SubstructureRedirectMask,
        &mut e as *mut XClientMessageEvent as *mut XEvent);
}

#[cfg(target_os = "linux")]
unsafe fn get_frame(win: Window) -> (i32, i32, i32, i32) {
    load_atoms();
    if WM_EXTENTS == None_ { return (0, 0, 0, 0); }
    let mut n_items: u32 = 0;
    let result = get_window_property(win, WM_EXTENTS, Some(&mut n_items));
    if result.is_null() || n_items != 4 {
        if !result.is_null() { XFree(result as *mut c_void); }
        return (0, 0, 0, 0);
    }
    let vals = result as *const c_long;
    let left = *vals.add(0) as i32;
    let right = *vals.add(1) as i32;
    let top = *vals.add(2) as i32;
    let bottom = *vals.add(3) as i32;
    XFree(result as *mut c_void);
    (left, top, left + right, top + bottom)
}

#[cfg(target_os = "linux")]
unsafe fn get_title(win: Window) -> String {
    load_atoms();
    let _ = get_display();
    let _xe = XDismissErrors::new();

    let result = get_window_property(win, WM_NAME, None);
    if !result.is_null() {
        let cstr = std::ffi::CStr::from_ptr(result as *const c_char);
        let name = cstr.to_string_lossy().to_string();
        XFree(result as *mut c_void);
        if !name.is_empty() { return name; }
    }

    let result = get_window_property(win, XA_WM_NAME, None);
    if !result.is_null() {
        let cstr = std::ffi::CStr::from_ptr(result as *const c_char);
        let name = cstr.to_string_lossy().to_string();
        XFree(result as *mut c_void);
        return name;
    }

    String::new()
}

#[cfg(target_os = "linux")]
unsafe fn get_pid(win: Window) -> i32 {
    load_atoms();
    let _xe = XDismissErrors::new();
    let result = get_window_property(win, WM_PID, None);
    if result.is_null() { return 0; }
    let pid = *(result as *const c_long) as i32;
    XFree(result as *mut c_void);
    pid
}

#[cfg(target_os = "linux")]
unsafe fn get_client(win: Window) -> (i32, i32, i32, i32) {
    let d = get_display();
    let _xe = XDismissErrors::new();
    let mut attr: XWindowAttributes = std::mem::zeroed();
    if XGetWindowAttributes(d, win, &mut attr) == 0 {
        return (0, 0, 0, 0);
    }
    let mut child: Window = 0;
    let mut x: c_int = 0;
    let mut y: c_int = 0;
    extern "C" { fn XTranslateCoordinates(
        display: *mut Display, src: Window, dest: Window,
        src_x: c_int, src_y: c_int,
        dest_x: *mut c_int, dest_y: *mut c_int,
        child: *mut Window,
    ) -> c_int; }
    XTranslateCoordinates(d, win, XDefaultRootWindow(d), 0, 0, &mut x, &mut y, &mut child);
    (x, y, attr.width, attr.height)
}

#[cfg(target_os = "linux")]
unsafe fn window_set_active_internal(win: Window) {
    load_atoms();
    let d = get_display();
    if WM_ACTIVE != None_ {
        let mut attr: XWindowAttributes = std::mem::zeroed();
        XGetWindowAttributes(d, win, &mut attr);
        let s = XScreenNumberOfScreen(attr.screen);

        let mut e: XClientMessageEvent = std::mem::zeroed();
        e.type_ = ClientMessage;
        e.window = win;
        e.format = 32;
        e.message_type = WM_ACTIVE;
        e.display = d;
        e.data.l[0] = 2;
        e.data.l[1] = CurrentTime as c_long;

        XSendEvent(d, XRootWindow(d, s), False_,
            SubstructureNotifyMask | SubstructureRedirectMask,
            &mut e as *mut XClientMessageEvent as *mut XEvent);
    }
    XMapWindow(d, win);
    XRaiseWindow(d, win);
}

#[cfg(target_os = "linux")]
unsafe fn enum_windows(win: Window, pattern: Option<&regex::Regex>, pid_filter: i32, results: &mut Vec<u64>) {
    let d = get_display();
    let mut attr: XWindowAttributes = std::mem::zeroed();
    XGetWindowAttributes(d, win, &mut attr);

    if attr.map_state == IsViewable {
        if win_is_valid(win as u64) {
            let match_pid = pid_filter == 0 || get_pid(win) == pid_filter;
            if match_pid {
                let match_title = match pattern {
                    None => true,
                    Some(re) => {
                        let title = get_title(win);
                        re.is_match(&title)
                    }
                };
                if match_title {
                    results.push(win as u64);
                }
            }
        }
    }

    let mut root: Window = 0;
    let mut parent: Window = 0;
    let mut children: *mut Window = ptr::null_mut();
    let mut count: c_uint = 0;
    if XQueryTree(d, win, &mut root, &mut parent, &mut children, &mut count) != 0 && !children.is_null() {
        for i in 0..count as usize {
            enum_windows(*children.add(i), pattern, pid_filter, results);
        }
        XFree(children as *mut c_void);
    }
}

// --- Platform-level functions (Linux) ---

#[cfg(target_os = "linux")]
fn platform_window_is_valid(handle: u64) -> bool {
    unsafe { win_is_valid(handle) }
}

#[cfg(target_os = "linux")]
fn platform_window_close(handle: u64) {
    unsafe {
        if !win_is_valid(handle) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        XDestroyWindow(d, handle as Window);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_top_most(handle: u64) -> bool {
    unsafe {
        if !win_is_valid(handle) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(handle as Window, STATE_TOPMOST)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_borderless(handle: u64) -> bool {
    unsafe {
        if !win_is_valid(handle) { return false; }
        load_atoms();
        let _xe = XDismissErrors::new();
        let result = get_window_property(handle as Window, WM_HINTS, None);
        if result.is_null() { return false; }
        let decorations = *(result as *const c_ulong).add(2);
        XFree(result as *mut c_void);
        decorations == 0
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_minimized(handle: u64) -> bool {
    unsafe {
        if !win_is_valid(handle) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(handle as Window, STATE_MINIMIZE)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_maximized(handle: u64) -> bool {
    unsafe {
        if !win_is_valid(handle) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(handle as Window, STATE_MAXIMIZE)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_top_most(handle: u64, top_most: bool) {
    unsafe {
        if !win_is_valid(handle) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(handle as Window, STATE_TOPMOST, top_most);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_borderless(handle: u64, borderless: bool) {
    unsafe {
        if !win_is_valid(handle) { return; }
        load_atoms();
        let _xe = XDismissErrors::new();
        if WM_HINTS != None_ {
            #[repr(C)]
            struct Hints { flags: c_ulong, funcs: c_ulong, decorations: c_ulong, mode: c_long, stat: c_ulong }
            let hints = Hints {
                flags: 2,
                funcs: 0,
                decorations: if borderless { 0 } else { 1 },
                mode: 0,
                stat: 0,
            };
            let d = get_display();
            XChangeProperty(d, handle as Window, WM_HINTS, WM_HINTS, 32, PropModeReplace,
                &hints as *const Hints as *const u8, 5);
        }
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_minimized(handle: u64, minimized: bool) {
    unsafe {
        if !win_is_valid(handle) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(handle as Window, STATE_MINIMIZE, minimized);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_maximized(handle: u64, maximized: bool) {
    unsafe {
        if !win_is_valid(handle) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(handle as Window, STATE_MINIMIZE, false);
        set_wm_state(handle as Window, STATE_MAXIMIZE, maximized);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_process(handle: u64) -> i32 {
    unsafe {
        if !win_is_valid(handle) { return 0; }
        get_pid(handle as Window)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_pid(handle: u64) -> i32 {
    unsafe {
        if !win_is_valid(handle) { return 0; }
        get_pid(handle as Window)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_handle(handle: u64) -> u64 {
    handle
}

#[cfg(target_os = "linux")]
fn platform_window_set_handle(_handle: u64, new_handle: u64) -> bool {
    unsafe { validate_handle(new_handle) != 0 || new_handle == 0 }
}

#[cfg(target_os = "linux")]
fn platform_window_get_title(handle: u64) -> String {
    unsafe {
        if !win_is_valid(handle) { return String::new(); }
        get_title(handle as Window)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_title(handle: u64, title: String) {
    unsafe {
        if !win_is_valid(handle) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        if let Ok(cstr) = CString::new(title.as_bytes()) {
            XStoreName(d, handle as Window, cstr.as_ptr());
        }
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_bounds(handle: u64) -> (i32, i32, i32, i32) {
    unsafe {
        if !win_is_valid(handle) {
            return (0, 0, 0, 0);
        }
        let _xe = XDismissErrors::new();
        let client = get_client(handle as Window);
        let frame = get_frame(handle as Window);
        (client.0 - frame.0, client.1 - frame.1, client.2 + frame.2, client.3 + frame.3)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_bounds(handle: u64, x: i32, y: i32, w: i32, h: i32) {
    unsafe {
        if !win_is_valid(handle) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        let frame = get_frame(handle as Window);
        XMoveResizeWindow(d, handle as Window, x, y,
            (w - frame.2).max(1) as c_uint,
            (h - frame.3).max(1) as c_uint);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_client(handle: u64) -> (i32, i32, i32, i32) {
    unsafe {
        if !win_is_valid(handle) {
            return (0, 0, 0, 0);
        }
        let _xe = XDismissErrors::new();
        get_client(handle as Window)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_client(handle: u64, x: i32, y: i32, w: i32, h: i32) {
    unsafe {
        if !win_is_valid(handle) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        XMoveResizeWindow(d, handle as Window, x, y, w.max(1) as c_uint, h.max(1) as c_uint);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_map_to_client(handle: u64, x: i32, y: i32) -> (i32, i32) {
    unsafe {
        if !win_is_valid(handle) {
            return (x, y);
        }
        let _xe = XDismissErrors::new();
        let c = get_client(handle as Window);
        (x - c.0, y - c.1)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_map_to_screen(handle: u64, x: i32, y: i32) -> (i32, i32) {
    unsafe {
        if !win_is_valid(handle) {
            return (x, y);
        }
        let _xe = XDismissErrors::new();
        let c = get_client(handle as Window);
        (x + c.0, y + c.1)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_list(regex_str: Option<String>) -> Vec<u64> {
    unsafe {
        let d = get_display();
        if d.is_null() {
            return Vec::new();
        }
        load_atoms();
        let _xe = XDismissErrors::new();

        let pattern = regex_str.as_ref().map(|s| regex::Regex::new(s).ok()).flatten();
        let mut results = Vec::new();
        let root = XDefaultRootWindow(d);
        enum_windows(root, pattern.as_ref(), 0, &mut results);

        results
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_active() -> u64 {
    unsafe {
        let d = get_display();
        if d.is_null() { return 0; }
        load_atoms();
        let _xe = XDismissErrors::new();

        if WM_ACTIVE != None_ {
            let root = XDefaultRootWindow(d);
            let result = get_window_property(root, WM_ACTIVE, None);
            if !result.is_null() {
                let win = *(result as *const Window);
                XFree(result as *mut c_void);
                return win as u64;
            }
        }
        0
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_active(handle: u64) {
    unsafe {
        if handle == 0 { return; }
        let _xe = XDismissErrors::new();
        window_set_active_internal(handle as Window);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_ax_enabled(_prompt: Option<bool>) -> bool {
    true
}

// ==================== macOS implementation ====================

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::{c_char, c_void};
    use std::ptr;
    use std::collections::HashSet;

    pub type CFTypeRef = *const c_void;
    pub type CFStringRef = CFTypeRef;
    pub type CFArrayRef = CFTypeRef;
    pub type CFDictionaryRef = CFTypeRef;
    pub type CFNumberRef = CFTypeRef;
    pub type CFBooleanRef = CFTypeRef;
    pub type CFIndex = isize;
    pub type CFStringEncoding = u32;
    pub type AXUIElementRef = CFTypeRef;
    pub type AXValueRef = CFTypeRef;
    pub type AXError = i32;
    pub type CGWindowID = u32;

    pub const K_CF_STRING_ENCODING_UTF8: CFStringEncoding = 0x08000100;
    pub const K_CF_NUMBER_INT_TYPE: u32 = 9;
    pub const K_AX_ERROR_SUCCESS: AXError = 0;
    pub const K_CG_NULL_WINDOW_ID: CGWindowID = 0;
    pub const K_CG_WINDOW_LIST_OPTION_ALL: u32 = 0;
    pub const K_AX_VALUE_TYPE_CG_POINT: u32 = 1;
    pub const K_AX_VALUE_TYPE_CG_SIZE: u32 = 2;

    #[repr(C)]
    #[derive(Default)]
    pub struct CGPoint { pub x: f64, pub y: f64 }

    #[repr(C)]
    #[derive(Default)]
    pub struct CGSize { pub width: f64, pub height: f64 }

    #[repr(C)]
    pub struct ProcessSerialNumber { pub high_long_of_psn: u32, pub low_long_of_psn: u32 }

    pub const K_SET_FRONT_PROCESS_FRONT_WINDOW_ONLY: u32 = 1;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        pub fn CFRelease(cf: CFTypeRef);
        pub fn CFRetain(cf: CFTypeRef) -> CFTypeRef;
        pub fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
        pub fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> CFTypeRef;
        pub fn CFArrayCreate(
            allocator: CFTypeRef, values: *const CFTypeRef,
            num_values: CFIndex, callbacks: *const c_void,
        ) -> CFArrayRef;
        pub fn CFDictionaryGetValue(dict: CFDictionaryRef, key: CFTypeRef) -> CFTypeRef;
        pub fn CFDictionaryCreate(
            allocator: CFTypeRef, keys: *const CFTypeRef, values: *const CFTypeRef,
            num_values: CFIndex, key_callbacks: *const c_void, value_callbacks: *const c_void,
        ) -> CFDictionaryRef;
        pub fn CFNumberGetValue(number: CFNumberRef, the_type: u32, value_ptr: *mut c_void) -> u8;
        pub fn CFBooleanGetValue(boolean: CFBooleanRef) -> u8;
        pub fn CFStringCreateWithCString(
            allocator: CFTypeRef, c_str: *const c_char, encoding: CFStringEncoding,
        ) -> CFStringRef;
        pub fn CFStringGetCString(
            the_string: CFStringRef, buffer: *mut c_char,
            buffer_size: CFIndex, encoding: CFStringEncoding,
        ) -> u8;

        pub static kCFBooleanTrue: CFBooleanRef;
        pub static kCFBooleanFalse: CFBooleanRef;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        pub static kCGWindowOwnerPID: CFStringRef;
        pub fn CGWindowListCopyWindowInfo(option: u32, relative_to: CGWindowID) -> CFArrayRef;
        pub fn CGWindowListCreateDescriptionFromArray(window_array: CFArrayRef) -> CFArrayRef;
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        pub fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
        pub fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        pub fn AXUIElementCopyAttributeValues(
            element: AXUIElementRef, attribute: CFStringRef,
            index: CFIndex, max_values: CFIndex, values: *mut CFArrayRef,
        ) -> AXError;
        pub fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef, attribute: CFStringRef, value: *mut CFTypeRef,
        ) -> AXError;
        pub fn AXUIElementSetAttributeValue(
            element: AXUIElementRef, attribute: CFStringRef, value: CFTypeRef,
        ) -> AXError;
        pub fn AXUIElementPerformAction(element: AXUIElementRef, action: CFStringRef) -> AXError;
        pub fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut i32) -> AXError;
        pub fn AXValueCreate(the_type: u32, value_ptr: *const c_void) -> AXValueRef;
        pub fn AXValueGetValue(value: AXValueRef, the_type: u32, value_ptr: *mut c_void) -> u8;
        pub fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;

        pub fn _AXUIElementGetWindow(element: AXUIElementRef, wid: *mut CGWindowID) -> AXError;

        pub static kAXWindowsAttribute: CFStringRef;
        pub static kAXRoleAttribute: CFStringRef;
        pub static kAXMinimizedAttribute: CFStringRef;
        pub static kAXTitleAttribute: CFStringRef;
        pub static kAXPositionAttribute: CFStringRef;
        pub static kAXSizeAttribute: CFStringRef;
        pub static kAXCloseButtonAttribute: CFStringRef;
        pub static kAXFocusedWindowAttribute: CFStringRef;
        pub static kAXFocusedApplicationAttribute: CFStringRef;
        pub static kAXRaiseAction: CFStringRef;
        pub static kAXPressAction: CFStringRef;
        pub static kAXTrustedCheckOptionPrompt: CFStringRef;
        pub static kAXFrontmostAttribute: CFStringRef;

        pub fn GetFrontProcess(psn: *mut ProcessSerialNumber) -> i32;
        pub fn GetProcessPID(psn: *const ProcessSerialNumber, pid: *mut i32) -> i32;
        pub fn GetProcessForPID(pid: i32, psn: *mut ProcessSerialNumber) -> i32;
        pub fn SetFrontProcessWithOptions(psn: *const ProcessSerialNumber, options: u32) -> i32;
    }

    pub unsafe fn get_pid_for_window(win: CGWindowID) -> i32 {
        if win == 0 { return 0; }
        let window_ids: [*const c_void; 1] = [win as usize as *const c_void];
        let wlist = CFArrayCreate(ptr::null(), window_ids.as_ptr(), 1, ptr::null());
        if wlist.is_null() { return 0; }
        let info = CGWindowListCreateDescriptionFromArray(wlist);
        CFRelease(wlist);
        if info.is_null() { return 0; }
        let mut pid: i32 = 0;
        if CFArrayGetCount(info) > 0 {
            let desc = CFArrayGetValueAtIndex(info, 0);
            let data = CFDictionaryGetValue(desc, kCGWindowOwnerPID);
            if !data.is_null() {
                CFNumberGetValue(data, K_CF_NUMBER_INT_TYPE, &mut pid as *mut i32 as *mut c_void);
            }
        }
        CFRelease(info);
        pid
    }

    pub unsafe fn get_ui_element(win: CGWindowID) -> AXUIElementRef {
        let pid = get_pid_for_window(win);
        if pid <= 0 { return ptr::null(); }

        let application = AXUIElementCreateApplication(pid);
        if application.is_null() { return ptr::null(); }

        let mut windows: CFArrayRef = ptr::null();
        AXUIElementCopyAttributeValues(
            application, kAXWindowsAttribute, 0, 1024, &mut windows,
        );

        let mut result: AXUIElementRef = ptr::null();
        if !windows.is_null() {
            let count = CFArrayGetCount(windows);
            for i in 0..count {
                let element = CFArrayGetValueAtIndex(windows, i);
                let mut temp: CGWindowID = 0;
                if _AXUIElementGetWindow(element, &mut temp) == K_AX_ERROR_SUCCESS && temp == win {
                    CFRetain(element);
                    result = element;
                    break;
                }
            }
            CFRelease(windows);
        }
        CFRelease(application);
        result
    }

    pub unsafe fn with_ax_window<T, F: FnOnce(AXUIElementRef) -> T>(handle: u64, default: T, f: F) -> T {
        let ax = get_ui_element(handle as CGWindowID);
        if ax.is_null() { return default; }
        let result = f(ax);
        CFRelease(ax);
        result
    }
}

#[cfg(target_os = "macos")]
fn platform_window_is_valid(handle: u64) -> bool {
    if handle == 0 { return false; }
    unsafe {
        use mac::*;
        with_ax_window(handle, false, |ax| {
            let mut r: CFTypeRef = std::ptr::null();
            if AXUIElementCopyAttributeValue(ax, kAXRoleAttribute, &mut r) == K_AX_ERROR_SUCCESS
                && !r.is_null()
            {
                CFRelease(r);
                true
            } else {
                false
            }
        })
    }
}

#[cfg(target_os = "macos")]
fn platform_window_close(handle: u64) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        use mac::*;
        with_ax_window(handle, (), |ax| {
            let mut btn: CFTypeRef = std::ptr::null();
            if AXUIElementCopyAttributeValue(ax, kAXCloseButtonAttribute, &mut btn)
                == K_AX_ERROR_SUCCESS
                && !btn.is_null()
            {
                AXUIElementPerformAction(btn, kAXPressAction);
                CFRelease(btn);
            }
        });
    }
}

#[cfg(target_os = "macos")]
fn platform_window_is_top_most(_handle: u64) -> bool { false }

#[cfg(target_os = "macos")]
fn platform_window_is_borderless(_handle: u64) -> bool { false }

#[cfg(target_os = "macos")]
fn platform_window_is_minimized(handle: u64) -> bool {
    if !platform_window_is_valid(handle) { return false; }
    unsafe {
        use mac::*;
        with_ax_window(handle, false, |ax| {
            let mut data: CFTypeRef = std::ptr::null();
            if AXUIElementCopyAttributeValue(ax, kAXMinimizedAttribute, &mut data)
                == K_AX_ERROR_SUCCESS
                && !data.is_null()
            {
                let result = CFBooleanGetValue(data) != 0;
                CFRelease(data);
                result
            } else {
                false
            }
        })
    }
}

#[cfg(target_os = "macos")]
fn platform_window_is_maximized(_handle: u64) -> bool { false }

#[cfg(target_os = "macos")]
fn platform_window_set_top_most(_handle: u64, _top_most: bool) {}

#[cfg(target_os = "macos")]
fn platform_window_set_borderless(_handle: u64, _borderless: bool) {}

#[cfg(target_os = "macos")]
fn platform_window_set_minimized(handle: u64, minimized: bool) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        use mac::*;
        with_ax_window(handle, (), |ax| {
            let val = if minimized { kCFBooleanTrue } else { kCFBooleanFalse };
            AXUIElementSetAttributeValue(ax, kAXMinimizedAttribute, val);
        });
    }
}

#[cfg(target_os = "macos")]
fn platform_window_set_maximized(_handle: u64, _maximized: bool) {}

#[cfg(target_os = "macos")]
fn platform_window_get_process(handle: u64) -> i32 {
    platform_window_get_pid(handle)
}

#[cfg(target_os = "macos")]
fn platform_window_get_pid(handle: u64) -> i32 {
    if handle == 0 { return 0; }
    unsafe {
        use mac::*;
        with_ax_window(handle, 0, |ax| {
            let mut pid: i32 = 0;
            if AXUIElementGetPid(ax, &mut pid) == K_AX_ERROR_SUCCESS {
                pid
            } else {
                0
            }
        })
    }
}

#[cfg(target_os = "macos")]
fn platform_window_get_handle(handle: u64) -> u64 { handle }

#[cfg(target_os = "macos")]
fn platform_window_set_handle(_handle: u64, new_handle: u64) -> bool {
    if new_handle == 0 { return true; }
    unsafe {
        let ax = mac::get_ui_element(new_handle as mac::CGWindowID);
        if ax.is_null() {
            false
        } else {
            mac::CFRelease(ax);
            true
        }
    }
}

#[cfg(target_os = "macos")]
fn platform_window_get_title(handle: u64) -> String {
    if !platform_window_is_valid(handle) { return String::new(); }
    unsafe {
        use mac::*;
        with_ax_window(handle, String::new(), |ax| {
            let mut data: CFTypeRef = std::ptr::null();
            if AXUIElementCopyAttributeValue(ax, kAXTitleAttribute, &mut data)
                == K_AX_ERROR_SUCCESS
                && !data.is_null()
            {
                let mut buf = [0u8; 512];
                if CFStringGetCString(
                    data,
                    buf.as_mut_ptr() as *mut std::ffi::c_char,
                    512,
                    K_CF_STRING_ENCODING_UTF8,
                ) != 0
                {
                    let cstr = std::ffi::CStr::from_ptr(buf.as_ptr() as *const std::ffi::c_char);
                    let s = cstr.to_string_lossy().to_string();
                    CFRelease(data);
                    s
                } else {
                    CFRelease(data);
                    String::new()
                }
            } else {
                String::new()
            }
        })
    }
}

#[cfg(target_os = "macos")]
fn platform_window_set_title(handle: u64, title: String) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        use mac::*;
        if let Ok(cstr) = std::ffi::CString::new(title.as_bytes()) {
            with_ax_window(handle, (), |ax| {
                let name = CFStringCreateWithCString(
                    std::ptr::null(),
                    cstr.as_ptr(),
                    K_CF_STRING_ENCODING_UTF8,
                );
                if !name.is_null() {
                    AXUIElementSetAttributeValue(ax, kAXTitleAttribute, name);
                    CFRelease(name);
                }
            });
        }
    }
}

#[cfg(target_os = "macos")]
fn platform_window_get_bounds(handle: u64) -> (i32, i32, i32, i32) {
    if !platform_window_is_valid(handle) { return (0, 0, 0, 0); }
    unsafe {
        use mac::*;
        with_ax_window(handle, (0, 0, 0, 0), |ax| {
            let mut axp: CFTypeRef = std::ptr::null();
            let mut axs: CFTypeRef = std::ptr::null();

            if AXUIElementCopyAttributeValue(ax, kAXPositionAttribute, &mut axp)
                != K_AX_ERROR_SUCCESS
                || axp.is_null()
            {
                return (0, 0, 0, 0);
            }
            if AXUIElementCopyAttributeValue(ax, kAXSizeAttribute, &mut axs)
                != K_AX_ERROR_SUCCESS
                || axs.is_null()
            {
                CFRelease(axp);
                return (0, 0, 0, 0);
            }

            let mut p = CGPoint::default();
            let mut s = CGSize::default();

            let ok = AXValueGetValue(axp, K_AX_VALUE_TYPE_CG_POINT, &mut p as *mut CGPoint as *mut std::ffi::c_void) != 0
                && AXValueGetValue(axs, K_AX_VALUE_TYPE_CG_SIZE, &mut s as *mut CGSize as *mut std::ffi::c_void) != 0;

            CFRelease(axp);
            CFRelease(axs);

            if ok {
                (p.x as i32, p.y as i32, s.width as i32, s.height as i32)
            } else {
                (0, 0, 0, 0)
            }
        })
    }
}

#[cfg(target_os = "macos")]
fn platform_window_set_bounds(handle: u64, x: i32, y: i32, w: i32, h: i32) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        use mac::*;
        with_ax_window(handle, (), |ax| {
            let p = CGPoint { x: x as f64, y: y as f64 };
            let s = CGSize { width: w as f64, height: h as f64 };

            let axp = AXValueCreate(K_AX_VALUE_TYPE_CG_POINT, &p as *const CGPoint as *const std::ffi::c_void);
            let axs = AXValueCreate(K_AX_VALUE_TYPE_CG_SIZE, &s as *const CGSize as *const std::ffi::c_void);

            if !axp.is_null() && !axs.is_null() {
                AXUIElementSetAttributeValue(ax, kAXPositionAttribute, axp);
                AXUIElementSetAttributeValue(ax, kAXSizeAttribute, axs);
            }

            if !axp.is_null() { CFRelease(axp); }
            if !axs.is_null() { CFRelease(axs); }
        });
    }
}

#[cfg(target_os = "macos")]
fn platform_window_get_client(handle: u64) -> (i32, i32, i32, i32) {
    platform_window_get_bounds(handle)
}

#[cfg(target_os = "macos")]
fn platform_window_set_client(handle: u64, x: i32, y: i32, w: i32, h: i32) {
    platform_window_set_bounds(handle, x, y, w, h);
}

#[cfg(target_os = "macos")]
fn platform_window_map_to_client(handle: u64, x: i32, y: i32) -> (i32, i32) {
    if !platform_window_is_valid(handle) { return (x, y); }
    let b = platform_window_get_client(handle);
    (x - b.0, y - b.1)
}

#[cfg(target_os = "macos")]
fn platform_window_map_to_screen(handle: u64, x: i32, y: i32) -> (i32, i32) {
    if !platform_window_is_valid(handle) { return (x, y); }
    let b = platform_window_get_client(handle);
    (x + b.0, y + b.1)
}

#[cfg(target_os = "macos")]
fn platform_window_get_list(regex_str: Option<String>) -> Vec<u64> {
    let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());

    unsafe {
        use mac::*;
        let info = CGWindowListCopyWindowInfo(K_CG_WINDOW_LIST_OPTION_ALL, K_CG_NULL_WINDOW_ID);
        if info.is_null() { return Vec::new(); }

        let mut pids = HashSet::new();
        let count = CFArrayGetCount(info);
        for i in 0..count {
            let dict = CFArrayGetValueAtIndex(info, i);
            let data = CFDictionaryGetValue(dict, kCGWindowOwnerPID);
            if !data.is_null() {
                let mut pid: i32 = 0;
                if CFNumberGetValue(data, K_CF_NUMBER_INT_TYPE, &mut pid as *mut i32 as *mut std::ffi::c_void) != 0
                    && pid > 0
                {
                    pids.insert(pid);
                }
            }
        }
        CFRelease(info);

        let mut results = Vec::new();
        for pid in pids {
            let application = AXUIElementCreateApplication(pid);
            if application.is_null() { continue; }

            let mut windows: CFArrayRef = std::ptr::null();
            AXUIElementCopyAttributeValues(
                application, kAXWindowsAttribute, 0, 1024, &mut windows,
            );

            if !windows.is_null() {
                let wcount = CFArrayGetCount(windows);
                for i in 0..wcount {
                    let element = CFArrayGetValueAtIndex(windows, i);
                    let mut wid: CGWindowID = 0;
                    if _AXUIElementGetWindow(element, &mut wid) != K_AX_ERROR_SUCCESS || wid == 0 {
                        continue;
                    }

                    if let Some(ref re) = pattern {
                        let mut data: CFTypeRef = std::ptr::null();
                        if AXUIElementCopyAttributeValue(element, kAXTitleAttribute, &mut data)
                            == K_AX_ERROR_SUCCESS
                            && !data.is_null()
                        {
                            let mut buf = [0u8; 512];
                            let title = if CFStringGetCString(
                                data,
                                buf.as_mut_ptr() as *mut std::ffi::c_char,
                                512,
                                K_CF_STRING_ENCODING_UTF8,
                            ) != 0 {
                                let cstr = std::ffi::CStr::from_ptr(buf.as_ptr() as *const std::ffi::c_char);
                                cstr.to_string_lossy().to_string()
                            } else {
                                String::new()
                            };
                            CFRelease(data);
                            if !re.is_match(&title) { continue; }
                        } else {
                            continue;
                        }
                    }

                    results.push(wid as u64);
                }
                CFRelease(windows);
            }
            CFRelease(application);
        }
        results
    }
}

#[cfg(target_os = "macos")]
fn platform_window_get_active() -> u64 {
    unsafe {
        use mac::*;

        let mut psn = ProcessSerialNumber { high_long_of_psn: 0, low_long_of_psn: 0 };
        let mut pid: i32 = 0;
        #[allow(deprecated)]
        {
            if GetFrontProcess(&mut psn) != 0 || GetProcessPID(&psn, &mut pid) != 0 {
                return 0;
            }
        }

        let focused = AXUIElementCreateApplication(pid);
        if focused.is_null() { return 0; }

        let mut element: CFTypeRef = std::ptr::null();
        let mut result: u64 = 0;
        if AXUIElementCopyAttributeValue(focused, kAXFocusedWindowAttribute, &mut element)
            == K_AX_ERROR_SUCCESS
            && !element.is_null()
        {
            let mut wid: CGWindowID = 0;
            if _AXUIElementGetWindow(element, &mut wid) == K_AX_ERROR_SUCCESS && wid != 0 {
                result = wid as u64;
            }
            CFRelease(element);
        }
        CFRelease(focused);
        result
    }
}

#[cfg(target_os = "macos")]
fn platform_window_set_active(handle: u64) {
    if handle == 0 { return; }
    unsafe {
        use mac::*;
        with_ax_window(handle, (), |ax| {
            if AXUIElementPerformAction(ax, kAXRaiseAction) == K_AX_ERROR_SUCCESS {
                let mut pid: i32 = 0;
                if AXUIElementGetPid(ax, &mut pid) == K_AX_ERROR_SUCCESS && pid > 0 {
                    let mut psn = ProcessSerialNumber { high_long_of_psn: 0, low_long_of_psn: 0 };
                    #[allow(deprecated)]
                    {
                        if GetProcessForPID(pid, &mut psn) == 0 {
                            SetFrontProcessWithOptions(&psn, K_SET_FRONT_PROCESS_FRONT_WINDOW_ONLY);
                        }
                    }
                }
            }
        });
    }
}

#[cfg(target_os = "macos")]
fn platform_window_is_ax_enabled(prompt: Option<bool>) -> bool {
    unsafe {
        use mac::*;
        let display_prompt = if prompt.unwrap_or(false) {
            kCFBooleanTrue
        } else {
            kCFBooleanFalse
        };
        let keys: [CFTypeRef; 1] = [kAXTrustedCheckOptionPrompt];
        let vals: [CFTypeRef; 1] = [display_prompt];
        let opts = CFDictionaryCreate(
            std::ptr::null(), keys.as_ptr(), vals.as_ptr(),
            1, std::ptr::null(), std::ptr::null(),
        );
        let result = AXIsProcessTrustedWithOptions(opts) != 0;
        CFRelease(opts);
        result
    }
}

// ==================== Windows implementation ====================

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, POINT, TRUE};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;

#[cfg(target_os = "windows")]
fn hwnd(handle: u64) -> HWND {
    HWND(handle as *mut std::ffi::c_void)
}

#[cfg(target_os = "windows")]
fn platform_window_is_valid(handle: u64) -> bool {
    if handle == 0 { return false; }
    unsafe { IsWindow(hwnd(handle)).as_bool() }
}

#[cfg(target_os = "windows")]
fn platform_window_close(handle: u64) {
    if !platform_window_is_valid(handle) { return; }
    unsafe { let _ = PostMessageW(hwnd(handle), WM_CLOSE, None, None); }
}

#[cfg(target_os = "windows")]
fn platform_window_is_top_most(handle: u64) -> bool {
    if !platform_window_is_valid(handle) { return false; }
    unsafe { (GetWindowLongPtrW(hwnd(handle), GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0) != 0 }
}

#[cfg(target_os = "windows")]
fn platform_window_is_borderless(handle: u64) -> bool {
    if !platform_window_is_valid(handle) { return false; }
    unsafe {
        let style = GetWindowLongPtrW(hwnd(handle), GWL_STYLE) as u32;
        (style & WS_TILEDWINDOW.0) == 0
    }
}

#[cfg(target_os = "windows")]
fn platform_window_is_minimized(handle: u64) -> bool {
    if !platform_window_is_valid(handle) { return false; }
    unsafe {
        let style = GetWindowLongPtrW(hwnd(handle), GWL_STYLE) as u32;
        (style & WS_MINIMIZE.0) != 0
    }
}

#[cfg(target_os = "windows")]
fn platform_window_is_maximized(handle: u64) -> bool {
    if !platform_window_is_valid(handle) { return false; }
    unsafe {
        let style = GetWindowLongPtrW(hwnd(handle), GWL_STYLE) as u32;
        (style & WS_MAXIMIZE.0) != 0
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_top_most(handle: u64, top_most: bool) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let insert_after = if top_most { HWND_TOPMOST } else { HWND_NOTOPMOST };
        let _ = SetWindowPos(hwnd(handle), insert_after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_borderless(handle: u64, borderless: bool) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let h = hwnd(handle);
        let mut style = GetWindowLongPtrW(h, GWL_STYLE) as u32;
        if borderless {
            style &= !WS_TILEDWINDOW.0;
        } else {
            style |= WS_TILEDWINDOW.0;
        }
        SetWindowLongPtrW(h, GWL_STYLE, style as isize);
        let _ = SetWindowPos(
            h, None, 0, 0, 0, 0,
            SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_NOACTIVATE,
        );
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_minimized(handle: u64, minimized: bool) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let h = hwnd(handle);
        if minimized {
            ShowWindow(h, SW_MINIMIZE);
        } else if platform_window_is_minimized(handle) {
            ShowWindow(h, SW_RESTORE);
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_maximized(handle: u64, maximized: bool) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let h = hwnd(handle);
        if platform_window_is_minimized(handle) {
            ShowWindow(h, SW_RESTORE);
        }
        if maximized {
            ShowWindow(h, SW_MAXIMIZE);
        } else if platform_window_is_maximized(handle) {
            ShowWindow(h, SW_RESTORE);
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_window_get_process(handle: u64) -> i32 {
    platform_window_get_pid(handle)
}

#[cfg(target_os = "windows")]
fn platform_window_get_pid(handle: u64) -> i32 {
    if !platform_window_is_valid(handle) { return 0; }
    unsafe {
        let mut id: u32 = 0;
        GetWindowThreadProcessId(hwnd(handle), Some(&mut id));
        id as i32
    }
}

#[cfg(target_os = "windows")]
fn platform_window_get_handle(handle: u64) -> u64 { handle }

#[cfg(target_os = "windows")]
fn platform_window_set_handle(_handle: u64, new_handle: u64) -> bool {
    if new_handle == 0 { return true; }
    platform_window_is_valid(new_handle)
}

#[cfg(target_os = "windows")]
fn platform_window_get_title(handle: u64) -> String {
    if !platform_window_is_valid(handle) { return String::new(); }
    unsafe {
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd(handle), &mut buf);
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_title(handle: u64, title: String) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        let pcwstr = windows::core::PCWSTR::from_raw(wide.as_ptr());
        let _ = SetWindowTextW(hwnd(handle), pcwstr);
    }
}

#[cfg(target_os = "windows")]
fn platform_window_get_bounds(handle: u64) -> (i32, i32, i32, i32) {
    if !platform_window_is_valid(handle) { return (0, 0, 0, 0); }
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd(handle), &mut rect).is_ok() {
            (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
        } else {
            (0, 0, 0, 0)
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_bounds(handle: u64, x: i32, y: i32, w: i32, h: i32) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let _ = SetWindowPos(hwnd(handle), None, x, y, w, h, SWP_NOZORDER | SWP_NOOWNERZORDER);
    }
}

#[cfg(target_os = "windows")]
fn platform_window_get_client(handle: u64) -> (i32, i32, i32, i32) {
    if !platform_window_is_valid(handle) { return (0, 0, 0, 0); }
    unsafe {
        let h = hwnd(handle);
        let mut rect = RECT::default();
        if GetClientRect(h, &mut rect).is_err() { return (0, 0, 0, 0); }
        let mut point = POINT { x: rect.left, y: rect.top };
        let _ = windows::Win32::Graphics::Gdi::ClientToScreen(h, &mut point);
        (point.x, point.y, rect.right - rect.left, rect.bottom - rect.top)
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_client(handle: u64, x: i32, y: i32, w: i32, h: i32) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let h_wnd = hwnd(handle);
        let mut rect = RECT { left: x, top: y, right: x + w, bottom: y + h };
        let style = WINDOW_STYLE(GetWindowLongPtrW(h_wnd, GWL_STYLE) as u32);
        let ex_style = WINDOW_EX_STYLE(GetWindowLongPtrW(h_wnd, GWL_EXSTYLE) as u32);
        let has_menu = !GetMenu(h_wnd).is_invalid();
        if AdjustWindowRectEx(&mut rect, style, has_menu, ex_style).is_ok() {
            let _ = SetWindowPos(
                h_wnd, None, rect.left, rect.top,
                rect.right - rect.left, rect.bottom - rect.top,
                SWP_NOZORDER | SWP_NOOWNERZORDER,
            );
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_window_map_to_client(handle: u64, x: i32, y: i32) -> (i32, i32) {
    if !platform_window_is_valid(handle) { return (x, y); }
    let c = platform_window_get_client(handle);
    (x - c.0, y - c.1)
}

#[cfg(target_os = "windows")]
fn platform_window_map_to_screen(handle: u64, x: i32, y: i32) -> (i32, i32) {
    if !platform_window_is_valid(handle) { return (x, y); }
    let c = platform_window_get_client(handle);
    (x + c.0, y + c.1)
}

#[cfg(target_os = "windows")]
fn platform_window_get_list(regex_str: Option<String>) -> Vec<u64> {
    let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());
    let has_regex = pattern.is_some();

    struct EnumData {
        pattern: Option<regex::Regex>,
        has_regex: bool,
        results: Vec<u64>,
    }

    unsafe extern "system" fn enum_proc(hwnd_val: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd_val).as_bool() { return TRUE; }
        let handle = hwnd_val.0 as u64;
        if !platform_window_is_valid(handle) { return TRUE; }

        let data = &mut *(lparam.0 as *mut EnumData);
        if data.has_regex {
            let title = platform_window_get_title(handle);
            if let Some(ref re) = data.pattern {
                if !re.is_match(&title) { return TRUE; }
            }
        }
        data.results.push(handle);
        TRUE
    }

    let mut data = EnumData { pattern, has_regex, results: Vec::new() };
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut data as *mut EnumData as isize));
    }
    data.results
}

#[cfg(target_os = "windows")]
fn platform_window_get_active() -> u64 {
    unsafe {
        let h = GetForegroundWindow();
        h.0 as u64
    }
}

#[cfg(target_os = "windows")]
fn platform_window_set_active(handle: u64) {
    if !platform_window_is_valid(handle) { return; }
    unsafe {
        let h = hwnd(handle);
        if platform_window_is_minimized(handle) {
            ShowWindow(h, SW_RESTORE);
        }
        SetForegroundWindow(h);
    }
}

#[cfg(target_os = "windows")]
fn platform_window_is_ax_enabled(_prompt: Option<bool>) -> bool { true }

// ==================== Helper structs for complex returns ====================

#[napi(object)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[napi(object)]
pub struct WindowPoint {
    pub x: i32,
    pub y: i32,
}

// ==================== BigInt helpers ====================

fn bi_to_u64(bi: &BigInt) -> u64 {
    let (sign, val, _) = bi.get_u64();
    if sign { 0 } else { val }
}

fn u64_to_bi(val: u64) -> BigInt {
    BigInt { sign_bit: false, words: vec![val] }
}

// ==================== AsyncTask wrappers ====================

pub struct IsValidTask { handle: u64 }
impl Task for IsValidTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_valid(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct CloseTask { handle: u64 }
impl Task for CloseTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_close(self.handle); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct IsTopMostTask { handle: u64 }
impl Task for IsTopMostTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_top_most(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct IsBorderlessTask { handle: u64 }
impl Task for IsBorderlessTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_borderless(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct IsMinimizedTask { handle: u64 }
impl Task for IsMinimizedTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_minimized(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct IsMaximizedTask { handle: u64 }
impl Task for IsMaximizedTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_maximized(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct SetTopMostTask { handle: u64, top_most: bool }
impl Task for SetTopMostTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_top_most(self.handle, self.top_most); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct SetBorderlessTask { handle: u64, borderless: bool }
impl Task for SetBorderlessTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_borderless(self.handle, self.borderless); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct SetMinimizedTask { handle: u64, minimized: bool }
impl Task for SetMinimizedTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_minimized(self.handle, self.minimized); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct SetMaximizedTask { handle: u64, maximized: bool }
impl Task for SetMaximizedTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_maximized(self.handle, self.maximized); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct GetProcessTask { handle: u64 }
impl Task for GetProcessTask {
    type Output = i32;
    type JsValue = i32;
    fn compute(&mut self) -> Result<i32> { Ok(platform_window_get_process(self.handle)) }
    fn resolve(&mut self, _env: Env, out: i32) -> Result<i32> { Ok(out) }
}

pub struct GetPIDTask { handle: u64 }
impl Task for GetPIDTask {
    type Output = i32;
    type JsValue = i32;
    fn compute(&mut self) -> Result<i32> { Ok(platform_window_get_pid(self.handle)) }
    fn resolve(&mut self, _env: Env, out: i32) -> Result<i32> { Ok(out) }
}

pub struct GetHandleTask { handle: u64 }
impl Task for GetHandleTask {
    type Output = u64;
    type JsValue = BigInt;
    fn compute(&mut self) -> Result<u64> { Ok(platform_window_get_handle(self.handle)) }
    fn resolve(&mut self, _env: Env, out: u64) -> Result<BigInt> { Ok(u64_to_bi(out)) }
}

pub struct SetHandleTask { handle: u64, new_handle: u64 }
impl Task for SetHandleTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_set_handle(self.handle, self.new_handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct GetTitleTask { handle: u64 }
impl Task for GetTitleTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<String> { Ok(platform_window_get_title(self.handle)) }
    fn resolve(&mut self, _env: Env, out: String) -> Result<String> { Ok(out) }
}

pub struct SetTitleTask { handle: u64, title: String }
impl Task for SetTitleTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_title(self.handle, self.title.clone()); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct GetBoundsTask { handle: u64 }
impl Task for GetBoundsTask {
    type Output = (i32, i32, i32, i32);
    type JsValue = WindowBounds;
    fn compute(&mut self) -> Result<(i32, i32, i32, i32)> { Ok(platform_window_get_bounds(self.handle)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32, i32, i32)) -> Result<WindowBounds> {
        Ok(WindowBounds { x: out.0, y: out.1, w: out.2, h: out.3 })
    }
}

pub struct SetBoundsTask { handle: u64, x: i32, y: i32, w: i32, h: i32 }
impl Task for SetBoundsTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_bounds(self.handle, self.x, self.y, self.w, self.h); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct GetClientTask { handle: u64 }
impl Task for GetClientTask {
    type Output = (i32, i32, i32, i32);
    type JsValue = WindowBounds;
    fn compute(&mut self) -> Result<(i32, i32, i32, i32)> { Ok(platform_window_get_client(self.handle)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32, i32, i32)) -> Result<WindowBounds> {
        Ok(WindowBounds { x: out.0, y: out.1, w: out.2, h: out.3 })
    }
}

pub struct SetClientTask { handle: u64, x: i32, y: i32, w: i32, h: i32 }
impl Task for SetClientTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_client(self.handle, self.x, self.y, self.w, self.h); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct MapToClientTask { handle: u64, x: i32, y: i32 }
impl Task for MapToClientTask {
    type Output = (i32, i32);
    type JsValue = WindowPoint;
    fn compute(&mut self) -> Result<(i32, i32)> { Ok(platform_window_map_to_client(self.handle, self.x, self.y)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32)) -> Result<WindowPoint> {
        Ok(WindowPoint { x: out.0, y: out.1 })
    }
}

pub struct MapToScreenTask { handle: u64, x: i32, y: i32 }
impl Task for MapToScreenTask {
    type Output = (i32, i32);
    type JsValue = WindowPoint;
    fn compute(&mut self) -> Result<(i32, i32)> { Ok(platform_window_map_to_screen(self.handle, self.x, self.y)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32)) -> Result<WindowPoint> {
        Ok(WindowPoint { x: out.0, y: out.1 })
    }
}

pub struct GetListTask { regex_str: Option<String> }
impl Task for GetListTask {
    type Output = Vec<u64>;
    type JsValue = Vec<BigInt>;
    fn compute(&mut self) -> Result<Vec<u64>> { Ok(platform_window_get_list(self.regex_str.clone())) }
    fn resolve(&mut self, _env: Env, out: Vec<u64>) -> Result<Vec<BigInt>> {
        Ok(out.into_iter().map(u64_to_bi).collect())
    }
}

pub struct GetActiveTask;
impl Task for GetActiveTask {
    type Output = u64;
    type JsValue = BigInt;
    fn compute(&mut self) -> Result<u64> { Ok(platform_window_get_active()) }
    fn resolve(&mut self, _env: Env, out: u64) -> Result<BigInt> { Ok(u64_to_bi(out)) }
}

pub struct SetActiveTask { handle: u64 }
impl Task for SetActiveTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_active(self.handle); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

pub struct IsAxEnabledTask { prompt: Option<bool> }
impl Task for IsAxEnabledTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_ax_enabled(self.prompt)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

// ==================== NAPI exports (AsyncTask) ====================

#[napi(js_name = "window_isValid")]
pub fn window_is_valid(handle: BigInt) -> AsyncTask<IsValidTask> {
    AsyncTask::new(IsValidTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_close")]
pub fn window_close(handle: BigInt) -> AsyncTask<CloseTask> {
    AsyncTask::new(CloseTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_isTopMost")]
pub fn window_is_top_most(handle: BigInt) -> AsyncTask<IsTopMostTask> {
    AsyncTask::new(IsTopMostTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_isBorderless")]
pub fn window_is_borderless(handle: BigInt) -> AsyncTask<IsBorderlessTask> {
    AsyncTask::new(IsBorderlessTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_isMinimized")]
pub fn window_is_minimized(handle: BigInt) -> AsyncTask<IsMinimizedTask> {
    AsyncTask::new(IsMinimizedTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_isMaximized")]
pub fn window_is_maximized(handle: BigInt) -> AsyncTask<IsMaximizedTask> {
    AsyncTask::new(IsMaximizedTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_setTopMost")]
pub fn window_set_top_most(handle: BigInt, top_most: bool) -> AsyncTask<SetTopMostTask> {
    AsyncTask::new(SetTopMostTask { handle: bi_to_u64(&handle), top_most })
}

#[napi(js_name = "window_setBorderless")]
pub fn window_set_borderless(handle: BigInt, borderless: bool) -> AsyncTask<SetBorderlessTask> {
    AsyncTask::new(SetBorderlessTask { handle: bi_to_u64(&handle), borderless })
}

#[napi(js_name = "window_setMinimized")]
pub fn window_set_minimized(handle: BigInt, minimized: bool) -> AsyncTask<SetMinimizedTask> {
    AsyncTask::new(SetMinimizedTask { handle: bi_to_u64(&handle), minimized })
}

#[napi(js_name = "window_setMaximized")]
pub fn window_set_maximized(handle: BigInt, maximized: bool) -> AsyncTask<SetMaximizedTask> {
    AsyncTask::new(SetMaximizedTask { handle: bi_to_u64(&handle), maximized })
}

#[napi(js_name = "window_getProcess")]
pub fn window_get_process(handle: BigInt) -> AsyncTask<GetProcessTask> {
    AsyncTask::new(GetProcessTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_getPID")]
pub fn window_get_pid(handle: BigInt) -> AsyncTask<GetPIDTask> {
    AsyncTask::new(GetPIDTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_getHandle")]
pub fn window_get_handle(handle: BigInt) -> AsyncTask<GetHandleTask> {
    AsyncTask::new(GetHandleTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_setHandle")]
pub fn window_set_handle(handle: BigInt, new_handle: BigInt) -> AsyncTask<SetHandleTask> {
    AsyncTask::new(SetHandleTask { handle: bi_to_u64(&handle), new_handle: bi_to_u64(&new_handle) })
}

#[napi(js_name = "window_getTitle")]
pub fn window_get_title(handle: BigInt) -> AsyncTask<GetTitleTask> {
    AsyncTask::new(GetTitleTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_setTitle")]
pub fn window_set_title(handle: BigInt, title: String) -> AsyncTask<SetTitleTask> {
    AsyncTask::new(SetTitleTask { handle: bi_to_u64(&handle), title })
}

#[napi(js_name = "window_getBounds")]
pub fn window_get_bounds(handle: BigInt) -> AsyncTask<GetBoundsTask> {
    AsyncTask::new(GetBoundsTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_setBounds")]
pub fn window_set_bounds(handle: BigInt, x: i32, y: i32, w: i32, h: i32) -> AsyncTask<SetBoundsTask> {
    AsyncTask::new(SetBoundsTask { handle: bi_to_u64(&handle), x, y, w, h })
}

#[napi(js_name = "window_getClient")]
pub fn window_get_client(handle: BigInt) -> AsyncTask<GetClientTask> {
    AsyncTask::new(GetClientTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_setClient")]
pub fn window_set_client(handle: BigInt, x: i32, y: i32, w: i32, h: i32) -> AsyncTask<SetClientTask> {
    AsyncTask::new(SetClientTask { handle: bi_to_u64(&handle), x, y, w, h })
}

#[napi(js_name = "window_mapToClient")]
pub fn window_map_to_client(handle: BigInt, x: i32, y: i32) -> AsyncTask<MapToClientTask> {
    AsyncTask::new(MapToClientTask { handle: bi_to_u64(&handle), x, y })
}

#[napi(js_name = "window_mapToScreen")]
pub fn window_map_to_screen(handle: BigInt, x: i32, y: i32) -> AsyncTask<MapToScreenTask> {
    AsyncTask::new(MapToScreenTask { handle: bi_to_u64(&handle), x, y })
}

#[napi(js_name = "window_getList")]
pub fn window_get_list(regex_str: Option<String>) -> AsyncTask<GetListTask> {
    AsyncTask::new(GetListTask { regex_str })
}

#[napi(js_name = "window_getActive")]
pub fn window_get_active() -> AsyncTask<GetActiveTask> {
    AsyncTask::new(GetActiveTask)
}

#[napi(js_name = "window_setActive")]
pub fn window_set_active(handle: BigInt) -> AsyncTask<SetActiveTask> {
    AsyncTask::new(SetActiveTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_isAxEnabled")]
pub fn window_is_ax_enabled(prompt: Option<bool>) -> AsyncTask<IsAxEnabledTask> {
    AsyncTask::new(IsAxEnabledTask { prompt })
}
