#![allow(non_upper_case_globals, dead_code)]

use std::ffi::{c_char, c_int, c_void};
use std::sync::Once;

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

// ── dynamically loaded function pointers ───────────────────────────────
pub struct EiFns {
    pub ei_new_sender: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_unref: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_configure_name: unsafe extern "C" fn(*mut c_void, *const c_char),
    pub ei_setup_backend_fd: unsafe extern "C" fn(*mut c_void, c_int) -> c_int,
    pub ei_get_fd: unsafe extern "C" fn(*mut c_void) -> c_int,
    pub ei_dispatch: unsafe extern "C" fn(*mut c_void),
    pub ei_get_event: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_event_get_type: unsafe extern "C" fn(*mut c_void) -> c_int,
    pub ei_event_unref: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_event_get_seat: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_event_get_device: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_seat_bind_capabilities: *mut c_void,
    pub ei_device_ref: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_device_unref: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub ei_device_has_capability: unsafe extern "C" fn(*mut c_void, c_int) -> bool,
    pub ei_device_start_emulating: unsafe extern "C" fn(*mut c_void, u32),
    pub ei_device_stop_emulating: unsafe extern "C" fn(*mut c_void),
    pub ei_device_frame: unsafe extern "C" fn(*mut c_void, u64),
    pub ei_now: unsafe extern "C" fn(*mut c_void) -> u64,
    pub ei_device_keyboard_key: unsafe extern "C" fn(*mut c_void, u32, bool),
    pub ei_device_pointer_motion: unsafe extern "C" fn(*mut c_void, f64, f64),
    pub ei_device_pointer_motion_absolute: unsafe extern "C" fn(*mut c_void, f64, f64),
    pub ei_device_button_button: unsafe extern "C" fn(*mut c_void, u32, bool),
    pub ei_device_scroll_discrete: unsafe extern "C" fn(*mut c_void, i32, i32),
}

unsafe impl Sync for EiFns {}
unsafe impl Send for EiFns {}

static EI_INIT: Once = Once::new();
static mut EI_PTR: *const EiFns = std::ptr::null();

pub unsafe fn load_ei() -> Option<&'static EiFns> {
    EI_INIT.call_once(|| {
        let lib = libc::dlopen(
            b"libei.so.1\0".as_ptr() as *const c_char,
            libc::RTLD_NOW | libc::RTLD_LOCAL,
        );
        let lib = if lib.is_null() {
            let l = libc::dlopen(
                b"libei.so\0".as_ptr() as *const c_char,
                libc::RTLD_NOW | libc::RTLD_LOCAL,
            );
            if l.is_null() { return; }
            l
        } else {
            lib
        };

        macro_rules! sym {
            ($name:expr) => {{
                let s = libc::dlsym(lib, $name.as_ptr() as *const c_char);
                if s.is_null() { return; }
                std::mem::transmute(s)
            }};
        }

        macro_rules! sym_raw {
            ($name:expr) => {{
                let s = libc::dlsym(lib, $name.as_ptr() as *const c_char);
                if s.is_null() { return; }
                s
            }};
        }

        EI_PTR = Box::into_raw(Box::new(EiFns {
            ei_new_sender: sym!(b"ei_new_sender\0"),
            ei_unref: sym!(b"ei_unref\0"),
            ei_configure_name: sym!(b"ei_configure_name\0"),
            ei_setup_backend_fd: sym!(b"ei_setup_backend_fd\0"),
            ei_get_fd: sym!(b"ei_get_fd\0"),
            ei_dispatch: sym!(b"ei_dispatch\0"),
            ei_get_event: sym!(b"ei_get_event\0"),
            ei_event_get_type: sym!(b"ei_event_get_type\0"),
            ei_event_unref: sym!(b"ei_event_unref\0"),
            ei_event_get_seat: sym!(b"ei_event_get_seat\0"),
            ei_event_get_device: sym!(b"ei_event_get_device\0"),
            ei_seat_bind_capabilities: sym_raw!(b"ei_seat_bind_capabilities\0"),
            ei_device_ref: sym!(b"ei_device_ref\0"),
            ei_device_unref: sym!(b"ei_device_unref\0"),
            ei_device_has_capability: sym!(b"ei_device_has_capability\0"),
            ei_device_start_emulating: sym!(b"ei_device_start_emulating\0"),
            ei_device_stop_emulating: sym!(b"ei_device_stop_emulating\0"),
            ei_device_frame: sym!(b"ei_device_frame\0"),
            ei_now: sym!(b"ei_now\0"),
            ei_device_keyboard_key: sym!(b"ei_device_keyboard_key\0"),
            ei_device_pointer_motion: sym!(b"ei_device_pointer_motion\0"),
            ei_device_pointer_motion_absolute: sym!(b"ei_device_pointer_motion_absolute\0"),
            ei_device_button_button: sym!(b"ei_device_button_button\0"),
            ei_device_scroll_discrete: sym!(b"ei_device_scroll_discrete\0"),
        }));
    });
    EI_PTR.as_ref()
}
