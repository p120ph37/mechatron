#![allow(non_upper_case_globals, non_camel_case_types, dead_code)]

use std::ffi::{c_char, c_int, c_long, c_uint, c_ulong, c_void};
use std::ptr;
use std::sync::Once;

// --- Core X11 types ---
pub type Display = c_void;
pub type XID = c_ulong;
pub type Window = XID;
pub type Atom = c_ulong;
pub type Bool = c_int;
pub type Status = c_int;
pub type KeyCode = u8;
pub type KeySym = XID;
pub type Time = c_ulong;
pub type Colormap = XID;
pub type Cursor = XID;
pub type Visual = c_void;
pub type Screen = c_void;

pub const None_: c_ulong = 0;
pub const True_: Bool = 1;
pub const False_: Bool = 0;
pub const CurrentTime: Time = 0;
pub const AnyPropertyType: Atom = 0;
pub const IsViewable: c_int = 2;
pub const PropModeReplace: c_int = 0;
pub const ClientMessage: c_int = 33;
pub const SubstructureNotifyMask: c_long = 1 << 19;
pub const SubstructureRedirectMask: c_long = 1 << 20;
pub const AllPlanes: c_ulong = !0;
pub const ZPixmap: c_int = 2;
pub const XA_CARDINAL: Atom = 6;

pub const Button1Mask: c_uint = 1 << 8;
pub const Button2Mask: c_uint = 1 << 9;
pub const Button3Mask: c_uint = 1 << 10;

#[repr(C)]
pub struct XWindowAttributes {
    pub x: c_int,
    pub y: c_int,
    pub width: c_int,
    pub height: c_int,
    pub border_width: c_int,
    pub depth: c_int,
    pub visual: *mut Visual,
    pub root: Window,
    pub class: c_int,
    pub bit_gravity: c_int,
    pub win_gravity: c_int,
    pub backing_store: c_int,
    pub backing_planes: c_ulong,
    pub backing_pixel: c_ulong,
    pub save_under: Bool,
    pub colormap: Colormap,
    pub map_installed: Bool,
    pub map_state: c_int,
    pub all_event_masks: c_long,
    pub your_event_mask: c_long,
    pub do_not_propagate_mask: c_long,
    pub override_redirect: Bool,
    pub screen: *mut Screen,
}

#[repr(C)]
pub struct XImage {
    pub width: c_int,
    pub height: c_int,
    pub xoffset: c_int,
    pub format: c_int,
    pub data: *mut c_char,
    pub byte_order: c_int,
    pub bitmap_unit: c_int,
    pub bitmap_bit_order: c_int,
    pub bitmap_pad: c_int,
    pub depth: c_int,
    pub bytes_per_line: c_int,
    pub bits_per_pixel: c_int,
    pub red_mask: c_ulong,
    pub green_mask: c_ulong,
    pub blue_mask: c_ulong,
    // ... more fields follow but we don't need them
}

#[repr(C)]
pub struct XClientMessageEvent {
    pub type_: c_int,
    pub serial: c_ulong,
    pub send_event: Bool,
    pub display: *mut Display,
    pub window: Window,
    pub message_type: Atom,
    pub format: c_int,
    pub data: XClientMessageData,
}

#[repr(C)]
pub union XClientMessageData {
    pub b: [c_char; 20],
    pub s: [i16; 10],
    pub l: [c_long; 5],
}

// XEvent is a large union; we only ever use it as a pointer to XClientMessageEvent
pub type XEvent = [u8; 192]; // XEvent is 192 bytes on x86_64

#[repr(C)]
pub struct XineramaScreenInfo {
    pub screen_number: c_int,
    pub x_org: i16,
    pub y_org: i16,
    pub width: i16,
    pub height: i16,
}

extern "C" {
    // Core Xlib
    pub fn XOpenDisplay(name: *const c_char) -> *mut Display;
    pub fn XSync(display: *mut Display, discard: Bool) -> c_int;
    pub fn XFlush(display: *mut Display) -> c_int;
    pub fn XFree(data: *mut c_void) -> c_int;
    pub fn XDefaultRootWindow(display: *mut Display) -> Window;
    pub fn XRootWindow(display: *mut Display, screen: c_int) -> Window;
    pub fn XScreenCount(display: *mut Display) -> c_int;
    pub fn XDefaultScreen(display: *mut Display) -> c_int;
    pub fn XScreenOfDisplay(display: *mut Display, screen: c_int) -> *mut Screen;
    pub fn XWidthOfScreen(screen: *mut Screen) -> c_int;
    pub fn XHeightOfScreen(screen: *mut Screen) -> c_int;
    pub fn XScreenNumberOfScreen(screen: *mut Screen) -> c_int;
    pub fn XInternAtom(display: *mut Display, name: *const c_char, only_if_exists: Bool) -> Atom;
    pub fn XGetWindowProperty(
        display: *mut Display, w: Window, property: Atom,
        long_offset: c_long, long_length: c_long, delete: Bool,
        req_type: Atom, actual_type: *mut Atom, actual_format: *mut c_int,
        nitems: *mut c_ulong, bytes_after: *mut c_ulong,
        prop: *mut *mut u8,
    ) -> c_int;
    pub fn XGetWindowAttributes(
        display: *mut Display, w: Window, attrs: *mut XWindowAttributes,
    ) -> Status;
    pub fn XQueryTree(
        display: *mut Display, w: Window,
        root_return: *mut Window, parent_return: *mut Window,
        children_return: *mut *mut Window, nchildren_return: *mut c_uint,
    ) -> Status;
    pub fn XDestroyWindow(display: *mut Display, w: Window) -> c_int;
    pub fn XChangeProperty(
        display: *mut Display, w: Window, property: Atom, type_: Atom,
        format: c_int, mode: c_int, data: *const u8, nelements: c_int,
    ) -> c_int;
    pub fn XSendEvent(
        display: *mut Display, w: Window, propagate: Bool,
        event_mask: c_long, event: *mut XEvent,
    ) -> Status;
    pub fn XIconifyWindow(display: *mut Display, w: Window, screen: c_int) -> Status;
    pub fn XMoveResizeWindow(
        display: *mut Display, w: Window, x: c_int, y: c_int, w2: c_uint, h: c_uint,
    ) -> c_int;
    pub fn XResizeWindow(display: *mut Display, w: Window, width: c_uint, height: c_uint) -> c_int;
    pub fn XRaiseWindow(display: *mut Display, w: Window) -> c_int;
    pub fn XSetInputFocus(
        display: *mut Display, focus: Window, revert_to: c_int, time: Time,
    ) -> c_int;
    pub fn XMapWindow(display: *mut Display, w: Window) -> c_int;
    pub fn XGetImage(
        display: *mut Display, d: Window,
        x: c_int, y: c_int, width: c_uint, height: c_uint,
        plane_mask: c_ulong, format: c_int,
    ) -> *mut XImage;
    pub fn XGetPixel(image: *mut XImage, x: c_int, y: c_int) -> c_ulong;
    pub fn XDestroyImage(image: *mut XImage) -> c_int;
    pub fn XSetErrorHandler(
        handler: Option<unsafe extern "C" fn(*mut Display, *mut c_void) -> c_int>,
    ) -> Option<unsafe extern "C" fn(*mut Display, *mut c_void) -> c_int>;
    pub fn XStoreName(display: *mut Display, w: Window, name: *const c_char) -> c_int;

    // Keyboard
    pub fn XKeysymToKeycode(display: *mut Display, keysym: KeySym) -> KeyCode;
    pub fn XQueryKeymap(display: *mut Display, keys_return: *mut [c_char; 32]);

    // Pointer
    pub fn XQueryPointer(
        display: *mut Display, w: Window,
        root_return: *mut Window, child_return: *mut Window,
        root_x: *mut c_int, root_y: *mut c_int,
        win_x: *mut c_int, win_y: *mut c_int,
        mask_return: *mut c_uint,
    ) -> Bool;
    pub fn XWarpPointer(
        display: *mut Display, src_w: Window, dest_w: Window,
        src_x: c_int, src_y: c_int, src_width: c_uint, src_height: c_uint,
        dest_x: c_int, dest_y: c_int,
    ) -> c_int;

    // XTest extension
    pub fn XTestQueryExtension(
        display: *mut Display,
        event_base: *mut c_int, error_base: *mut c_int,
        major: *mut c_int, minor: *mut c_int,
    ) -> Bool;
    pub fn XTestFakeKeyEvent(
        display: *mut Display, keycode: c_uint, is_press: Bool, delay: Time,
    ) -> c_int;
    pub fn XTestFakeButtonEvent(
        display: *mut Display, button: c_uint, is_press: Bool, delay: Time,
    ) -> c_int;
    pub fn XTestGrabControl(display: *mut Display, impervious: Bool) -> c_int;

    // XQueryExtension
    pub fn XQueryExtension(
        display: *mut Display, name: *const c_char,
        major_opcode: *mut c_int, first_event: *mut c_int, first_error: *mut c_int,
    ) -> Bool;

    // Xinerama extension
    pub fn XineramaQueryVersion(
        display: *mut Display, major: *mut c_int, minor: *mut c_int,
    ) -> Bool;
    pub fn XineramaIsActive(display: *mut Display) -> Bool;
    pub fn XineramaQueryScreens(display: *mut Display, number: *mut c_int) -> *mut XineramaScreenInfo;

    // Xutil
    pub fn XFetchName(display: *mut Display, w: Window, name: *mut *mut c_char) -> Status;
    pub fn XGetWMName(display: *mut Display, w: Window, text_prop: *mut XTextProperty) -> Status;
    pub fn Xutf8TextPropertyToTextList(
        display: *mut Display, text_prop: *const XTextProperty,
        list_return: *mut *mut *mut c_char, count_return: *mut c_int,
    ) -> c_int;
    pub fn XFreeStringList(list: *mut *mut c_char);
}

#[repr(C)]
pub struct XTextProperty {
    pub value: *mut u8,
    pub encoding: Atom,
    pub format: c_int,
    pub nitems: c_ulong,
}

// --- Global display singleton ---
static DISPLAY_INIT: Once = Once::new();
static mut DISPLAY: *mut Display = ptr::null_mut();

pub fn get_display() -> *mut Display {
    unsafe {
        DISPLAY_INIT.call_once(|| {
            DISPLAY = XOpenDisplay(ptr::null());
        });
        DISPLAY
    }
}

// --- XTest availability check ---
static XTEST_INIT: Once = Once::new();
static mut XTEST_AVAILABLE: bool = false;

pub fn is_xtest_available() -> bool {
    unsafe {
        XTEST_INIT.call_once(|| {
            let display = get_display();
            if display.is_null() {
                return;
            }
            let mut major: c_int = 0;
            let mut evt: c_int = 0;
            let mut error: c_int = 0;
            let name = b"XTEST\0";
            if XQueryExtension(display, name.as_ptr() as *const c_char, &mut major, &mut evt, &mut error) == 0 {
                return;
            }
            let mut minor: c_int = 0;
            if XTestQueryExtension(display, &mut evt, &mut error, &mut major, &mut minor) == 0 {
                return;
            }
            if major < 2 || (major == 2 && minor < 2) {
                return;
            }
            XTestGrabControl(display, True_);
            XTEST_AVAILABLE = true;
        });
        XTEST_AVAILABLE
    }
}

// --- Xinerama availability check ---
static XINERAMA_INIT: Once = Once::new();
static mut XINERAMA_AVAILABLE: bool = false;

pub fn is_xinerama_available() -> bool {
    unsafe {
        XINERAMA_INIT.call_once(|| {
            let display = get_display();
            if display.is_null() {
                return;
            }
            let mut major: c_int = 0;
            let mut evt: c_int = 0;
            let mut error: c_int = 0;
            let name = b"XINERAMA\0";
            if XQueryExtension(display, name.as_ptr() as *const c_char, &mut major, &mut evt, &mut error) == 0 {
                return;
            }
            let mut minor: c_int = 0;
            if XineramaQueryVersion(display, &mut major, &mut minor) == 0 {
                return;
            }
            XINERAMA_AVAILABLE = true;
        });
        XINERAMA_AVAILABLE
    }
}

// --- X error dismissal RAII guard ---
unsafe extern "C" fn x_handle_error(_display: *mut Display, _event: *mut c_void) -> c_int {
    0
}

pub struct XDismissErrors {
    old_handler: Option<unsafe extern "C" fn(*mut Display, *mut c_void) -> c_int>,
}

impl XDismissErrors {
    pub fn new() -> Self {
        unsafe {
            let old = XSetErrorHandler(Some(x_handle_error));
            Self { old_handler: old }
        }
    }
}

impl Drop for XDismissErrors {
    fn drop(&mut self) {
        unsafe {
            let display = get_display();
            if !display.is_null() {
                XSync(display, False_);
            }
            XSetErrorHandler(self.old_handler);
        }
    }
}

// --- Helper: get window property ---
pub unsafe fn get_window_property(win: Window, atom: Atom, items_out: Option<&mut u32>) -> *mut u8 {
    let display = get_display();
    if atom == None_ || display.is_null() {
        if let Some(n) = items_out { *n = 0; }
        return ptr::null_mut();
    }
    let mut type_: Atom = 0;
    let mut format: c_int = 0;
    let mut n_items: c_ulong = 0;
    let mut bytes_after: c_ulong = 0;
    let mut result: *mut u8 = ptr::null_mut();

    let status = XGetWindowProperty(
        display, win, atom, 0, 8192, False_, AnyPropertyType,
        &mut type_, &mut format, &mut n_items, &mut bytes_after, &mut result,
    );
    if status == 0 && !result.is_null() && n_items > 0 {
        if let Some(n) = items_out { *n = n_items as u32; }
        return result;
    }
    if let Some(n) = items_out { *n = 0; }
    if !result.is_null() {
        XFree(result as *mut c_void);
    }
    ptr::null_mut()
}
