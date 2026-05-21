// Linux portal window implementation — AT-SPI2 read-only enumeration.
//
// xdg-desktop-portal does not expose a "manage windows" interface, so
// the same Wayland security model that gates clipboard/screen access
// also blocks any write path for windows. AT-SPI2 (the accessibility
// bus) is the one standard channel that *does* expose window enumeration,
// regardless of compositor: GNOME, KDE, etc. all run an at-spi-registryd
// process that publishes the org.a11y.atspi.Accessible tree.
//
// This crate mirrors `lib/nolib/window-portal.ts` byte-for-byte at the
// observable level: the same FNV-1a(bus+path) handle hashing, the same
// read-only stubs for every setter/getter outside of list/isValid. The
// difference is purely that the D-Bus traffic runs through libdbus-1
// rather than the pure-TS protocol in lib/dbus/. Useful for non-Bun
// runtimes (plain node) where the ffi backend isn't an option.
//
// Linking: libdbus-1 only — AT-SPI is a service on top of D-Bus, so
// no separate atspi library is needed. dlopen is not used (per project
// napi-linking convention), so when libdbus-1 is missing the binary
// fails to load and the resolver moves on.

#![allow(non_upper_case_globals, dead_code)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::ffi::{c_char, c_int, c_void, CString};
use std::sync::Mutex;

#[path = "dbus_portal.rs"]
mod dbus_portal;

use dbus_portal::{
    call_method, iter_arg_type, iter_get_i32, iter_get_string, iter_get_u32, iter_next,
    iter_recurse, msg_iter_init, msg_unref, DBusConn,
};

// ── Extra libdbus-1 functions for opening a non-session bus ────────

// dbus_portal.rs hard-wires dbus_bus_get_private(DBUS_BUS_SESSION) — the
// AT-SPI bus lives at its own socket address, so we declare the few
// libdbus-1 entry points needed to open + register against a custom
// address.

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

extern "C" {
    fn dbus_error_init(error: *mut DBusError);
    fn dbus_error_is_set(error: *const DBusError) -> u32;
    fn dbus_error_free(error: *mut DBusError);
    fn dbus_connection_open_private(address: *const c_char, error: *mut DBusError) -> *mut c_void;
    fn dbus_bus_register(connection: *mut c_void, error: *mut DBusError) -> u32;
    fn dbus_bus_get_unique_name(connection: *mut c_void) -> *const c_char;
    fn dbus_connection_close(connection: *mut c_void);
    fn dbus_connection_unref(connection: *mut c_void);
}

// ── AT-SPI bus constants ────────────────────────────────────────────

const ATSPI_BUS_NAME: &str = "org.a11y.atspi.Registry";
const ATSPI_REG_PATH: &str = "/org/a11y/atspi/accessible/root";
const ATSPI_ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const ATSPI_COMPONENT: &str = "org.a11y.atspi.Component";
const ATSPI_APPLICATION: &str = "org.a11y.atspi.Application";

const ROLE_FRAME: i32 = 22;
const ROLE_DIALOG: i32 = 23;

// ── Cached AT-SPI bus connection ────────────────────────────────────

// libdbus-1 connections are not Send by default (raw pointer). Wrap the
// pointer in a struct that we manually mark Send + Sync — we own the
// connection exclusively under the Mutex and only call into libdbus-1
// while holding the lock.

struct AtSpiConn(DBusConn);
unsafe impl Send for AtSpiConn {}
unsafe impl Sync for AtSpiConn {}

static ATSPI_CONN: Mutex<Option<AtSpiConn>> = Mutex::new(None);

// Connect to the AT-SPI bus and return a DBusConn for it. The AT-SPI bus
// address is published by the session bus's org.a11y.Bus interface; we
// open a session connection long enough to read that address, then open
// a private connection to the AT-SPI socket and register against it.
unsafe fn atspi_open() -> Option<DBusConn> {
    // Honour the AT_SPI_BUS_ADDRESS env override (matches the TS path).
    let env_addr = std::env::var("AT_SPI_BUS_ADDRESS").ok();
    let address = match env_addr {
        Some(a) if !a.is_empty() => a,
        _ => {
            let mut session = dbus_portal::dbus_connect()?;
            let reply = call_method(
                &mut session,
                "org.a11y.Bus",
                "/org/a11y/bus",
                "org.a11y.Bus",
                "GetAddress",
                |_iter| {},
            )?;
            let mut it = match msg_iter_init(reply) {
                Some(it) => it,
                None => {
                    msg_unref(reply);
                    return None;
                }
            };
            let addr = iter_get_string(&mut it);
            msg_unref(reply);
            addr?
        }
    };

    let caddr = CString::new(address).ok()?;
    let mut err = std::mem::zeroed::<DBusError>();
    dbus_error_init(&mut err);
    let conn = dbus_connection_open_private(caddr.as_ptr(), &mut err);
    if conn.is_null() || dbus_error_is_set(&err) != 0 {
        dbus_error_free(&mut err);
        return None;
    }
    if dbus_bus_register(conn, &mut err) == 0 || dbus_error_is_set(&err) != 0 {
        dbus_error_free(&mut err);
        dbus_connection_close(conn);
        dbus_connection_unref(conn);
        return None;
    }
    let name_ptr = dbus_bus_get_unique_name(conn);
    let unique_name = if name_ptr.is_null() {
        String::new()
    } else {
        std::ffi::CStr::from_ptr(name_ptr)
            .to_string_lossy()
            .into_owned()
    };
    Some(DBusConn { conn, unique_name })
}

// Pull the cached connection out of the Mutex, run a closure against it,
// then put it back. If the closure returns None or the connection isn't
// open yet, transparently (re)connect.
fn with_atspi<T, F>(f: F) -> Option<T>
where
    F: FnOnce(&mut DBusConn) -> Option<T>,
{
    let mut guard = ATSPI_CONN.lock().ok()?;
    if guard.is_none() {
        let conn = unsafe { atspi_open() }?;
        *guard = Some(AtSpiConn(conn));
    }
    let result = f(&mut guard.as_mut().unwrap().0);
    if result.is_none() {
        // Drop a dead connection so the next call retries the handshake.
        if let Some(AtSpiConn(c)) = guard.take() {
            unsafe {
                dbus_connection_close(c.conn);
                dbus_connection_unref(c.conn);
            }
        }
    }
    result
}

// ── AT-SPI2 method-call helpers ─────────────────────────────────────

// Call Accessible.GetChildCount on (dest, path) → i32.
unsafe fn atspi_get_child_count(conn: &mut DBusConn, dest: &str, path: &str) -> Option<i32> {
    let reply = call_method(conn, dest, path, ATSPI_ACCESSIBLE, "GetChildCount", |_iter| {})?;
    let result = (|| {
        let mut it = msg_iter_init(reply)?;
        iter_get_i32(&mut it)
    })();
    msg_unref(reply);
    result
}

// Call Accessible.GetChildAtIndex(idx) → (bus, path).
unsafe fn atspi_get_child(
    conn: &mut DBusConn, dest: &str, path: &str, idx: i32,
) -> Option<(String, String)> {
    let reply = call_method(
        conn, dest, path, ATSPI_ACCESSIBLE, "GetChildAtIndex",
        |iter| dbus_portal::iter_append_i32(iter, idx),
    )?;
    let result = (|| {
        let mut it = msg_iter_init(reply)?;
        // GetChildAtIndex returns a single (so) struct argument
        let mut s = iter_recurse(&mut it)?;
        let bus = iter_get_string(&mut s)?;
        iter_next(&mut s);
        let p = iter_get_string(&mut s)?;
        Some((bus, p))
    })();
    msg_unref(reply);
    result
}

unsafe fn atspi_get_role(conn: &mut DBusConn, dest: &str, path: &str) -> Option<i32> {
    let reply = call_method(conn, dest, path, ATSPI_ACCESSIBLE, "GetRole", |_iter| {})?;
    let result = (|| {
        let mut it = msg_iter_init(reply)?;
        // GetRole returns u32 (enum); accept either u32 or i32.
        match iter_arg_type(&mut it) {
            t if t == ('u' as c_int) => iter_get_u32(&mut it).map(|v| v as i32),
            t if t == ('i' as c_int) => iter_get_i32(&mut it),
            _ => None,
        }
    })();
    msg_unref(reply);
    result
}

unsafe fn atspi_get_name(conn: &mut DBusConn, dest: &str, path: &str) -> Option<String> {
    let reply = call_method(conn, dest, path, ATSPI_ACCESSIBLE, "GetName", |_iter| {})?;
    let result = (|| {
        let mut it = msg_iter_init(reply)?;
        iter_get_string(&mut it)
    })();
    msg_unref(reply);
    result
}

unsafe fn atspi_get_pid(conn: &mut DBusConn, dest: &str, path: &str) -> Option<i32> {
    let reply = call_method(conn, dest, path, ATSPI_APPLICATION, "GetProcessId", |_iter| {})?;
    let result = (|| {
        let mut it = msg_iter_init(reply)?;
        // GetProcessId returns u32
        match iter_arg_type(&mut it) {
            t if t == ('u' as c_int) => iter_get_u32(&mut it).map(|v| v as i32),
            t if t == ('i' as c_int) => iter_get_i32(&mut it),
            _ => None,
        }
    })();
    msg_unref(reply);
    result
}

// ── Window enumeration ──────────────────────────────────────────────

struct AtSpiWindow {
    bus: String,
    path: String,
    name: String,
}

unsafe fn atspi_list_windows(conn: &mut DBusConn) -> Vec<AtSpiWindow> {
    let mut out = Vec::new();

    let app_count = match atspi_get_child_count(conn, ATSPI_BUS_NAME, ATSPI_REG_PATH) {
        Some(c) => c,
        None => return out,
    };

    for i in 0..app_count {
        let (app_bus, app_path) = match atspi_get_child(conn, ATSPI_BUS_NAME, ATSPI_REG_PATH, i) {
            Some(x) => x,
            None => continue,
        };
        if app_bus.is_empty() {
            continue;
        }
        // GetProcessId is best-effort; ignore failures (matches the TS path).
        let _ = atspi_get_pid(conn, &app_bus, &app_path);

        let win_count = match atspi_get_child_count(conn, &app_bus, &app_path) {
            Some(c) => c,
            None => continue,
        };
        for j in 0..win_count {
            let (win_bus, win_path) = match atspi_get_child(conn, &app_bus, &app_path, j) {
                Some(x) => x,
                None => continue,
            };
            let role = match atspi_get_role(conn, &win_bus, &win_path) {
                Some(r) => r,
                None => continue,
            };
            if role != ROLE_FRAME && role != ROLE_DIALOG {
                continue;
            }
            let name = atspi_get_name(conn, &win_bus, &win_path).unwrap_or_default();
            out.push(AtSpiWindow { bus: win_bus, path: win_path, name });
        }
    }

    out
}

// ── Handle hashing (FNV-1a, must match lib/nolib/window-portal.ts) ──

fn atspi_window_hash(bus: &str, path: &str) -> u64 {
    let mut h: u32 = 0x811c9dc5;
    for b in bus.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    for b in path.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    // High bit set so handles can't collide with future numeric schemes.
    (h | 0x80000000) as u64
}

// ── Platform glue ───────────────────────────────────────────────────

fn platform_window_get_list(regex_str: Option<String>) -> Vec<u64> {
    let pattern = regex_str.as_deref().and_then(|s| regex::Regex::new(s).ok());
    with_atspi(|conn| {
        let windows = unsafe { atspi_list_windows(conn) };
        let filtered: Vec<u64> = windows
            .iter()
            .filter(|w| pattern.as_ref().map_or(true, |re| re.is_match(&w.name)))
            .map(|w| atspi_window_hash(&w.bus, &w.path))
            .collect();
        Some(filtered)
    })
    .unwrap_or_default()
}

fn platform_window_is_valid(handle: u64) -> bool {
    if handle == 0 {
        return false;
    }
    let list = platform_window_get_list(None);
    list.contains(&handle)
}

// ── BigInt helpers ──────────────────────────────────────────────────

fn bi_to_u64(bi: &BigInt) -> u64 {
    let (sign, val, _) = bi.get_u64();
    if sign { 0 } else { val }
}

fn u64_to_bi(val: u64) -> BigInt {
    BigInt { sign_bit: false, words: vec![val] }
}

// ── AsyncTask wrappers ──────────────────────────────────────────────

pub struct GetListTask {
    regex_str: Option<String>,
}
impl Task for GetListTask {
    type Output = Vec<u64>;
    type JsValue = Vec<BigInt>;
    fn compute(&mut self) -> Result<Self::Output> {
        Ok(platform_window_get_list(self.regex_str.clone()))
    }
    fn resolve(&mut self, _env: Env, out: Self::Output) -> Result<Self::JsValue> {
        Ok(out.into_iter().map(u64_to_bi).collect())
    }
}

pub struct IsValidTask {
    handle: u64,
}
impl Task for IsValidTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<Self::Output> {
        Ok(platform_window_is_valid(self.handle))
    }
    fn resolve(&mut self, _env: Env, out: Self::Output) -> Result<Self::JsValue> {
        Ok(out)
    }
}

pub struct BoolStubTask;
impl Task for BoolStubTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<Self::Output> { Ok(false) }
    fn resolve(&mut self, _env: Env, _out: Self::Output) -> Result<Self::JsValue> { Ok(false) }
}

pub struct VoidStubTask;
impl Task for VoidStubTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> { Ok(()) }
    fn resolve(&mut self, _env: Env, _out: Self::Output) -> Result<Self::JsValue> { Ok(()) }
}

pub struct NumberStubTask;
impl Task for NumberStubTask {
    type Output = u32;
    type JsValue = u32;
    fn compute(&mut self) -> Result<Self::Output> { Ok(0) }
    fn resolve(&mut self, _env: Env, _out: Self::Output) -> Result<Self::JsValue> { Ok(0) }
}

pub struct StringStubTask;
impl Task for StringStubTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<Self::Output> { Ok(String::new()) }
    fn resolve(&mut self, _env: Env, _out: Self::Output) -> Result<Self::JsValue> { Ok(String::new()) }
}

pub struct BigIntStubTask;
impl Task for BigIntStubTask {
    type Output = u64;
    type JsValue = BigInt;
    fn compute(&mut self) -> Result<Self::Output> { Ok(0) }
    fn resolve(&mut self, _env: Env, _out: Self::Output) -> Result<Self::JsValue> { Ok(u64_to_bi(0)) }
}

pub struct EchoBigIntTask { handle: u64 }
impl Task for EchoBigIntTask {
    type Output = u64;
    type JsValue = BigInt;
    fn compute(&mut self) -> Result<Self::Output> { Ok(self.handle) }
    fn resolve(&mut self, _env: Env, out: Self::Output) -> Result<Self::JsValue> { Ok(u64_to_bi(out)) }
}

pub struct SetHandleTask { handle: u64 }
impl Task for SetHandleTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<Self::Output> {
        if self.handle == 0 { return Ok(true); }
        Ok(platform_window_is_valid(self.handle))
    }
    fn resolve(&mut self, _env: Env, out: Self::Output) -> Result<Self::JsValue> { Ok(out) }
}

#[derive(Clone, Copy)]
struct ZeroBounds;
pub struct BoundsStubTask;
impl Task for BoundsStubTask {
    type Output = (i32, i32, i32, i32);
    type JsValue = napi::JsObject;
    fn compute(&mut self) -> Result<Self::Output> { Ok((0, 0, 0, 0)) }
    fn resolve(&mut self, env: Env, out: Self::Output) -> Result<Self::JsValue> {
        let mut obj = env.create_object()?;
        obj.set("x", out.0)?;
        obj.set("y", out.1)?;
        obj.set("w", out.2)?;
        obj.set("h", out.3)?;
        Ok(obj)
    }
}

pub struct PointEchoTask { x: i32, y: i32 }
impl Task for PointEchoTask {
    type Output = (i32, i32);
    type JsValue = napi::JsObject;
    fn compute(&mut self) -> Result<Self::Output> { Ok((self.x, self.y)) }
    fn resolve(&mut self, env: Env, out: Self::Output) -> Result<Self::JsValue> {
        let mut obj = env.create_object()?;
        obj.set("x", out.0)?;
        obj.set("y", out.1)?;
        Ok(obj)
    }
}

// ── napi exports ────────────────────────────────────────────────────

#[napi(js_name = "window_getList")]
pub fn window_get_list(regex_str: Option<String>) -> AsyncTask<GetListTask> {
    AsyncTask::new(GetListTask { regex_str })
}

#[napi(js_name = "window_isValid")]
pub fn window_is_valid(handle: BigInt) -> AsyncTask<IsValidTask> {
    AsyncTask::new(IsValidTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_close")]
pub fn window_close(_handle: BigInt) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_isTopMost")]
pub fn window_is_top_most(_handle: BigInt) -> AsyncTask<BoolStubTask> {
    AsyncTask::new(BoolStubTask)
}

#[napi(js_name = "window_isBorderless")]
pub fn window_is_borderless(_handle: BigInt) -> AsyncTask<BoolStubTask> {
    AsyncTask::new(BoolStubTask)
}

#[napi(js_name = "window_isMinimized")]
pub fn window_is_minimized(_handle: BigInt) -> AsyncTask<BoolStubTask> {
    AsyncTask::new(BoolStubTask)
}

#[napi(js_name = "window_isMaximized")]
pub fn window_is_maximized(_handle: BigInt) -> AsyncTask<BoolStubTask> {
    AsyncTask::new(BoolStubTask)
}

#[napi(js_name = "window_setTopMost")]
pub fn window_set_top_most(_handle: BigInt, _top_most: bool) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_setBorderless")]
pub fn window_set_borderless(_handle: BigInt, _borderless: bool) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_setMinimized")]
pub fn window_set_minimized(_handle: BigInt, _minimized: bool) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_setMaximized")]
pub fn window_set_maximized(_handle: BigInt, _maximized: bool) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_getProcess")]
pub fn window_get_process(_handle: BigInt) -> AsyncTask<NumberStubTask> {
    AsyncTask::new(NumberStubTask)
}

#[napi(js_name = "window_getPID")]
pub fn window_get_pid(_handle: BigInt) -> AsyncTask<NumberStubTask> {
    AsyncTask::new(NumberStubTask)
}

#[napi(js_name = "window_getHandle")]
pub fn window_get_handle(handle: BigInt) -> AsyncTask<EchoBigIntTask> {
    AsyncTask::new(EchoBigIntTask { handle: bi_to_u64(&handle) })
}

#[napi(js_name = "window_setHandle")]
pub fn window_set_handle(_handle: BigInt, new_handle: BigInt) -> AsyncTask<SetHandleTask> {
    AsyncTask::new(SetHandleTask { handle: bi_to_u64(&new_handle) })
}

#[napi(js_name = "window_getTitle")]
pub fn window_get_title(_handle: BigInt) -> AsyncTask<StringStubTask> {
    AsyncTask::new(StringStubTask)
}

#[napi(js_name = "window_setTitle")]
pub fn window_set_title(_handle: BigInt, _title: String) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_getBounds")]
pub fn window_get_bounds(_handle: BigInt) -> AsyncTask<BoundsStubTask> {
    AsyncTask::new(BoundsStubTask)
}

#[napi(js_name = "window_setBounds")]
pub fn window_set_bounds(
    _handle: BigInt, _x: i32, _y: i32, _w: i32, _h: i32,
) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_getClient")]
pub fn window_get_client(_handle: BigInt) -> AsyncTask<BoundsStubTask> {
    AsyncTask::new(BoundsStubTask)
}

#[napi(js_name = "window_setClient")]
pub fn window_set_client(
    _handle: BigInt, _x: i32, _y: i32, _w: i32, _h: i32,
) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_mapToClient")]
pub fn window_map_to_client(_handle: BigInt, x: i32, y: i32) -> AsyncTask<PointEchoTask> {
    AsyncTask::new(PointEchoTask { x, y })
}

#[napi(js_name = "window_mapToScreen")]
pub fn window_map_to_screen(_handle: BigInt, x: i32, y: i32) -> AsyncTask<PointEchoTask> {
    AsyncTask::new(PointEchoTask { x, y })
}

#[napi(js_name = "window_getActive")]
pub fn window_get_active() -> AsyncTask<BigIntStubTask> {
    AsyncTask::new(BigIntStubTask)
}

#[napi(js_name = "window_setActive")]
pub fn window_set_active(_handle: BigInt) -> AsyncTask<VoidStubTask> {
    AsyncTask::new(VoidStubTask)
}

#[napi(js_name = "window_isAxEnabled")]
pub fn window_is_ax_enabled(_prompt: Option<bool>) -> bool {
    true
}
