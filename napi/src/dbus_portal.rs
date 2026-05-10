#![allow(non_upper_case_globals, dead_code)]

use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::os::unix::io::RawFd;

// ── libdbus-1 constants ──────────────────────────────────────────────

const DBUS_BUS_SESSION: c_int = 0;

const DBUS_TYPE_INVALID: c_int = 0;
const DBUS_TYPE_STRING: c_int = 's' as c_int;
const DBUS_TYPE_UINT32: c_int = 'u' as c_int;
const DBUS_TYPE_INT32: c_int = 'i' as c_int;
const DBUS_TYPE_OBJECT_PATH: c_int = 'o' as c_int;
const DBUS_TYPE_VARIANT: c_int = 'v' as c_int;
const DBUS_TYPE_ARRAY: c_int = 'a' as c_int;
const DBUS_TYPE_UNIX_FD: c_int = 'h' as c_int;
const DBUS_TYPE_STRUCT: c_int = 'r' as c_int;
const DBUS_TYPE_BOOLEAN: c_int = 'b' as c_int;
const DBUS_TYPE_BYTE: c_int = 'y' as c_int;
const DBUS_TYPE_INT16: c_int = 'n' as c_int;
const DBUS_TYPE_UINT16: c_int = 'q' as c_int;
const DBUS_TYPE_INT64: c_int = 'x' as c_int;
const DBUS_TYPE_UINT64: c_int = 't' as c_int;
const DBUS_TYPE_DOUBLE: c_int = 'd' as c_int;
const DBUS_TYPE_SIGNATURE: c_int = 'g' as c_int;
const DBUS_TYPE_DICT_ENTRY: c_int = 'e' as c_int;

const DBUS_DICT_ENTRY_BEGIN_CHAR: c_int = '{' as c_int;
const DBUS_STRUCT_BEGIN_CHAR: c_int = '(' as c_int;

const DBUS_MESSAGE_TYPE_METHOD_RETURN: c_int = 2;
const DBUS_MESSAGE_TYPE_ERROR: c_int = 3;
pub(crate) const DBUS_MESSAGE_TYPE_SIGNAL: c_int = 4;

// ── DBusError struct (must match libdbus ABI) ────────────────────────

#[repr(C)]
struct DBusError {
    name: *const c_char,
    message: *const c_char,
    _dummy1: c_int,
    _dummy2: c_int,
    _dummy3: c_int,
    _dummy4: c_int,
    _dummy5: *mut c_void,
}

// ── DBusMessageIter — opaque, allocate as a large-enough byte array ──

// libdbus defines DBusMessageIter as a struct of about 80 bytes.
// We allocate 128 bytes to be safe on all arches.
const DBUS_MESSAGE_ITER_SIZE: usize = 128;

#[repr(C, align(8))]
pub(crate) struct DBusMessageIter {
    _data: [u8; DBUS_MESSAGE_ITER_SIZE],
}

impl DBusMessageIter {
    pub(crate) fn new() -> Self {
        DBusMessageIter {
            _data: [0u8; DBUS_MESSAGE_ITER_SIZE],
        }
    }
}

// ── Function-pointer table loaded from libdbus-1.so.3 via dlopen ─────
//
// All libdbus symbols are resolved at runtime so this crate has no
// compile-time link dependency on libdbus-1.  If the library is absent,
// every entry point returns None / is a no-op.

struct Dbus {
    dbus_error_init: unsafe extern "C" fn(*mut DBusError),
    dbus_error_is_set: unsafe extern "C" fn(*const DBusError) -> u32,
    dbus_error_free: unsafe extern "C" fn(*mut DBusError),
    dbus_bus_get_private: unsafe extern "C" fn(c_int, *mut DBusError) -> *mut c_void,
    dbus_bus_get_unique_name: unsafe extern "C" fn(*mut c_void) -> *const c_char,
    dbus_bus_add_match: unsafe extern "C" fn(*mut c_void, *const c_char, *mut DBusError),
    dbus_connection_send_with_reply_and_block:
        unsafe extern "C" fn(*mut c_void, *mut c_void, c_int, *mut DBusError) -> *mut c_void,
    dbus_connection_send: unsafe extern "C" fn(*mut c_void, *mut c_void, *mut u32) -> u32,
    dbus_connection_read_write: unsafe extern "C" fn(*mut c_void, c_int) -> u32,
    dbus_connection_pop_message: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    dbus_connection_flush: unsafe extern "C" fn(*mut c_void),
    dbus_connection_close: unsafe extern "C" fn(*mut c_void),
    dbus_connection_unref: unsafe extern "C" fn(*mut c_void),
    dbus_message_new_method_call: unsafe extern "C" fn(
        *const c_char,
        *const c_char,
        *const c_char,
        *const c_char,
    ) -> *mut c_void,
    dbus_message_iter_init_append: unsafe extern "C" fn(*mut c_void, *mut DBusMessageIter),
    dbus_message_iter_open_container: unsafe extern "C" fn(
        *mut DBusMessageIter,
        c_int,
        *const c_char,
        *mut DBusMessageIter,
    ) -> u32,
    dbus_message_iter_append_basic:
        unsafe extern "C" fn(*mut DBusMessageIter, c_int, *const c_void) -> u32,
    dbus_message_iter_close_container:
        unsafe extern "C" fn(*mut DBusMessageIter, *mut DBusMessageIter) -> u32,
    dbus_message_iter_init: unsafe extern "C" fn(*mut c_void, *mut DBusMessageIter) -> u32,
    dbus_message_iter_get_arg_type: unsafe extern "C" fn(*mut DBusMessageIter) -> c_int,
    dbus_message_iter_get_basic:
        unsafe extern "C" fn(*mut DBusMessageIter, *mut c_void),
    dbus_message_iter_recurse:
        unsafe extern "C" fn(*mut DBusMessageIter, *mut DBusMessageIter),
    dbus_message_iter_next: unsafe extern "C" fn(*mut DBusMessageIter) -> u32,
    dbus_message_get_type: unsafe extern "C" fn(*mut c_void) -> c_int,
    dbus_message_get_path: unsafe extern "C" fn(*mut c_void) -> *const c_char,
    dbus_message_get_member: unsafe extern "C" fn(*mut c_void) -> *const c_char,
    dbus_message_get_interface: unsafe extern "C" fn(*mut c_void) -> *const c_char,
    dbus_message_unref: unsafe extern "C" fn(*mut c_void),
}

static LIB: std::sync::OnceLock<Dbus> = std::sync::OnceLock::new();

unsafe fn load_sym<T>(handle: *mut c_void, name: &[u8]) -> Option<T> {
    let sym = libc::dlsym(handle, name.as_ptr() as *const c_char);
    if sym.is_null() {
        return None;
    }
    Some(std::mem::transmute_copy(&sym))
}

unsafe fn try_load_lib() -> Option<Dbus> {
    let handle = libc::dlopen(
        b"libdbus-1.so.3\0".as_ptr() as *const c_char,
        libc::RTLD_NOW | libc::RTLD_LOCAL,
    );
    if handle.is_null() {
        return None;
    }
    macro_rules! sym {
        ($name:literal) => {
            load_sym(handle, $name)?
        };
    }
    Some(Dbus {
        dbus_error_init: sym!(b"dbus_error_init\0"),
        dbus_error_is_set: sym!(b"dbus_error_is_set\0"),
        dbus_error_free: sym!(b"dbus_error_free\0"),
        dbus_bus_get_private: sym!(b"dbus_bus_get_private\0"),
        dbus_bus_get_unique_name: sym!(b"dbus_bus_get_unique_name\0"),
        dbus_bus_add_match: sym!(b"dbus_bus_add_match\0"),
        dbus_connection_send_with_reply_and_block: sym!(b"dbus_connection_send_with_reply_and_block\0"),
        dbus_connection_send: sym!(b"dbus_connection_send\0"),
        dbus_connection_read_write: sym!(b"dbus_connection_read_write\0"),
        dbus_connection_pop_message: sym!(b"dbus_connection_pop_message\0"),
        dbus_connection_flush: sym!(b"dbus_connection_flush\0"),
        dbus_connection_close: sym!(b"dbus_connection_close\0"),
        dbus_connection_unref: sym!(b"dbus_connection_unref\0"),
        dbus_message_new_method_call: sym!(b"dbus_message_new_method_call\0"),
        dbus_message_iter_init_append: sym!(b"dbus_message_iter_init_append\0"),
        dbus_message_iter_open_container: sym!(b"dbus_message_iter_open_container\0"),
        dbus_message_iter_append_basic: sym!(b"dbus_message_iter_append_basic\0"),
        dbus_message_iter_close_container: sym!(b"dbus_message_iter_close_container\0"),
        dbus_message_iter_init: sym!(b"dbus_message_iter_init\0"),
        dbus_message_iter_get_arg_type: sym!(b"dbus_message_iter_get_arg_type\0"),
        dbus_message_iter_get_basic: sym!(b"dbus_message_iter_get_basic\0"),
        dbus_message_iter_recurse: sym!(b"dbus_message_iter_recurse\0"),
        dbus_message_iter_next: sym!(b"dbus_message_iter_next\0"),
        dbus_message_get_type: sym!(b"dbus_message_get_type\0"),
        dbus_message_get_path: sym!(b"dbus_message_get_path\0"),
        dbus_message_get_member: sym!(b"dbus_message_get_member\0"),
        dbus_message_get_interface: sym!(b"dbus_message_get_interface\0"),
        dbus_message_unref: sym!(b"dbus_message_unref\0"),
    })
}

pub(crate) fn is_loaded() -> bool { lib().is_some() }

fn lib() -> Option<&'static Dbus> {
    static TRIED: std::sync::Once = std::sync::Once::new();
    TRIED.call_once(|| {
        if let Some(d) = unsafe { try_load_lib() } {
            let _ = LIB.set(d);
        }
    });
    LIB.get()
}

// Thin wrappers that dispatch through the dlopen'd function pointers.
// These have the same names as the libdbus C API so call-sites read naturally.
// Each panics if called before lib() returns Some — which cannot happen because
// every public entry point early-returns None when lib() is None.

macro_rules! dl {
    () => { lib().unwrap() };
}

#[inline(always)]
unsafe fn dbus_error_init(e: *mut DBusError) { (dl!().dbus_error_init)(e) }
#[inline(always)]
unsafe fn dbus_error_is_set(e: *const DBusError) -> u32 { (dl!().dbus_error_is_set)(e) }
#[inline(always)]
unsafe fn dbus_error_free(e: *mut DBusError) { (dl!().dbus_error_free)(e) }
#[inline(always)]
unsafe fn dbus_bus_get_private(t: c_int, e: *mut DBusError) -> *mut c_void { (dl!().dbus_bus_get_private)(t, e) }
#[inline(always)]
unsafe fn dbus_bus_get_unique_name(c: *mut c_void) -> *const c_char { (dl!().dbus_bus_get_unique_name)(c) }
#[inline(always)]
unsafe fn dbus_bus_add_match(c: *mut c_void, r: *const c_char, e: *mut DBusError) { (dl!().dbus_bus_add_match)(c, r, e) }
#[inline(always)]
unsafe fn dbus_connection_send_with_reply_and_block(c: *mut c_void, m: *mut c_void, t: c_int, e: *mut DBusError) -> *mut c_void { (dl!().dbus_connection_send_with_reply_and_block)(c, m, t, e) }
#[inline(always)]
unsafe fn dbus_connection_send(c: *mut c_void, m: *mut c_void, s: *mut u32) -> u32 { (dl!().dbus_connection_send)(c, m, s) }
#[inline(always)]
unsafe fn dbus_connection_read_write(c: *mut c_void, t: c_int) -> u32 { (dl!().dbus_connection_read_write)(c, t) }
#[inline(always)]
unsafe fn dbus_connection_pop_message(c: *mut c_void) -> *mut c_void { (dl!().dbus_connection_pop_message)(c) }
#[inline(always)]
unsafe fn dbus_connection_flush(c: *mut c_void) { (dl!().dbus_connection_flush)(c) }
#[inline(always)]
unsafe fn dbus_connection_close(c: *mut c_void) { (dl!().dbus_connection_close)(c) }
#[inline(always)]
unsafe fn dbus_connection_unref(c: *mut c_void) { (dl!().dbus_connection_unref)(c) }
#[inline(always)]
unsafe fn dbus_message_new_method_call(d: *const c_char, p: *const c_char, i: *const c_char, m: *const c_char) -> *mut c_void { (dl!().dbus_message_new_method_call)(d, p, i, m) }
#[inline(always)]
unsafe fn dbus_message_iter_init_append(m: *mut c_void, i: *mut DBusMessageIter) { (dl!().dbus_message_iter_init_append)(m, i) }
#[inline(always)]
unsafe fn dbus_message_iter_open_container(i: *mut DBusMessageIter, t: c_int, s: *const c_char, sub: *mut DBusMessageIter) -> u32 { (dl!().dbus_message_iter_open_container)(i, t, s, sub) }
#[inline(always)]
unsafe fn dbus_message_iter_append_basic(i: *mut DBusMessageIter, t: c_int, v: *const c_void) -> u32 { (dl!().dbus_message_iter_append_basic)(i, t, v) }
#[inline(always)]
unsafe fn dbus_message_iter_close_container(i: *mut DBusMessageIter, sub: *mut DBusMessageIter) -> u32 { (dl!().dbus_message_iter_close_container)(i, sub) }
#[inline(always)]
unsafe fn dbus_message_iter_init(m: *mut c_void, i: *mut DBusMessageIter) -> u32 { (dl!().dbus_message_iter_init)(m, i) }
#[inline(always)]
unsafe fn dbus_message_iter_get_arg_type(i: *mut DBusMessageIter) -> c_int { (dl!().dbus_message_iter_get_arg_type)(i) }
#[inline(always)]
unsafe fn dbus_message_iter_get_basic(i: *mut DBusMessageIter, v: *mut c_void) { (dl!().dbus_message_iter_get_basic)(i, v) }
#[inline(always)]
unsafe fn dbus_message_iter_recurse(i: *mut DBusMessageIter, sub: *mut DBusMessageIter) { (dl!().dbus_message_iter_recurse)(i, sub) }
#[inline(always)]
unsafe fn dbus_message_iter_next(i: *mut DBusMessageIter) -> u32 { (dl!().dbus_message_iter_next)(i) }
#[inline(always)]
unsafe fn dbus_message_get_type(m: *mut c_void) -> c_int { (dl!().dbus_message_get_type)(m) }
#[inline(always)]
unsafe fn dbus_message_get_path(m: *mut c_void) -> *const c_char { (dl!().dbus_message_get_path)(m) }
#[inline(always)]
unsafe fn dbus_message_get_member(m: *mut c_void) -> *const c_char { (dl!().dbus_message_get_member)(m) }
#[inline(always)]
unsafe fn dbus_message_get_interface(m: *mut c_void) -> *const c_char { (dl!().dbus_message_get_interface)(m) }
#[inline(always)]
unsafe fn dbus_message_unref(m: *mut c_void) { (dl!().dbus_message_unref)(m) }

// ── DBusConn ─────────────────────────────────────────────────────────

pub(crate) struct DBusConn {
    pub(crate) conn: *mut c_void, // DBusConnection*
    pub(crate) unique_name: String,
}

// ── Connection ───────────────────────────────────────────────────────

pub(crate) unsafe fn dbus_connect() -> Option<DBusConn> {
    lib()?; // ensure libdbus-1 is loaded
    let mut err = std::mem::zeroed::<DBusError>();
    dbus_error_init(&mut err);

    let conn = dbus_bus_get_private(DBUS_BUS_SESSION, &mut err);
    if conn.is_null() || dbus_error_is_set(&err) != 0 {
        dbus_error_free(&mut err);
        return None;
    }

    let name_ptr = dbus_bus_get_unique_name(conn);
    if name_ptr.is_null() {
        dbus_connection_close(conn);
        dbus_connection_unref(conn);
        return None;
    }
    let unique_name = CStr::from_ptr(name_ptr).to_string_lossy().into_owned();

    Some(DBusConn { conn, unique_name })
}

// ── Portal constants ─────────────────────────────────────────────────

pub(crate) const PORTAL_DEST: &str = "org.freedesktop.portal.Desktop";
pub(crate) const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
const RD_IFACE: &str = "org.freedesktop.portal.RemoteDesktop";

pub(crate) fn request_path(unique_name: &str, token: &str) -> String {
    let sender = unique_name.replace('.', "_").replace(':', "");
    format!("/org/freedesktop/portal/desktop/request/{}/{}", sender, token)
}

// ── Match rule ───────────────────────────────────────────────────────

pub(crate) unsafe fn add_match(conn: &mut DBusConn, rule: &str) {
    if lib().is_none() { return; }
    let crule = match CString::new(rule) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut err = std::mem::zeroed::<DBusError>();
    dbus_error_init(&mut err);
    dbus_bus_add_match(conn.conn, crule.as_ptr(), &mut err);
    dbus_connection_flush(conn.conn);
    if dbus_error_is_set(&err) != 0 {
        dbus_error_free(&mut err);
    }
}

// ── Iterator-based message building helpers ──────────────────────────

/// Append a string argument to an iterator.
pub(crate) unsafe fn iter_append_string(iter: &mut DBusMessageIter, s: &str) {
    let cs = CString::new(s).unwrap_or_else(|_| CString::new("").unwrap());
    let ptr = cs.as_ptr();
    dbus_message_iter_append_basic(iter, DBUS_TYPE_STRING, &ptr as *const _ as *const c_void);
}

/// Append an object path argument to an iterator.
pub(crate) unsafe fn iter_append_object_path(iter: &mut DBusMessageIter, s: &str) {
    let cs = CString::new(s).unwrap_or_else(|_| CString::new("").unwrap());
    let ptr = cs.as_ptr();
    dbus_message_iter_append_basic(
        iter,
        DBUS_TYPE_OBJECT_PATH,
        &ptr as *const _ as *const c_void,
    );
}

/// Append a u32 argument to an iterator.
pub(crate) unsafe fn iter_append_u32(iter: &mut DBusMessageIter, v: u32) {
    dbus_message_iter_append_basic(iter, DBUS_TYPE_UINT32, &v as *const _ as *const c_void);
}

/// Append a variant containing a string.
unsafe fn iter_append_variant_string(iter: &mut DBusMessageIter, s: &str) {
    let sig = CString::new("s").unwrap();
    let mut sub = DBusMessageIter::new();
    dbus_message_iter_open_container(iter, DBUS_TYPE_VARIANT, sig.as_ptr(), &mut sub);
    iter_append_string(&mut sub, s);
    dbus_message_iter_close_container(iter, &mut sub);
}

/// Append a variant containing a u32.
unsafe fn iter_append_variant_u32(iter: &mut DBusMessageIter, v: u32) {
    let sig = CString::new("u").unwrap();
    let mut sub = DBusMessageIter::new();
    dbus_message_iter_open_container(iter, DBUS_TYPE_VARIANT, sig.as_ptr(), &mut sub);
    iter_append_u32(&mut sub, v);
    dbus_message_iter_close_container(iter, &mut sub);
}

/// Build an a{sv} dict entry for (key, variant<string>).
unsafe fn asv_append_string(
    arr_iter: &mut DBusMessageIter,
    key: &str,
    val: &str,
) {
    let mut entry = DBusMessageIter::new();
    dbus_message_iter_open_container(
        arr_iter,
        DBUS_TYPE_DICT_ENTRY,
        std::ptr::null(),
        &mut entry,
    );
    iter_append_string(&mut entry, key);
    iter_append_variant_string(&mut entry, val);
    dbus_message_iter_close_container(arr_iter, &mut entry);
}

/// Build an a{sv} dict entry for (key, variant<u32>).
unsafe fn asv_append_u32(
    arr_iter: &mut DBusMessageIter,
    key: &str,
    val: u32,
) {
    let mut entry = DBusMessageIter::new();
    dbus_message_iter_open_container(
        arr_iter,
        DBUS_TYPE_DICT_ENTRY,
        std::ptr::null(),
        &mut entry,
    );
    iter_append_string(&mut entry, key);
    iter_append_variant_u32(&mut entry, val);
    dbus_message_iter_close_container(arr_iter, &mut entry);
}

/// Append a boolean argument to an iterator.
pub(crate) unsafe fn iter_append_bool(iter: &mut DBusMessageIter, v: bool) {
    let val: u32 = if v { 1 } else { 0 };
    dbus_message_iter_append_basic(iter, DBUS_TYPE_BOOLEAN, &val as *const _ as *const c_void);
}

/// Append a variant containing an array of strings (`as`).
unsafe fn iter_append_variant_string_array(iter: &mut DBusMessageIter, vals: &[&str]) {
    let sig = CString::new("as").unwrap();
    let mut variant = DBusMessageIter::new();
    dbus_message_iter_open_container(iter, DBUS_TYPE_VARIANT, sig.as_ptr(), &mut variant);
    let arr_sig = CString::new("s").unwrap();
    let mut arr = DBusMessageIter::new();
    dbus_message_iter_open_container(&mut variant, DBUS_TYPE_ARRAY, arr_sig.as_ptr(), &mut arr);
    for s in vals {
        iter_append_string(&mut arr, s);
    }
    dbus_message_iter_close_container(&mut variant, &mut arr);
    dbus_message_iter_close_container(iter, &mut variant);
}

/// Append a variant containing a boolean.
unsafe fn iter_append_variant_bool(iter: &mut DBusMessageIter, v: bool) {
    let sig = CString::new("b").unwrap();
    let mut sub = DBusMessageIter::new();
    dbus_message_iter_open_container(iter, DBUS_TYPE_VARIANT, sig.as_ptr(), &mut sub);
    iter_append_bool(&mut sub, v);
    dbus_message_iter_close_container(iter, &mut sub);
}

/// Descriptor for entries in an a{sv} dict.
pub(crate) enum AsvEntry<'a> {
    Str(&'a str, &'a str),  // key, string value
    U32(&'a str, u32),      // key, u32 value
    StrArray(&'a str, &'a [&'a str]),  // key, array of strings
    Bool(&'a str, bool),    // key, boolean value
}

/// Open an a{sv} array, append entries, close it.
pub(crate) unsafe fn iter_append_asv(iter: &mut DBusMessageIter, entries: &[AsvEntry]) {
    let sig = CString::new("{sv}").unwrap();
    let mut arr = DBusMessageIter::new();
    dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, sig.as_ptr(), &mut arr);
    for entry in entries {
        match entry {
            AsvEntry::Str(k, v) => asv_append_string(&mut arr, k, v),
            AsvEntry::U32(k, v) => asv_append_u32(&mut arr, k, *v),
            AsvEntry::StrArray(k, vals) => {
                let mut de = DBusMessageIter::new();
                dbus_message_iter_open_container(
                    &mut arr, DBUS_TYPE_DICT_ENTRY, std::ptr::null(), &mut de,
                );
                iter_append_string(&mut de, k);
                iter_append_variant_string_array(&mut de, vals);
                dbus_message_iter_close_container(&mut arr, &mut de);
            }
            AsvEntry::Bool(k, v) => {
                let mut de = DBusMessageIter::new();
                dbus_message_iter_open_container(
                    &mut arr, DBUS_TYPE_DICT_ENTRY, std::ptr::null(), &mut de,
                );
                iter_append_string(&mut de, k);
                iter_append_variant_bool(&mut de, *v);
                dbus_message_iter_close_container(&mut arr, &mut de);
            }
        }
    }
    dbus_message_iter_close_container(iter, &mut arr);
}

// ── Build and send a method-call message ─────────────────────────────

/// Create a new method-call message (not yet sent). Returns null on failure.
unsafe fn new_method_call(
    dest: &str,
    path: &str,
    iface: &str,
    method: &str,
) -> *mut c_void {
    let cdest = CString::new(dest).unwrap();
    let cpath = CString::new(path).unwrap();
    let ciface = CString::new(iface).unwrap();
    let cmethod = CString::new(method).unwrap();
    dbus_message_new_method_call(cdest.as_ptr(), cpath.as_ptr(), ciface.as_ptr(), cmethod.as_ptr())
}

// ── Waiting for signals ──────────────────────────────────────────────

/// Wait for a Response signal on `req_path`, extract the response code and
/// the a{sv} results dict as parsed `ResponseData`. Returns None on timeout.
pub(crate) struct ResponseData {
    pub(crate) code: u32,
    msg: *mut c_void, // owned DBusMessage* — caller must call response_data_free
}

impl ResponseData {
    /// Get a read iterator positioned at the a{sv} results argument (second arg).
    pub(crate) unsafe fn results_iter(&self) -> Option<DBusMessageIter> {
        let mut iter = DBusMessageIter::new();
        if dbus_message_iter_init(self.msg, &mut iter) == 0 {
            return None;
        }
        // Skip first arg (uint32 response code) — advance to the a{sv}
        dbus_message_iter_next(&mut iter);
        // Now iter points at the a{sv}
        Some(iter)
    }
}

pub(crate) unsafe fn response_data_free(r: ResponseData) {
    {
        if !r.msg.is_null() {
            dbus_message_unref(r.msg);
        }
    }
}

unsafe fn wait_for_response_signal(
    conn: &mut DBusConn,
    req_path: &str,
) -> Option<ResponseData> {
    for _ in 0..200 {
        // read/write with 500ms timeout
        if dbus_connection_read_write(conn.conn, 500) == 0 {
            return None; // disconnected
        }
        loop {
            let msg = dbus_connection_pop_message(conn.conn);
            if msg.is_null() {
                break;
            }
            let mtype = dbus_message_get_type(msg);
            if mtype != DBUS_MESSAGE_TYPE_SIGNAL {
                dbus_message_unref(msg);
                continue;
            }
            let path_ptr = dbus_message_get_path(msg);
            let member_ptr = dbus_message_get_member(msg);
            if path_ptr.is_null() || member_ptr.is_null() {
                dbus_message_unref(msg);
                continue;
            }
            let path = CStr::from_ptr(path_ptr).to_string_lossy();
            let member = CStr::from_ptr(member_ptr).to_string_lossy();
            if path != req_path || member != "Response" {
                dbus_message_unref(msg);
                continue;
            }
            // Extract the response code (first arg, uint32)
            let mut iter = DBusMessageIter::new();
            if dbus_message_iter_init(msg, &mut iter) == 0 {
                dbus_message_unref(msg);
                return None;
            }
            let arg_type = dbus_message_iter_get_arg_type(&mut iter);
            if arg_type != DBUS_TYPE_UINT32 {
                dbus_message_unref(msg);
                return None;
            }
            let mut code: u32 = 0;
            dbus_message_iter_get_basic(&mut iter, &mut code as *mut _ as *mut c_void);
            return Some(ResponseData { code, msg });
        }
    }
    None
}

// ── portal_call: send method + wait for Response signal ──────────────

/// Call a portal method that uses the Request/Response pattern.
/// `build_args` is a closure that appends the method-call body arguments to the iter.
/// Returns the response data (caller must call `response_data_free` when done).
pub(crate) unsafe fn portal_call<F>(
    conn: &mut DBusConn,
    iface: &str,
    method: &str,
    token: &str,
    build_args: F,
) -> Option<ResponseData>
where
    F: FnOnce(&mut DBusMessageIter),
{
    let req = request_path(&conn.unique_name, token);
    let rule = format!(
        "type='signal',sender='{}',interface='org.freedesktop.portal.Request',member='Response',path='{}'",
        PORTAL_DEST, req
    );
    add_match(conn, &rule);

    let msg = new_method_call(PORTAL_DEST, PORTAL_PATH, iface, method);
    if msg.is_null() {
        return None;
    }

    let mut iter = DBusMessageIter::new();
    dbus_message_iter_init_append(msg, &mut iter);
    build_args(&mut iter);

    let mut serial: u32 = 0;
    dbus_connection_send(conn.conn, msg, &mut serial);
    dbus_connection_flush(conn.conn);
    dbus_message_unref(msg);

    // Drain the method reply (ack from the bus)
    for _ in 0..50 {
        if dbus_connection_read_write(conn.conn, 200) == 0 {
            return None;
        }
        loop {
            let reply = dbus_connection_pop_message(conn.conn);
            if reply.is_null() {
                break;
            }
            let rtype = dbus_message_get_type(reply);
            // Check if this is already our Response signal
            if rtype == DBUS_MESSAGE_TYPE_SIGNAL {
                let path_ptr = dbus_message_get_path(reply);
                let member_ptr = dbus_message_get_member(reply);
                if !path_ptr.is_null() && !member_ptr.is_null() {
                    let path = CStr::from_ptr(path_ptr).to_string_lossy();
                    let member = CStr::from_ptr(member_ptr).to_string_lossy();
                    if path.as_ref() == req && member == "Response" {
                        let mut it = DBusMessageIter::new();
                        if dbus_message_iter_init(reply, &mut it) != 0
                            && dbus_message_iter_get_arg_type(&mut it) == DBUS_TYPE_UINT32
                        {
                            let mut code: u32 = 0;
                            dbus_message_iter_get_basic(
                                &mut it,
                                &mut code as *mut _ as *mut c_void,
                            );
                            return Some(ResponseData { code, msg: reply });
                        }
                        dbus_message_unref(reply);
                        return None;
                    }
                }
            }
            // Got the method return or some other message — continue
            if rtype == DBUS_MESSAGE_TYPE_METHOD_RETURN || rtype == DBUS_MESSAGE_TYPE_ERROR {
                dbus_message_unref(reply);
                // Now wait for the actual Response signal
                return wait_for_response_signal(conn, &req);
            }
            dbus_message_unref(reply);
        }
    }
    // Fall through to waiting for signal
    wait_for_response_signal(conn, &req)
}

// ── Iterator-based value extraction helpers ──────────────────────────

/// Read a string from the current iterator position.
pub(crate) unsafe fn iter_get_string(iter: &mut DBusMessageIter) -> Option<String> {
    let t = dbus_message_iter_get_arg_type(iter);
    if t != DBUS_TYPE_STRING && t != DBUS_TYPE_OBJECT_PATH && t != DBUS_TYPE_SIGNATURE {
        return None;
    }
    let mut ptr: *const c_char = std::ptr::null();
    dbus_message_iter_get_basic(iter, &mut ptr as *mut _ as *mut c_void);
    if ptr.is_null() {
        return None;
    }
    Some(CStr::from_ptr(ptr).to_string_lossy().into_owned())
}

/// Read a u32 from the current iterator position.
pub(crate) unsafe fn iter_get_u32(iter: &mut DBusMessageIter) -> Option<u32> {
    if dbus_message_iter_get_arg_type(iter) != DBUS_TYPE_UINT32 {
        return None;
    }
    let mut v: u32 = 0;
    dbus_message_iter_get_basic(iter, &mut v as *mut _ as *mut c_void);
    Some(v)
}

/// Read an i32 from the current iterator position.
pub(crate) unsafe fn iter_get_i32(iter: &mut DBusMessageIter) -> Option<i32> {
    if dbus_message_iter_get_arg_type(iter) != DBUS_TYPE_INT32 {
        return None;
    }
    let mut v: i32 = 0;
    dbus_message_iter_get_basic(iter, &mut v as *mut _ as *mut c_void);
    Some(v)
}

/// Read a unix fd from the current iterator position.
pub(crate) unsafe fn iter_get_fd(iter: &mut DBusMessageIter) -> Option<RawFd> {
    if dbus_message_iter_get_arg_type(iter) != DBUS_TYPE_UNIX_FD {
        return None;
    }
    let mut fd: RawFd = -1;
    dbus_message_iter_get_basic(iter, &mut fd as *mut _ as *mut c_void);
    if fd < 0 {
        return None;
    }
    Some(fd)
}

/// Recurse into a container (array, struct, dict_entry, variant).
pub(crate) unsafe fn iter_recurse(iter: &mut DBusMessageIter) -> Option<DBusMessageIter> {
    let mut sub = DBusMessageIter::new();
    dbus_message_iter_recurse(iter, &mut sub);
    Some(sub)
}

/// Advance iterator to next element. Returns true if there is a next element.
pub(crate) unsafe fn iter_next(iter: &mut DBusMessageIter) -> bool {
    dbus_message_iter_next(iter) != 0
}

/// Get the D-Bus type of the current argument.
pub(crate) unsafe fn iter_arg_type(iter: &mut DBusMessageIter) -> c_int {
    dbus_message_iter_get_arg_type(iter)
}

/// Skip the current value in the iterator (just advance).
pub(crate) unsafe fn iter_skip(iter: &mut DBusMessageIter) {
    // Just advance past the current element
    iter_next(iter);
}

// ── extract_session_handle from a Response ───────────────────────────

pub(crate) unsafe fn extract_session_handle(resp: &ResponseData) -> Option<String> {
    if resp.code != 0 {
        return None;
    }
    let mut iter = resp.results_iter()?;
    // iter points at the a{sv} — recurse into the array
    let mut arr = iter_recurse(&mut iter)?;
    loop {
        let t = dbus_message_iter_get_arg_type(&mut arr);
        if t == DBUS_TYPE_INVALID {
            break;
        }
        // dict entry
        let mut entry = iter_recurse(&mut arr)?;
        let key = iter_get_string(&mut entry)?;
        iter_next(&mut entry);
        if key == "session_handle" {
            // entry is now at the variant
            let mut variant = iter_recurse(&mut entry)?;
            return iter_get_string(&mut variant);
        }
        iter_next(&mut arr);
    }
    None
}

// ── Send a method call and get the reply (blocking) ──────────────────

/// Send a method call and wait for the reply (blocking). Returns the reply message.
/// Caller must unref the returned message via msg_unref.
pub(crate) unsafe fn call_method<F>(
    conn: &mut DBusConn,
    dest: &str,
    path: &str,
    iface: &str,
    method: &str,
    build_args: F,
) -> Option<*mut c_void>
where
    F: FnOnce(&mut DBusMessageIter),
{
    let msg = new_method_call(dest, path, iface, method);
    if msg.is_null() {
        return None;
    }

    let mut iter = DBusMessageIter::new();
    dbus_message_iter_init_append(msg, &mut iter);
    build_args(&mut iter);

    let mut err = std::mem::zeroed::<DBusError>();
    dbus_error_init(&mut err);
    let reply = dbus_connection_send_with_reply_and_block(conn.conn, msg, 30000, &mut err);
    dbus_message_unref(msg);

    if reply.is_null() || dbus_error_is_set(&err) != 0 {
        if dbus_error_is_set(&err) != 0 {
            let name = if err.name.is_null() { "<null>" } else {
                CStr::from_ptr(err.name).to_str().unwrap_or("<bad utf8>")
            };
            let emsg = if err.message.is_null() { "<null>" } else {
                CStr::from_ptr(err.message).to_str().unwrap_or("<bad utf8>")
            };
            eprintln!("dbus_portal: {}.{} failed: {} — {}", iface, method, name, emsg);
        }
        dbus_error_free(&mut err);
        return None;
    }
    Some(reply)
}

/// Initialize a read iterator on a message. Returns None if the message has no args.
pub(crate) unsafe fn msg_iter_init(msg: *mut c_void) -> Option<DBusMessageIter> {
    let mut iter = DBusMessageIter::new();
    if dbus_message_iter_init(msg, &mut iter) == 0 {
        return None;
    }
    Some(iter)
}

/// Unref a DBusMessage.
pub(crate) unsafe fn msg_unref(msg: *mut c_void) {
    {
        dbus_message_unref(msg);
    }
}

/// Get the interface name from a D-Bus message.
pub(crate) unsafe fn msg_get_interface(msg: *mut c_void) -> Option<String> {
    let ptr = dbus_message_get_interface(msg);
    if ptr.is_null() { return None; }
    Some(CStr::from_ptr(ptr).to_string_lossy().into_owned())
}

/// Get the member name from a D-Bus message.
pub(crate) unsafe fn msg_get_member(msg: *mut c_void) -> Option<String> {
    let ptr = dbus_message_get_member(msg);
    if ptr.is_null() { return None; }
    Some(CStr::from_ptr(ptr).to_string_lossy().into_owned())
}

/// Get the message type.
pub(crate) unsafe fn msg_get_type(msg: *mut c_void) -> c_int {
    dbus_message_get_type(msg)
}

/// Pop the next message from a connection. Returns null if no message is pending.
pub(crate) unsafe fn conn_pop_message(conn: &mut DBusConn) -> *mut c_void {
    dbus_connection_pop_message(conn.conn)
}

/// Read/write on a connection with a timeout. Returns false if disconnected.
pub(crate) unsafe fn conn_read_write(conn: &mut DBusConn, timeout_ms: i32) -> bool {
    dbus_connection_read_write(conn.conn, timeout_ms) != 0
}

// ── portal_get_eis_fd ────────────────────────────────────────────────

pub unsafe fn portal_get_eis_fd() -> Option<RawFd> {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    let mut conn = dbus_connect()?;
    let pid = libc::getpid();
    let cnt = COUNTER.fetch_add(1, Ordering::Relaxed) + 1;

    // CreateSession
    let token1 = format!("mechatron_{}_{}_cs", pid, cnt);
    let session_token = format!("mechatron_{}_{}_s", pid, cnt);
    let token1_clone = token1.clone();
    let session_token_clone = session_token.clone();
    let resp1 = portal_call(&mut conn, RD_IFACE, "CreateSession", &token1, |iter| {
        iter_append_asv(iter, &[
            AsvEntry::Str("handle_token", &token1_clone),
            AsvEntry::Str("session_handle_token", &session_token_clone),
        ]);
    })?;
    let session_path = extract_session_handle(&resp1)?;
    response_data_free(resp1);

    // SelectDevices (types: 3 = keyboard + pointer)
    let token2 = format!("mechatron_{}_{}_sd", pid, cnt);
    let session_path_clone = session_path.clone();
    let token2_clone = token2.clone();
    let resp2 = portal_call(&mut conn, RD_IFACE, "SelectDevices", &token2, |iter| {
        iter_append_object_path(iter, &session_path_clone);
        iter_append_asv(iter, &[
            AsvEntry::Str("handle_token", &token2_clone),
            AsvEntry::U32("types", 3),
        ]);
    })?;
    if resp2.code != 0 {
        response_data_free(resp2);
        return None;
    }
    response_data_free(resp2);

    // Start
    let token3 = format!("mechatron_{}_{}_st", pid, cnt);
    let session_path_clone = session_path.clone();
    let token3_clone = token3.clone();
    let resp3 = portal_call(&mut conn, RD_IFACE, "Start", &token3, |iter| {
        iter_append_object_path(iter, &session_path_clone);
        iter_append_string(iter, ""); // parent_window
        iter_append_asv(iter, &[
            AsvEntry::Str("handle_token", &token3_clone),
        ]);
    })?;
    if resp3.code != 0 {
        response_data_free(resp3);
        return None;
    }
    response_data_free(resp3);

    // ConnectToEIS — blocking method call, fd in reply
    let session_path_clone = session_path.clone();
    let reply = call_method(
        &mut conn,
        PORTAL_DEST,
        PORTAL_PATH,
        RD_IFACE,
        "ConnectToEIS",
        |iter| {
            iter_append_object_path(iter, &session_path_clone);
            iter_append_asv(iter, &[]);
        },
    )?;

    let mut iter = match msg_iter_init(reply) {
        Some(it) => it,
        None => { msg_unref(reply); return None; }
    };
    let fd = iter_get_fd(&mut iter);
    msg_unref(reply);

    let fd = fd?;

    // Leak conn intentionally — portal session must remain open
    std::mem::forget(conn);

    Some(fd)
}
