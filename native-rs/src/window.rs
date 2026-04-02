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
    let d = get_display();
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

// Public helper for process.rs (Linux only)
#[cfg(target_os = "linux")]
pub unsafe fn enum_windows_with_pid(root: Window, pattern: Option<&regex::Regex>, pid: i32, results: &mut Vec<u64>) {
    load_atoms();
    enum_windows(root, pattern, pid, results);
}

// --- NAPI exports (Linux) ---

#[cfg(target_os = "linux")]
#[napi(js_name = "window_isValid")]
pub fn window_is_valid(handle: f64) -> bool {
    unsafe { win_is_valid(handle as u64) }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_close")]
pub fn window_close(handle: f64) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        XDestroyWindow(d, h as Window);
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_isTopMost")]
pub fn window_is_top_most(handle: f64) -> bool {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(h as Window, STATE_TOPMOST)
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_isBorderless")]
pub fn window_is_borderless(handle: f64) -> bool {
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
#[napi(js_name = "window_isMinimized")]
pub fn window_is_minimized(handle: f64) -> bool {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(h as Window, STATE_MINIMIZE)
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_isMaximized")]
pub fn window_is_maximized(handle: f64) -> bool {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return false; }
        let _xe = XDismissErrors::new();
        get_wm_state(h as Window, STATE_MAXIMIZE)
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_setTopMost")]
pub fn window_set_top_most(handle: f64, top_most: bool) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(h as Window, STATE_TOPMOST, top_most);
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_setBorderless")]
pub fn window_set_borderless(handle: f64, borderless: bool) {
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
#[napi(js_name = "window_setMinimized")]
pub fn window_set_minimized(handle: f64, minimized: bool) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(h as Window, STATE_MINIMIZE, minimized);
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_setMaximized")]
pub fn window_set_maximized(handle: f64, maximized: bool) {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return; }
        let _xe = XDismissErrors::new();
        set_wm_state(h as Window, STATE_MINIMIZE, false);
        set_wm_state(h as Window, STATE_MAXIMIZE, maximized);
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_getProcess")]
pub fn window_get_process(handle: f64) -> f64 {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return 0.0; }
        get_pid(h as Window) as f64
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_getPID")]
pub fn window_get_pid(handle: f64) -> f64 {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return 0.0; }
        get_pid(h as Window) as f64
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_getHandle")]
pub fn window_get_handle(handle: f64) -> f64 {
    handle
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_setHandle")]
pub fn window_set_handle(handle: f64, new_handle: f64) -> bool {
    unsafe { validate_handle(new_handle as u64) != 0 || new_handle == 0.0 }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_getTitle")]
pub fn window_get_title(handle: f64) -> String {
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) { return String::new(); }
        get_title(h as Window)
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_setTitle")]
pub fn window_set_title(handle: f64, title: String) {
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
#[napi(js_name = "window_getBounds")]
pub fn window_get_bounds(env: Env, handle: f64) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            obj.set("x", 0)?; obj.set("y", 0)?; obj.set("w", 0)?; obj.set("h", 0)?;
            return Ok(obj);
        }
        let _xe = XDismissErrors::new();
        let client = get_client(h as Window);
        let frame = get_frame(h as Window);
        obj.set("x", client.0 - frame.0)?;
        obj.set("y", client.1 - frame.1)?;
        obj.set("w", client.2 + frame.2)?;
        obj.set("h", client.3 + frame.3)?;
    }
    Ok(obj)
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_setBounds")]
pub fn window_set_bounds(handle: f64, x: i32, y: i32, w: i32, h: i32) {
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
#[napi(js_name = "window_getClient")]
pub fn window_get_client(env: Env, handle: f64) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            obj.set("x", 0)?; obj.set("y", 0)?; obj.set("w", 0)?; obj.set("h", 0)?;
            return Ok(obj);
        }
        let _xe = XDismissErrors::new();
        let c = get_client(h as Window);
        obj.set("x", c.0)?; obj.set("y", c.1)?; obj.set("w", c.2)?; obj.set("h", c.3)?;
    }
    Ok(obj)
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_setClient")]
pub fn window_set_client(handle: f64, x: i32, y: i32, w: i32, h: i32) {
    unsafe {
        let hh = handle as u64;
        if !win_is_valid(hh) { return; }
        let d = get_display();
        let _xe = XDismissErrors::new();
        XMoveResizeWindow(d, hh as Window, x, y, w.max(1) as c_uint, h.max(1) as c_uint);
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_mapToClient")]
pub fn window_map_to_client(env: Env, handle: f64, x: i32, y: i32) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            obj.set("x", x)?; obj.set("y", y)?;
            return Ok(obj);
        }
        let _xe = XDismissErrors::new();
        let c = get_client(h as Window);
        obj.set("x", x - c.0)?;
        obj.set("y", y - c.1)?;
    }
    Ok(obj)
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_mapToScreen")]
pub fn window_map_to_screen(env: Env, handle: f64, x: i32, y: i32) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    unsafe {
        let h = handle as u64;
        if !win_is_valid(h) {
            obj.set("x", x)?; obj.set("y", y)?;
            return Ok(obj);
        }
        let _xe = XDismissErrors::new();
        let c = get_client(h as Window);
        obj.set("x", x + c.0)?;
        obj.set("y", y + c.1)?;
    }
    Ok(obj)
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_getList")]
pub fn window_get_list(env: Env, regex_str: Option<String>) -> Result<napi::JsObject> {
    unsafe {
        let d = get_display();
        if d.is_null() {
            return Ok(env.create_array(0)?.coerce_to_object()?);
        }
        load_atoms();
        let _xe = XDismissErrors::new();

        let pattern = regex_str.as_ref().map(|s| regex::Regex::new(s).ok()).flatten();
        let mut results = Vec::new();
        let root = XDefaultRootWindow(d);
        enum_windows(root, pattern.as_ref(), 0, &mut results);

        let mut arr = env.create_array(results.len() as u32)?;
        for (i, &h) in results.iter().enumerate() {
            arr.set(i as u32, h as f64)?;
        }
        Ok(arr.coerce_to_object()?)
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_getActive")]
pub fn window_get_active() -> f64 {
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
#[napi(js_name = "window_setActive")]
pub fn window_set_active(handle: f64) {
    unsafe {
        let h = handle as u64;
        if h == 0 { return; }
        let _xe = XDismissErrors::new();
        window_set_active_internal(h as Window);
    }
}

#[cfg(target_os = "linux")]
#[napi(js_name = "window_isAxEnabled")]
pub fn window_is_ax_enabled(_prompt: Option<bool>) -> bool {
    true
}

// ==================== Non-Linux stubs ====================

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_isValid")]
pub fn window_is_valid(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_close")]
pub fn window_close(_handle: f64) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_isTopMost")]
pub fn window_is_top_most(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_isBorderless")]
pub fn window_is_borderless(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_isMinimized")]
pub fn window_is_minimized(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_isMaximized")]
pub fn window_is_maximized(_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setTopMost")]
pub fn window_set_top_most(_handle: f64, _top_most: bool) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setBorderless")]
pub fn window_set_borderless(_handle: f64, _borderless: bool) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setMinimized")]
pub fn window_set_minimized(_handle: f64, _minimized: bool) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setMaximized")]
pub fn window_set_maximized(_handle: f64, _maximized: bool) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getProcess")]
pub fn window_get_process(_handle: f64) -> f64 { 0.0 }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getPID")]
pub fn window_get_pid(_handle: f64) -> f64 { 0.0 }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getHandle")]
pub fn window_get_handle(handle: f64) -> f64 { handle }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setHandle")]
pub fn window_set_handle(_handle: f64, _new_handle: f64) -> bool { false }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getTitle")]
pub fn window_get_title(_handle: f64) -> String { String::new() }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setTitle")]
pub fn window_set_title(_handle: f64, _title: String) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getBounds")]
pub fn window_get_bounds(env: Env, _handle: f64) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    obj.set("x", 0)?; obj.set("y", 0)?; obj.set("w", 0)?; obj.set("h", 0)?;
    Ok(obj)
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setBounds")]
pub fn window_set_bounds(_handle: f64, _x: i32, _y: i32, _w: i32, _h: i32) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getClient")]
pub fn window_get_client(env: Env, _handle: f64) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    obj.set("x", 0)?; obj.set("y", 0)?; obj.set("w", 0)?; obj.set("h", 0)?;
    Ok(obj)
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setClient")]
pub fn window_set_client(_handle: f64, _x: i32, _y: i32, _w: i32, _h: i32) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_mapToClient")]
pub fn window_map_to_client(env: Env, _handle: f64, x: i32, y: i32) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    obj.set("x", x)?; obj.set("y", y)?;
    Ok(obj)
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_mapToScreen")]
pub fn window_map_to_screen(env: Env, _handle: f64, x: i32, y: i32) -> Result<napi::JsObject> {
    let mut obj = env.create_object()?;
    obj.set("x", x)?; obj.set("y", y)?;
    Ok(obj)
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getList")]
pub fn window_get_list(env: Env, _regex_str: Option<String>) -> Result<napi::JsObject> {
    Ok(env.create_array(0)?.coerce_to_object()?)
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_getActive")]
pub fn window_get_active() -> f64 { 0.0 }

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_setActive")]
pub fn window_set_active(_handle: f64) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "window_isAxEnabled")]
pub fn window_is_ax_enabled(_prompt: Option<bool>) -> bool { false }
