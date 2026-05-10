use std::ffi::c_void;
use std::os::unix::io::RawFd;
use std::sync::{mpsc, Mutex, Once};
use std::sync::atomic::{AtomicBool, Ordering};

use super::dbus_portal::{
    self, AsvEntry, DBusConn,
    PORTAL_DEST, PORTAL_PATH, DBUS_MESSAGE_TYPE_SIGNAL,
};

const RD_IFACE: &str = "org.freedesktop.portal.RemoteDesktop";
const CLIP_IFACE: &str = "org.freedesktop.portal.Clipboard";

// ── Command channel ─────────────────────────────────────────────────

enum Cmd {
    Clear { resp: mpsc::Sender<bool> },
    HasText { resp: mpsc::Sender<bool> },
    GetText { resp: mpsc::Sender<String> },
    SetText { text: String, resp: mpsc::Sender<bool> },
    HasImage { resp: mpsc::Sender<bool> },
    GetImage { resp: mpsc::Sender<Option<(u32, u32, Vec<u32>)>> },
    SetImage { width: u32, height: u32, data: Vec<u32>, resp: mpsc::Sender<bool> },
    GetSequence { resp: mpsc::Sender<f64> },
}

struct Handle {
    tx: Mutex<mpsc::Sender<Cmd>>,
    wake_wr: RawFd,
}

impl Handle {
    fn send(&self, cmd: Cmd) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(cmd);
        }
        unsafe { libc::write(self.wake_wr, b"\x01".as_ptr() as *const c_void, 1); }
    }

    fn request<T>(&self, f: impl FnOnce(mpsc::Sender<T>) -> Cmd) -> Option<T> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(f(resp_tx));
        resp_rx.recv().ok()
    }
}

static INIT: Once = Once::new();
static mut HANDLE_PTR: *const Handle = std::ptr::null();
static AVAILABLE: AtomicBool = AtomicBool::new(false);
static INIT_DONE: AtomicBool = AtomicBool::new(false);

fn get_handle() -> Option<&'static Handle> {
    unsafe {
        INIT.call_once(|| {
            if let Some(h) = try_init() {
                HANDLE_PTR = Box::into_raw(Box::new(h));
            } else {
                INIT_DONE.store(true, Ordering::Release);
            }
        });
        if !HANDLE_PTR.is_null() {
            for _ in 0..100 {
                if AVAILABLE.load(Ordering::Acquire) || INIT_DONE.load(Ordering::Acquire) { break; }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            if AVAILABLE.load(Ordering::Acquire) {
                return HANDLE_PTR.as_ref();
            }
        }
        None
    }
}

fn try_init() -> Option<Handle> {
    if !dbus_portal::is_loaded() { return None; }

    let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok()
        || std::env::var("XDG_SESSION_TYPE").ok().map_or(false, |v| v == "wayland");
    if !is_wayland { return None; }

    let mut pipe_fds = [0 as RawFd; 2];
    if unsafe { libc::pipe(pipe_fds.as_mut_ptr()) } != 0 {
        return None;
    }
    let pipe_rd = pipe_fds[0];
    let pipe_wr = pipe_fds[1];
    unsafe {
        let flags = libc::fcntl(pipe_rd, libc::F_GETFL);
        libc::fcntl(pipe_rd, libc::F_SETFL, flags | libc::O_NONBLOCK);
    }

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || unsafe { clipboard_thread(rx, pipe_rd) });

    Some(Handle {
        tx: Mutex::new(tx),
        wake_wr: pipe_wr,
    })
}

// ── Thread state ────────────────────────────────────────────────────

struct ClipState {
    session_path: String,
    text: Option<String>,
    png: Option<Vec<u8>>,
    owns: bool,
    external_mimes: Vec<String>,
    sequence: u64,
}

// ── Background thread ───────────────────────────────────────────────

unsafe fn clipboard_thread(rx: mpsc::Receiver<Cmd>, wake_rd: RawFd) {
    match clipboard_thread_init(wake_rd) {
        Some((mut conn, mut state)) => {
            AVAILABLE.store(true, Ordering::Release);
            INIT_DONE.store(true, Ordering::Release);
            clipboard_event_loop(&mut conn, &mut state, rx, wake_rd);
        }
        None => {
            INIT_DONE.store(true, Ordering::Release);
        }
    }
}

unsafe fn clipboard_thread_init(wake_rd: RawFd) -> Option<(DBusConn, ClipState)> {
    use std::sync::atomic::AtomicU32;
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    let mut conn = dbus_portal::dbus_connect()?;

    let pid = libc::getpid();
    let cnt = COUNTER.fetch_add(1, Ordering::Relaxed) + 1;

    // CreateSession
    let token1 = format!("mechatron_clip_{}_{}_cs", pid, cnt);
    let session_token = format!("mechatron_clip_{}_{}_s", pid, cnt);
    let token1_c = token1.clone();
    let session_token_c = session_token.clone();
    let resp1 = dbus_portal::portal_call(
        &mut conn, RD_IFACE, "CreateSession", &token1,
        |iter| {
            dbus_portal::iter_append_asv(iter, &[
                AsvEntry::Str("handle_token", &token1_c),
                AsvEntry::Str("session_handle_token", &session_token_c),
            ]);
        },
    )?;
    let session_path = match dbus_portal::extract_session_handle(&resp1) {
        Some(s) => { dbus_portal::response_data_free(resp1); s }
        None => { dbus_portal::response_data_free(resp1); return None; }
    };

    // SelectDevices (keyboard + pointer)
    let token2 = format!("mechatron_clip_{}_{}_sd", pid, cnt);
    let sp2 = session_path.clone();
    let token2_c = token2.clone();
    let resp2 = dbus_portal::portal_call(
        &mut conn, RD_IFACE, "SelectDevices", &token2,
        |iter| {
            dbus_portal::iter_append_object_path(iter, &sp2);
            dbus_portal::iter_append_asv(iter, &[
                AsvEntry::Str("handle_token", &token2_c),
                AsvEntry::U32("types", 3),
            ]);
        },
    )?;
    if resp2.code != 0 { dbus_portal::response_data_free(resp2); return None; }
    dbus_portal::response_data_free(resp2);

    // RequestClipboard (on Clipboard interface, BEFORE Start)
    let sp_rc = session_path.clone();
    let reply = dbus_portal::call_method(
        &mut conn, PORTAL_DEST, PORTAL_PATH, CLIP_IFACE, "RequestClipboard",
        |iter| {
            dbus_portal::iter_append_object_path(iter, &sp_rc);
            dbus_portal::iter_append_asv(iter, &[]);
        },
    )?;
    dbus_portal::msg_unref(reply);

    // Start
    let token3 = format!("mechatron_clip_{}_{}_st", pid, cnt);
    let sp3 = session_path.clone();
    let token3_c = token3.clone();
    let resp3 = dbus_portal::portal_call(
        &mut conn, RD_IFACE, "Start", &token3,
        |iter| {
            dbus_portal::iter_append_object_path(iter, &sp3);
            dbus_portal::iter_append_string(iter, "");
            dbus_portal::iter_append_asv(iter, &[
                AsvEntry::Str("handle_token", &token3_c),
            ]);
        },
    )?;
    if resp3.code != 0 { dbus_portal::response_data_free(resp3); return None; }
    dbus_portal::response_data_free(resp3);

    // Subscribe to Clipboard signals
    dbus_portal::add_match(&mut conn, &format!(
        "type='signal',interface='{}'", CLIP_IFACE
    ));

    let state = ClipState {
        session_path,
        text: None,
        png: None,
        owns: false,
        external_mimes: Vec::new(),
        sequence: 0,
    };

    let _ = wake_rd;
    Some((conn, state))
}

unsafe fn clipboard_event_loop(
    conn: &mut DBusConn,
    state: &mut ClipState,
    rx: mpsc::Receiver<Cmd>,
    wake_rd: RawFd,
) {
    loop {
        if !dbus_portal::conn_read_write(conn, 100) {
            break;
        }

        loop {
            let msg = dbus_portal::conn_pop_message(conn);
            if msg.is_null() { break; }
            let mtype = dbus_portal::msg_get_type(msg);
            if mtype == DBUS_MESSAGE_TYPE_SIGNAL {
                handle_signal(msg, state, conn);
            }
            dbus_portal::msg_unref(msg);
        }

        let mut buf = [0u8; 64];
        while libc::read(wake_rd, buf.as_mut_ptr() as *mut c_void, buf.len()) > 0 {}

        while let Ok(cmd) = rx.try_recv() {
            process_cmd(cmd, state, conn);
        }
    }
}

unsafe fn handle_signal(msg: *mut c_void, state: &mut ClipState, conn: &mut DBusConn) {
    let iface = match dbus_portal::msg_get_interface(msg) {
        Some(i) => i,
        None => return,
    };
    if iface != CLIP_IFACE { return; }

    let member = match dbus_portal::msg_get_member(msg) {
        Some(m) => m,
        None => return,
    };

    match member.as_str() {
        "SelectionOwnerChanged" => {
            let mut iter = match dbus_portal::msg_iter_init(msg) {
                Some(it) => it,
                None => return,
            };
            // skip session_handle (o)
            dbus_portal::iter_skip(&mut iter);
            // options a{sv}
            let mut arr = match dbus_portal::iter_recurse(&mut iter) {
                Some(a) => a,
                None => return,
            };
            let mut is_owner = false;
            let mut mimes: Vec<String> = Vec::new();
            loop {
                if dbus_portal::iter_arg_type(&mut arr) == 0 { break; }
                let mut entry = match dbus_portal::iter_recurse(&mut arr) {
                    Some(e) => e,
                    None => break,
                };
                let key = match dbus_portal::iter_get_string(&mut entry) {
                    Some(k) => k,
                    None => { dbus_portal::iter_next(&mut arr); continue; }
                };
                dbus_portal::iter_next(&mut entry);
                match key.as_str() {
                    "session_is_owner" => {
                        let mut var = match dbus_portal::iter_recurse(&mut entry) {
                            Some(v) => v,
                            None => { dbus_portal::iter_next(&mut arr); continue; }
                        };
                        if let Some(v) = dbus_portal::iter_get_u32(&mut var) {
                            is_owner = v != 0;
                        }
                    }
                    "mime_types" => {
                        let mut var = match dbus_portal::iter_recurse(&mut entry) {
                            Some(v) => v,
                            None => { dbus_portal::iter_next(&mut arr); continue; }
                        };
                        let mut arr_inner = match dbus_portal::iter_recurse(&mut var) {
                            Some(a) => a,
                            None => { dbus_portal::iter_next(&mut arr); continue; }
                        };
                        loop {
                            if dbus_portal::iter_arg_type(&mut arr_inner) == 0 { break; }
                            if let Some(s) = dbus_portal::iter_get_string(&mut arr_inner) {
                                mimes.push(s);
                            }
                            dbus_portal::iter_next(&mut arr_inner);
                        }
                    }
                    _ => {}
                }
                dbus_portal::iter_next(&mut arr);
            }
            if !is_owner {
                state.owns = false;
                state.external_mimes = mimes;
                state.sequence += 1;
            }
        }
        "SelectionTransfer" => {
            let mut iter = match dbus_portal::msg_iter_init(msg) {
                Some(it) => it,
                None => return,
            };
            // skip session_handle (o)
            dbus_portal::iter_skip(&mut iter);
            // mime_type (s)
            let mime = match dbus_portal::iter_get_string(&mut iter) {
                Some(m) => m,
                None => return,
            };
            dbus_portal::iter_next(&mut iter);
            // serial (u)
            let serial = match dbus_portal::iter_get_u32(&mut iter) {
                Some(s) => s,
                None => return,
            };

            serve_selection(state, conn, &mime, serial);
        }
        _ => {}
    }
}

unsafe fn serve_selection(state: &ClipState, conn: &mut DBusConn, mime: &str, serial: u32) {
    let sp = state.session_path.clone();
    let reply = dbus_portal::call_method(
        conn, PORTAL_DEST, PORTAL_PATH, CLIP_IFACE, "SelectionWrite",
        |iter| {
            dbus_portal::iter_append_object_path(iter, &sp);
            dbus_portal::iter_append_u32(iter, serial);
        },
    );
    let fd = match reply {
        Some(r) => {
            let mut it = match dbus_portal::msg_iter_init(r) {
                Some(it) => it,
                None => { dbus_portal::msg_unref(r); return; }
            };
            let fd = dbus_portal::iter_get_fd(&mut it);
            dbus_portal::msg_unref(r);
            match fd {
                Some(f) => f,
                None => return,
            }
        }
        None => return,
    };

    let data: &[u8] = match mime {
        "text/plain" | "text/plain;charset=utf-8" | "UTF8_STRING" | "STRING" => {
            match &state.text {
                Some(t) => t.as_bytes(),
                None => b"",
            }
        }
        "image/png" => {
            match &state.png {
                Some(p) => p.as_slice(),
                None => b"",
            }
        }
        _ => b"",
    };

    let mut written = 0;
    while written < data.len() {
        let n = libc::write(fd, data[written..].as_ptr() as *const c_void, data.len() - written);
        if n <= 0 { break; }
        written += n as usize;
    }
    libc::close(fd);

    let sp2 = state.session_path.clone();
    let reply2 = dbus_portal::call_method(
        conn, PORTAL_DEST, PORTAL_PATH, CLIP_IFACE, "SelectionWriteDone",
        |iter| {
            dbus_portal::iter_append_object_path(iter, &sp2);
            dbus_portal::iter_append_u32(iter, serial);
            dbus_portal::iter_append_bool(iter, true);
        },
    );
    if let Some(r) = reply2 { dbus_portal::msg_unref(r); }
}

unsafe fn process_cmd(cmd: Cmd, state: &mut ClipState, conn: &mut DBusConn) {
    match cmd {
        Cmd::Clear { resp } => {
            state.text = None;
            state.png = None;
            state.owns = false;
            state.sequence += 1;
            // SetSelection with empty mime_types to release ownership
            let sp = state.session_path.clone();
            let empty: &[&str] = &[];
            let _ = dbus_portal::call_method(
                conn, PORTAL_DEST, PORTAL_PATH, CLIP_IFACE, "SetSelection",
                |iter| {
                    dbus_portal::iter_append_object_path(iter, &sp);
                    dbus_portal::iter_append_asv(iter, &[
                        AsvEntry::StrArray("mime_types", empty),
                    ]);
                },
            ).map(|r| dbus_portal::msg_unref(r));
            let _ = resp.send(true);
        }

        Cmd::HasText { resp } => {
            if state.owns {
                let _ = resp.send(state.text.is_some());
                return;
            }
            let has = state.external_mimes.iter().any(|m| {
                m == "text/plain;charset=utf-8" || m == "text/plain"
                    || m == "UTF8_STRING" || m == "STRING"
            });
            let _ = resp.send(has);
        }

        Cmd::GetText { resp } => {
            if state.owns {
                let _ = resp.send(state.text.clone().unwrap_or_default());
                return;
            }
            let text = read_selection(state, conn, "text/plain;charset=utf-8")
                .or_else(|| read_selection(state, conn, "text/plain"))
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .unwrap_or_default();
            let _ = resp.send(text);
        }

        Cmd::SetText { text, resp } => {
            state.text = Some(text);
            state.png = None;
            let mimes: &[&str] = &[
                "text/plain;charset=utf-8", "text/plain", "UTF8_STRING", "STRING",
            ];
            let sp = state.session_path.clone();
            let reply = dbus_portal::call_method(
                conn, PORTAL_DEST, PORTAL_PATH, CLIP_IFACE, "SetSelection",
                |iter| {
                    dbus_portal::iter_append_object_path(iter, &sp);
                    dbus_portal::iter_append_asv(iter, &[
                        AsvEntry::StrArray("mime_types", mimes),
                    ]);
                },
            );
            let ok = reply.is_some();
            if let Some(r) = reply { dbus_portal::msg_unref(r); }
            if ok {
                state.owns = true;
                state.sequence += 1;
            }
            let _ = resp.send(ok);
        }

        Cmd::HasImage { resp } => {
            if state.owns {
                let _ = resp.send(state.png.is_some());
                return;
            }
            let has = state.external_mimes.iter().any(|m| m == "image/png");
            let _ = resp.send(has);
        }

        Cmd::GetImage { resp } => {
            if state.owns {
                let result = state.png.as_ref().and_then(|p| super::png_to_argb(p));
                let _ = resp.send(result);
                return;
            }
            let result = read_selection(state, conn, "image/png")
                .and_then(|b| super::png_to_argb(&b));
            let _ = resp.send(result);
        }

        Cmd::SetImage { width, height, data, resp } => {
            match super::argb_to_png(width, height, &data) {
                Some(png_bytes) => {
                    state.png = Some(png_bytes);
                    state.text = None;
                    let mimes: &[&str] = &["image/png"];
                    let sp = state.session_path.clone();
                    let reply = dbus_portal::call_method(
                        conn, PORTAL_DEST, PORTAL_PATH, CLIP_IFACE, "SetSelection",
                        |iter| {
                            dbus_portal::iter_append_object_path(iter, &sp);
                            dbus_portal::iter_append_asv(iter, &[
                                AsvEntry::StrArray("mime_types", mimes),
                            ]);
                        },
                    );
                    let ok = reply.is_some();
                    if let Some(r) = reply { dbus_portal::msg_unref(r); }
                    if ok {
                        state.owns = true;
                        state.sequence += 1;
                    }
                    let _ = resp.send(ok);
                }
                None => { let _ = resp.send(false); }
            }
        }

        Cmd::GetSequence { resp } => {
            let _ = resp.send(state.sequence as f64);
        }
    }
}

unsafe fn read_selection(state: &ClipState, conn: &mut DBusConn, mime: &str) -> Option<Vec<u8>> {
    let sp = state.session_path.clone();
    let mime_owned = mime.to_string();
    let reply = dbus_portal::call_method(
        conn, PORTAL_DEST, PORTAL_PATH, CLIP_IFACE, "SelectionRead",
        |iter| {
            dbus_portal::iter_append_object_path(iter, &sp);
            dbus_portal::iter_append_string(iter, &mime_owned);
        },
    )?;

    let mut it = dbus_portal::msg_iter_init(reply)?;
    let fd = dbus_portal::iter_get_fd(&mut it);
    dbus_portal::msg_unref(reply);
    let fd = fd?;

    let mut data = Vec::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = libc::read(fd, buf.as_mut_ptr() as *mut c_void, buf.len());
        if n <= 0 { break; }
        data.extend_from_slice(&buf[..n as usize]);
    }
    libc::close(fd);

    if data.is_empty() { None } else { Some(data) }
}

// ── Public API ──────────────────────────────────────────────────────

pub fn portal_clear() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| Cmd::Clear { resp }))
        .unwrap_or(false)
}

pub fn portal_has_text() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| Cmd::HasText { resp }))
        .unwrap_or(false)
}

pub fn portal_get_text() -> String {
    get_handle()
        .and_then(|h| h.request(|resp| Cmd::GetText { resp }))
        .unwrap_or_default()
}

pub fn portal_set_text(text: &str) -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| Cmd::SetText { text: text.to_string(), resp }))
        .unwrap_or(false)
}

pub fn portal_has_image() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| Cmd::HasImage { resp }))
        .unwrap_or(false)
}

pub fn portal_get_image() -> Option<(u32, u32, Vec<u32>)> {
    get_handle().and_then(|h| h.request(|resp| Cmd::GetImage { resp }))?
}

pub fn portal_set_image(width: u32, height: u32, data: &[u32]) -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| Cmd::SetImage {
            width, height, data: data.to_vec(), resp,
        }))
        .unwrap_or(false)
}

pub fn portal_get_sequence() -> f64 {
    get_handle()
        .and_then(|h| h.request(|resp| Cmd::GetSequence { resp }))
        .unwrap_or(0.0)
}
