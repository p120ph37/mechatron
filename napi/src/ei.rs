#![allow(non_upper_case_globals, dead_code)]

// libei (Emulated Input) FFI bindings.
//
// Each crate that uses these bindings is expected to link libei directly
// (cargo:rustc-link-lib=ei in build.rs) so the .node binary has libei.so.1
// as a NEEDED entry — the binary fails to load on systems without libei,
// and the napi resolver in lib/backend.ts catches the load failure and
// falls back to the next variant.  No runtime dlopen / dlsym pattern.

use std::ffi::{c_char, c_int, c_void};

// ── libei event types ──────────────────────────────────────────────────
pub const EI_EVENT_CONNECT: c_int = 1;
pub const EI_EVENT_DISCONNECT: c_int = 2;
pub const EI_EVENT_SEAT_ADDED: c_int = 3;
pub const EI_EVENT_SEAT_REMOVED: c_int = 4;
pub const EI_EVENT_DEVICE_ADDED: c_int = 5;
pub const EI_EVENT_DEVICE_REMOVED: c_int = 6;
pub const EI_EVENT_DEVICE_PAUSED: c_int = 7;
pub const EI_EVENT_DEVICE_RESUMED: c_int = 8;
pub const EI_EVENT_KEYBOARD_MODIFIERS: c_int = 9;

// ── device capabilities ────────────────────────────────────────────────
pub const CAP_POINTER: c_int = 1;
pub const CAP_POINTER_ABSOLUTE: c_int = 2;
pub const CAP_KEYBOARD: c_int = 4;
pub const CAP_SCROLL: c_int = 16;
pub const CAP_BUTTON: c_int = 32;

extern "C" {
    pub fn ei_new_sender(backend: *mut c_void) -> *mut c_void;
    pub fn ei_unref(ei: *mut c_void) -> *mut c_void;
    pub fn ei_configure_name(ei: *mut c_void, name: *const c_char);
    pub fn ei_setup_backend_fd(ei: *mut c_void, fd: c_int) -> c_int;
    pub fn ei_get_fd(ei: *mut c_void) -> c_int;
    pub fn ei_dispatch(ei: *mut c_void);
    pub fn ei_get_event(ei: *mut c_void) -> *mut c_void;
    pub fn ei_event_get_type(event: *mut c_void) -> c_int;
    pub fn ei_event_unref(event: *mut c_void) -> *mut c_void;
    pub fn ei_event_get_seat(event: *mut c_void) -> *mut c_void;
    pub fn ei_event_get_device(event: *mut c_void) -> *mut c_void;

    // Variadic: capability list terminated with NULL.  Rust doesn't have a
    // stable way to spell variadic prototypes for foreign fns of this shape,
    // so declare it with the fixed argument count we always use (5 caps +
    // NULL terminator).  All call sites pass exactly that signature.
    pub fn ei_seat_bind_capabilities(
        seat: *mut c_void,
        c1: c_int, c2: c_int, c3: c_int, c4: c_int, c5: c_int,
        terminator: *const c_void,
    );

    pub fn ei_device_ref(dev: *mut c_void) -> *mut c_void;
    pub fn ei_device_unref(dev: *mut c_void) -> *mut c_void;
    pub fn ei_device_has_capability(dev: *mut c_void, cap: c_int) -> bool;
    pub fn ei_device_start_emulating(dev: *mut c_void, sequence: u32);
    pub fn ei_device_stop_emulating(dev: *mut c_void);
    pub fn ei_device_frame(dev: *mut c_void, time_us: u64);
    pub fn ei_now(ei: *mut c_void) -> u64;
    pub fn ei_device_keyboard_key(dev: *mut c_void, key: u32, pressed: bool);
    pub fn ei_device_pointer_motion(dev: *mut c_void, dx: f64, dy: f64);
    pub fn ei_device_pointer_motion_absolute(dev: *mut c_void, x: f64, y: f64);
    pub fn ei_device_button_button(dev: *mut c_void, button: u32, pressed: bool);
    pub fn ei_device_scroll_discrete(dev: *mut c_void, x: i32, y: i32);
}
