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
fn platform_window_is_valid(handle: f64) -> bool {
    unsafe { win_is_valid(handle as u64) }
}

#[cfg(target_os = "linux")]
fn platform_window_close(handle: f64) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        XDestroyWindow(d, h as Window);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_top_most(handle: f64) -> bool {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(h as Window, STATE_TOPMOST)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_borderless(handle: f64) -> bool {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return false; }
        load_atoms();
        let _xe = XDismissErrors::new();
        let result = get_window_property(h as Window, WM_HINTS, None);
        if result.is_null() { return false; }
        let decorations = *(result as *const c_ulong).add(2);
        XFree(result as *mut c_void);
        decorations == 0
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_minimized(handle: f64) -> bool {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(h as Window, STATE_MINIMIZE)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_maximized(handle: f64) -> bool {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(h as Window, STATE_MAXIMIZE)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_top_most(handle: f64, top_most: bool) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(h as Window, STATE_TOPMOST, top_most);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_borderless(handle: f64, borderless: bool) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
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
            XChangeProperty(d, h as Window, WM_HINTS, WM_HINTS, 32, PropModeReplace,
                &hints as *const Hints as *const u8, 5);
        }
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_minimized(handle: f64, minimized: bool) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(h as Window, STATE_MINIMIZE, minimized);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_maximized(handle: f64, maximized: bool) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(h as Window, STATE_MINIMIZE, false);
        set_wm_state(h as Window, STATE_MAXIMIZE, maximized);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_process(handle: f64) -> f64 {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return 0.0; }
        get_pid(h as Window) as f64
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_pid(handle: f64) -> f64 {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return 0.0; }
        get_pid(h as Window) as f64
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_handle(handle: f64) -> f64 {
    handle
}

#[cfg(target_os = "linux")]
fn platform_window_set_handle(_handle: f64, new_handle: f64) -> bool {
    unsafe { validate_handle(new_handle as u64) != 0 || new_handle == 0.0 }
}

#[cfg(target_os = "linux")]
fn platform_window_get_title(handle: f64) -> String {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return String::new(); }
        get_title(h as Window)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_title(handle: f64, title: String) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        if let Ok(cstr) = CString::new(title.as_bytes()) {
            XStoreName(d, h as Window, cstr.as_ptr());
        }
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_bounds(handle: f64) -> (i32, i32, i32, i32) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            return (0, 0, 0, 0);
        }
        let _xe = XDismissErrors::new();
        let client = get_client(h as Window);
        let frame = get_frame(h as Window);
        (client.0 - frame.0, client.1 - frame.1, client.2 + frame.2, client.3 + frame.3)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_bounds(handle: f64, x: i32, y: i32, w: i32, h: i32) {
    unsafe {
        let hh = handle as u64;
        if !win_is_valid(hh) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        let frame = get_frame(hh as Window);
        XMoveResizeWindow(d, hh as Window, x, y,
            (w - frame.2).max(1) as c_uint,
            (h - frame.3).max(1) as c_uint);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_client(handle: f64) -> (i32, i32, i32, i32) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            return (0, 0, 0, 0);
        }
        let _xe = XDismissErrors::new();
        get_client(h as Window)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_client(handle: f64, x: i32, y: i32, w: i32, h: i32) {
    unsafe {
        let hh = handle as u64;
        if !win_is_valid(hh) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        XMoveResizeWindow(d, hh as Window, x, y, w.max(1) as c_uint, h.max(1) as c_uint);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_map_to_client(handle: f64, x: i32, y: i32) -> (i32, i32) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            return (x, y);
        }
        let _xe = XDismissErrors::new();
        let c = get_client(h as Window);
        (x - c.0, y - c.1)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_map_to_screen(handle: f64, x: i32, y: i32) -> (i32, i32) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            return (x, y);
        }
        let _xe = XDismissErrors::new();
        let c = get_client(h as Window);
        (x + c.0, y + c.1)
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_list(regex_str: Option<String>) -> Vec<f64> {
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

        results.into_iter().map(|h| h as f64).collect()
    }
}

#[cfg(target_os = "linux")]
fn platform_window_get_active() -> f64 {
    unsafe {
        let d = get_display();
        if d.is_null() { return 0.0; }
        load_atoms();
        let _xe = XDismissErrors::new();

        if WM_ACTIVE != None_ {
            let root = XDefaultRootWindow(d);
            let result = get_window_property(root, WM_ACTIVE, None);
            if !result.is_null() {
                let win = *(result as *const Window);
                XFree(result as *mut c_void);
                return win as f64;
            }
        }
        0.0
    }
}

#[cfg(target_os = "linux")]
fn platform_window_set_active(handle: f64) {
    unsafe {
        let h = handle as u64;
        if h == 0 { return; }
        let _xe = XDismissErrors::new();
        window_set_active_internal(h as Window);
    }
}

#[cfg(target_os = "linux")]
fn platform_window_is_ax_enabled(_prompt: Option<bool>) -> bool {
    true
}

// ==================== Non-Linux stubs ====================

#[cfg(not(target_os = "linux"))]
fn platform_window_is_valid(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
fn platform_window_close(_handle: f64) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_is_top_most(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
fn platform_window_is_borderless(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
fn platform_window_is_minimized(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
fn platform_window_is_maximized(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
fn platform_window_set_top_most(_handle: f64, _top_most: bool) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_set_borderless(_handle: f64, _borderless: bool) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_set_minimized(_handle: f64, _minimized: bool) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_set_maximized(_handle: f64, _maximized: bool) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_get_process(_handle: f64) -> f64 { 0.0 }

#[cfg(not(target_os = "linux"))]
fn platform_window_get_pid(_handle: f64) -> f64 { 0.0 }

#[cfg(not(target_os = "linux"))]
fn platform_window_get_handle(handle: f64) -> f64 { handle }

#[cfg(not(target_os = "linux"))]
fn platform_window_set_handle(_handle: f64, new_handle: f64) -> bool { new_handle == 0.0 }

#[cfg(not(target_os = "linux"))]
fn platform_window_get_title(_handle: f64) -> String { String::new() }

#[cfg(not(target_os = "linux"))]
fn platform_window_set_title(_handle: f64, _title: String) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_get_bounds(_handle: f64) -> (i32, i32, i32, i32) { (0, 0, 0, 0) }

#[cfg(not(target_os = "linux"))]
fn platform_window_set_bounds(_handle: f64, _x: i32, _y: i32, _w: i32, _h: i32) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_get_client(_handle: f64) -> (i32, i32, i32, i32) { (0, 0, 0, 0) }

#[cfg(not(target_os = "linux"))]
fn platform_window_set_client(_handle: f64, _x: i32, _y: i32, _w: i32, _h: i32) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_map_to_client(_handle: f64, x: i32, y: i32) -> (i32, i32) { (x, y) }

#[cfg(not(target_os = "linux"))]
fn platform_window_map_to_screen(_handle: f64, x: i32, y: i32) -> (i32, i32) { (x, y) }

#[cfg(not(target_os = "linux"))]
fn platform_window_get_list(_regex_str: Option<String>) -> Vec<f64> { Vec::new() }

#[cfg(not(target_os = "linux"))]
fn platform_window_get_active() -> f64 { 0.0 }

#[cfg(not(target_os = "linux"))]
fn platform_window_set_active(_handle: f64) {}

#[cfg(not(target_os = "linux"))]
fn platform_window_is_ax_enabled(_prompt: Option<bool>) -> bool { false }

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

// ==================== AsyncTask wrappers ====================

struct IsValidTask { handle: f64 }
impl Task for IsValidTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_valid(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

struct CloseTask { handle: f64 }
impl Task for CloseTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_close(self.handle); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct IsTopMostTask { handle: f64 }
impl Task for IsTopMostTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_top_most(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

struct IsBorderlessTask { handle: f64 }
impl Task for IsBorderlessTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_borderless(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

struct IsMinimizedTask { handle: f64 }
impl Task for IsMinimizedTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_minimized(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

struct IsMaximizedTask { handle: f64 }
impl Task for IsMaximizedTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_maximized(self.handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

struct SetTopMostTask { handle: f64, top_most: bool }
impl Task for SetTopMostTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_top_most(self.handle, self.top_most); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct SetBorderlessTask { handle: f64, borderless: bool }
impl Task for SetBorderlessTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_borderless(self.handle, self.borderless); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct SetMinimizedTask { handle: f64, minimized: bool }
impl Task for SetMinimizedTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_minimized(self.handle, self.minimized); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct SetMaximizedTask { handle: f64, maximized: bool }
impl Task for SetMaximizedTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_maximized(self.handle, self.maximized); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct GetProcessTask { handle: f64 }
impl Task for GetProcessTask {
    type Output = f64;
    type JsValue = f64;
    fn compute(&mut self) -> Result<f64> { Ok(platform_window_get_process(self.handle)) }
    fn resolve(&mut self, _env: Env, out: f64) -> Result<f64> { Ok(out) }
}

struct GetPIDTask { handle: f64 }
impl Task for GetPIDTask {
    type Output = f64;
    type JsValue = f64;
    fn compute(&mut self) -> Result<f64> { Ok(platform_window_get_pid(self.handle)) }
    fn resolve(&mut self, _env: Env, out: f64) -> Result<f64> { Ok(out) }
}

struct GetHandleTask { handle: f64 }
impl Task for GetHandleTask {
    type Output = f64;
    type JsValue = f64;
    fn compute(&mut self) -> Result<f64> { Ok(platform_window_get_handle(self.handle)) }
    fn resolve(&mut self, _env: Env, out: f64) -> Result<f64> { Ok(out) }
}

struct SetHandleTask { handle: f64, new_handle: f64 }
impl Task for SetHandleTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_set_handle(self.handle, self.new_handle)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

struct GetTitleTask { handle: f64 }
impl Task for GetTitleTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<String> { Ok(platform_window_get_title(self.handle)) }
    fn resolve(&mut self, _env: Env, out: String) -> Result<String> { Ok(out) }
}

struct SetTitleTask { handle: f64, title: String }
impl Task for SetTitleTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_title(self.handle, self.title.clone()); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct GetBoundsTask { handle: f64 }
impl Task for GetBoundsTask {
    type Output = (i32, i32, i32, i32);
    type JsValue = WindowBounds;
    fn compute(&mut self) -> Result<(i32, i32, i32, i32)> { Ok(platform_window_get_bounds(self.handle)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32, i32, i32)) -> Result<WindowBounds> {
        Ok(WindowBounds { x: out.0, y: out.1, w: out.2, h: out.3 })
    }
}

struct SetBoundsTask { handle: f64, x: i32, y: i32, w: i32, h: i32 }
impl Task for SetBoundsTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_bounds(self.handle, self.x, self.y, self.w, self.h); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct GetClientTask { handle: f64 }
impl Task for GetClientTask {
    type Output = (i32, i32, i32, i32);
    type JsValue = WindowBounds;
    fn compute(&mut self) -> Result<(i32, i32, i32, i32)> { Ok(platform_window_get_client(self.handle)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32, i32, i32)) -> Result<WindowBounds> {
        Ok(WindowBounds { x: out.0, y: out.1, w: out.2, h: out.3 })
    }
}

struct SetClientTask { handle: f64, x: i32, y: i32, w: i32, h: i32 }
impl Task for SetClientTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_client(self.handle, self.x, self.y, self.w, self.h); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct MapToClientTask { handle: f64, x: i32, y: i32 }
impl Task for MapToClientTask {
    type Output = (i32, i32);
    type JsValue = WindowPoint;
    fn compute(&mut self) -> Result<(i32, i32)> { Ok(platform_window_map_to_client(self.handle, self.x, self.y)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32)) -> Result<WindowPoint> {
        Ok(WindowPoint { x: out.0, y: out.1 })
    }
}

struct MapToScreenTask { handle: f64, x: i32, y: i32 }
impl Task for MapToScreenTask {
    type Output = (i32, i32);
    type JsValue = WindowPoint;
    fn compute(&mut self) -> Result<(i32, i32)> { Ok(platform_window_map_to_screen(self.handle, self.x, self.y)) }
    fn resolve(&mut self, _env: Env, out: (i32, i32)) -> Result<WindowPoint> {
        Ok(WindowPoint { x: out.0, y: out.1 })
    }
}

struct GetListTask { regex_str: Option<String> }
impl Task for GetListTask {
    type Output = Vec<f64>;
    type JsValue = Vec<f64>;
    fn compute(&mut self) -> Result<Vec<f64>> { Ok(platform_window_get_list(self.regex_str.clone())) }
    fn resolve(&mut self, _env: Env, out: Vec<f64>) -> Result<Vec<f64>> { Ok(out) }
}

struct GetActiveTask;
impl Task for GetActiveTask {
    type Output = f64;
    type JsValue = f64;
    fn compute(&mut self) -> Result<f64> { Ok(platform_window_get_active()) }
    fn resolve(&mut self, _env: Env, out: f64) -> Result<f64> { Ok(out) }
}

struct SetActiveTask { handle: f64 }
impl Task for SetActiveTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_window_set_active(self.handle); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

struct IsAxEnabledTask { prompt: Option<bool> }
impl Task for IsAxEnabledTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_window_is_ax_enabled(self.prompt)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

// ==================== NAPI exports (AsyncTask) ====================

#[napi(js_name = "window_isValid")]
pub fn window_is_valid(handle: f64) -> AsyncTask<IsValidTask> {
    AsyncTask::new(IsValidTask { handle })
}

#[napi(js_name = "window_close")]
pub fn window_close(handle: f64) -> AsyncTask<CloseTask> {
    AsyncTask::new(CloseTask { handle })
}

#[napi(js_name = "window_isTopMost")]
pub fn window_is_top_most(handle: f64) -> AsyncTask<IsTopMostTask> {
    AsyncTask::new(IsTopMostTask { handle })
}

#[napi(js_name = "window_isBorderless")]
pub fn window_is_borderless(handle: f64) -> AsyncTask<IsBorderlessTask> {
    AsyncTask::new(IsBorderlessTask { handle })
}

#[napi(js_name = "window_isMinimized")]
pub fn window_is_minimized(handle: f64) -> AsyncTask<IsMinimizedTask> {
    AsyncTask::new(IsMinimizedTask { handle })
}

#[napi(js_name = "window_isMaximized")]
pub fn window_is_maximized(handle: f64) -> AsyncTask<IsMaximizedTask> {
    AsyncTask::new(IsMaximizedTask { handle })
}

#[napi(js_name = "window_setTopMost")]
pub fn window_set_top_most(handle: f64, top_most: bool) -> AsyncTask<SetTopMostTask> {
    AsyncTask::new(SetTopMostTask { handle, top_most })
}

#[napi(js_name = "window_setBorderless")]
pub fn window_set_borderless(handle: f64, borderless: bool) -> AsyncTask<SetBorderlessTask> {
    AsyncTask::new(SetBorderlessTask { handle, borderless })
}

#[napi(js_name = "window_setMinimized")]
pub fn window_set_minimized(handle: f64, minimized: bool) -> AsyncTask<SetMinimizedTask> {
    AsyncTask::new(SetMinimizedTask { handle, minimized })
}

#[napi(js_name = "window_setMaximized")]
pub fn window_set_maximized(handle: f64, maximized: bool) -> AsyncTask<SetMaximizedTask> {
    AsyncTask::new(SetMaximizedTask { handle, maximized })
}

#[napi(js_name = "window_getProcess")]
pub fn window_get_process(handle: f64) -> AsyncTask<GetProcessTask> {
    AsyncTask::new(GetProcessTask { handle })
}

#[napi(js_name = "window_getPID")]
pub fn window_get_pid(handle: f64) -> AsyncTask<GetPIDTask> {
    AsyncTask::new(GetPIDTask { handle })
}

#[napi(js_name = "window_getHandle")]
pub fn window_get_handle(handle: f64) -> AsyncTask<GetHandleTask> {
    AsyncTask::new(GetHandleTask { handle })
}

#[napi(js_name = "window_setHandle")]
pub fn window_set_handle(handle: f64, new_handle: f64) -> AsyncTask<SetHandleTask> {
    AsyncTask::new(SetHandleTask { handle, new_handle })
}

#[napi(js_name = "window_getTitle")]
pub fn window_get_title(handle: f64) -> AsyncTask<GetTitleTask> {
    AsyncTask::new(GetTitleTask { handle })
}

#[napi(js_name = "window_setTitle")]
pub fn window_set_title(handle: f64, title: String) -> AsyncTask<SetTitleTask> {
    AsyncTask::new(SetTitleTask { handle, title })
}

#[napi(js_name = "window_getBounds")]
pub fn window_get_bounds(handle: f64) -> AsyncTask<GetBoundsTask> {
    AsyncTask::new(GetBoundsTask { handle })
}

#[napi(js_name = "window_setBounds")]
pub fn window_set_bounds(handle: f64, x: i32, y: i32, w: i32, h: i32) -> AsyncTask<SetBoundsTask> {
    AsyncTask::new(SetBoundsTask { handle, x, y, w, h })
}

#[napi(js_name = "window_getClient")]
pub fn window_get_client(handle: f64) -> AsyncTask<GetClientTask> {
    AsyncTask::new(GetClientTask { handle })
}

#[napi(js_name = "window_setClient")]
pub fn window_set_client(handle: f64, x: i32, y: i32, w: i32, h: i32) -> AsyncTask<SetClientTask> {
    AsyncTask::new(SetClientTask { handle, x, y, w, h })
}

#[napi(js_name = "window_mapToClient")]
pub fn window_map_to_client(handle: f64, x: i32, y: i32) -> AsyncTask<MapToClientTask> {
    AsyncTask::new(MapToClientTask { handle, x, y })
}

#[napi(js_name = "window_mapToScreen")]
pub fn window_map_to_screen(handle: f64, x: i32, y: i32) -> AsyncTask<MapToScreenTask> {
    AsyncTask::new(MapToScreenTask { handle, x, y })
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
pub fn window_set_active(handle: f64) -> AsyncTask<SetActiveTask> {
    AsyncTask::new(SetActiveTask { handle })
}

#[napi(js_name = "window_isAxEnabled")]
pub fn window_is_ax_enabled(prompt: Option<bool>) -> AsyncTask<IsAxEnabledTask> {
    AsyncTask::new(IsAxEnabledTask { prompt })
}
