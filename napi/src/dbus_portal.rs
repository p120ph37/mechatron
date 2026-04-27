#![allow(non_upper_case_globals, dead_code)]

use std::ffi::c_void;
use std::os::unix::io::RawFd;

// ── D-Bus wire format helpers ──────────────────────────────────────────

fn dbus_align(buf: &mut Vec<u8>, n: usize) {
    while buf.len() % n != 0 { buf.push(0); }
}

fn dbus_u32(buf: &mut Vec<u8>, v: u32) {
    dbus_align(buf, 4);
    buf.extend_from_slice(&v.to_le_bytes());
}

pub(crate) fn dbus_string(buf: &mut Vec<u8>, s: &str) {
    dbus_u32(buf, s.len() as u32);
    buf.extend_from_slice(s.as_bytes());
    buf.push(0);
}

pub(crate) fn dbus_object_path(buf: &mut Vec<u8>, s: &str) {
    dbus_string(buf, s);
}

fn dbus_signature(buf: &mut Vec<u8>, s: &str) {
    buf.push(s.len() as u8);
    buf.extend_from_slice(s.as_bytes());
    buf.push(0);
}

fn dbus_variant_string(buf: &mut Vec<u8>, s: &str) {
    dbus_signature(buf, "s");
    dbus_string(buf, s);
}

fn dbus_variant_u32(buf: &mut Vec<u8>, v: u32) {
    dbus_signature(buf, "u");
    dbus_u32(buf, v);
}

// Read helpers
pub(crate) fn rd_align(pos: &mut usize, n: usize) {
    while *pos % n != 0 { *pos += 1; }
}

pub(crate) fn rd_u32(buf: &[u8], pos: &mut usize) -> u32 {
    rd_align(pos, 4);
    let v = u32::from_le_bytes([buf[*pos], buf[*pos+1], buf[*pos+2], buf[*pos+3]]);
    *pos += 4;
    v
}

pub(crate) fn rd_string(buf: &[u8], pos: &mut usize) -> String {
    let len = rd_u32(buf, pos) as usize;
    let s = String::from_utf8_lossy(&buf[*pos..*pos + len]).into_owned();
    *pos += len + 1; // skip NUL
    s
}

pub(crate) fn rd_signature(buf: &[u8], pos: &mut usize) -> String {
    let len = buf[*pos] as usize;
    *pos += 1;
    let s = String::from_utf8_lossy(&buf[*pos..*pos + len]).into_owned();
    *pos += len + 1;
    s
}

// ── D-Bus message building ────────────────────────────────────────────

fn field_string(s: &str) -> Vec<u8> {
    let mut v = Vec::new();
    dbus_signature(&mut v, "s");
    dbus_string(&mut v, s);
    v
}

fn field_objpath(s: &str) -> Vec<u8> {
    let mut v = Vec::new();
    dbus_signature(&mut v, "o");
    dbus_object_path(&mut v, s);
    v
}

fn field_u32(val: u32) -> Vec<u8> {
    let mut v = Vec::new();
    dbus_signature(&mut v, "u");
    dbus_u32(&mut v, val);
    v
}

fn dbus_build_msg(
    msg_type: u8, serial: u32, flags: u8,
    fields: &[(u8, &[u8])],
    body: &[u8], body_sig: &str, n_fds: u32,
) -> Vec<u8> {
    // Build header fields array
    let mut hdr_fields = Vec::new();
    for &(code, val) in fields {
        dbus_align(&mut hdr_fields, 8);
        hdr_fields.push(code);
        hdr_fields.extend_from_slice(val);
    }
    if !body_sig.is_empty() {
        dbus_align(&mut hdr_fields, 8);
        hdr_fields.push(8); // SIGNATURE field
        let mut sv = Vec::new();
        dbus_signature(&mut sv, "g");
        dbus_signature(&mut sv, body_sig);
        hdr_fields.extend_from_slice(&sv);
    }
    if n_fds > 0 {
        dbus_align(&mut hdr_fields, 8);
        hdr_fields.push(9); // UNIX_FDS field
        hdr_fields.extend_from_slice(&field_u32(n_fds));
    }

    let mut msg = Vec::new();
    msg.push(b'l'); // little-endian
    msg.push(msg_type);
    msg.push(flags);
    msg.push(1); // protocol version
    msg.extend_from_slice(&(body.len() as u32).to_le_bytes());
    msg.extend_from_slice(&serial.to_le_bytes());
    // header fields array length + data
    msg.extend_from_slice(&(hdr_fields.len() as u32).to_le_bytes());
    msg.extend_from_slice(&hdr_fields);
    dbus_align(&mut msg, 8);
    msg.extend_from_slice(body);
    msg
}

pub(crate) fn build_method_call(
    serial: u32, dest: &str, path: &str, iface: &str, member: &str,
    body_sig: &str, body: &[u8], n_fds: u32,
) -> Vec<u8> {
    let fd = field_string(dest);
    let fp = field_objpath(path);
    let fi = field_string(iface);
    let fm = field_string(member);
    dbus_build_msg(1, serial, 0, &[
        (6, &fd), (1, &fp), (2, &fi), (3, &fm),
    ], body, body_sig, n_fds)
}

// ── a{sv} dict builder ────────────────────────────────────────────────

pub(crate) fn build_asv(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut inner = Vec::new();
    for &(key, variant_bytes) in entries {
        dbus_align(&mut inner, 8); // dict entry alignment
        dbus_string(&mut inner, key);
        inner.extend_from_slice(variant_bytes);
    }
    let mut buf = Vec::new();
    dbus_u32(&mut buf, inner.len() as u32);
    buf.extend_from_slice(&inner);
    buf
}

pub(crate) fn variant_string_bytes(s: &str) -> Vec<u8> {
    let mut v = Vec::new();
    dbus_variant_string(&mut v, s);
    v
}

pub(crate) fn variant_u32_bytes(val: u32) -> Vec<u8> {
    let mut v = Vec::new();
    dbus_variant_u32(&mut v, val);
    v
}

// ── D-Bus connection ──────────────────────────────────────────────────

pub(crate) struct DBusConn {
    pub(crate) fd: RawFd,
    pub(crate) serial: u32,
    pub(crate) unique_name: String,
}

impl DBusConn {
    pub(crate) fn next_serial(&mut self) -> u32 {
        self.serial += 1;
        self.serial
    }
}

fn session_bus_path() -> Option<String> {
    if let Ok(addr) = std::env::var("DBUS_SESSION_BUS_ADDRESS") {
        // unix:path=/run/user/1000/bus or unix:abstract=...
        for part in addr.split(';') {
            if let Some(rest) = part.strip_prefix("unix:") {
                for kv in rest.split(',') {
                    if let Some(path) = kv.strip_prefix("path=") {
                        return Some(path.to_string());
                    }
                }
            }
        }
    }
    let uid = unsafe { libc::getuid() };
    let path = format!("/run/user/{}/bus", uid);
    if std::path::Path::new(&path).exists() {
        return Some(path);
    }
    None
}

pub(crate) unsafe fn sock_write_all(fd: RawFd, data: &[u8]) -> bool {
    let mut written = 0;
    while written < data.len() {
        let n = libc::write(fd, data[written..].as_ptr() as *const c_void,
                            data.len() - written);
        if n <= 0 { return false; }
        written += n as usize;
    }
    true
}

unsafe fn sock_read(fd: RawFd, buf: &mut [u8]) -> isize {
    libc::read(fd, buf.as_mut_ptr() as *mut c_void, buf.len())
}

unsafe fn sock_read_exact(fd: RawFd, buf: &mut [u8]) -> bool {
    let mut done = 0;
    while done < buf.len() {
        let n = libc::read(fd, buf[done..].as_mut_ptr() as *mut c_void,
                           buf.len() - done);
        if n <= 0 { return false; }
        done += n as usize;
    }
    true
}

pub(crate) unsafe fn dbus_connect() -> Option<DBusConn> {
    let bus_path = session_bus_path()?;

    let fd = libc::socket(libc::AF_UNIX, libc::SOCK_STREAM, 0);
    if fd < 0 { return None; }

    let mut addr: libc::sockaddr_un = std::mem::zeroed();
    addr.sun_family = libc::AF_UNIX as u16;
    let path_bytes = bus_path.as_bytes();
    if path_bytes.len() >= addr.sun_path.len() {
        libc::close(fd);
        return None;
    }
    std::ptr::copy_nonoverlapping(
        path_bytes.as_ptr(), addr.sun_path.as_mut_ptr() as *mut u8, path_bytes.len(),
    );

    if libc::connect(fd, &addr as *const _ as *const libc::sockaddr,
                     std::mem::size_of::<libc::sockaddr_un>() as u32) != 0 {
        libc::close(fd);
        return None;
    }

    // AUTH EXTERNAL
    let uid = libc::getuid();
    let uid_str = format!("{}", uid);
    let hex_uid: String = uid_str.bytes().map(|b| format!("{:02x}", b)).collect();
    let auth = format!("\0AUTH EXTERNAL {}\r\n", hex_uid);
    if !sock_write_all(fd, auth.as_bytes()) {
        libc::close(fd);
        return None;
    }

    // Read OK line
    let mut line_buf = [0u8; 256];
    let mut line_len = 0usize;
    loop {
        let n = sock_read(fd, &mut line_buf[line_len..line_len + 1]);
        if n <= 0 { libc::close(fd); return None; }
        line_len += 1;
        if line_len >= 2 && line_buf[line_len - 2] == b'\r' && line_buf[line_len - 1] == b'\n' {
            break;
        }
        if line_len >= line_buf.len() - 1 { libc::close(fd); return None; }
    }
    if !line_buf[..line_len].starts_with(b"OK") {
        libc::close(fd);
        return None;
    }

    // Negotiate UNIX_FD
    if !sock_write_all(fd, b"NEGOTIATE_UNIX_FD\r\n") {
        libc::close(fd);
        return None;
    }
    line_len = 0;
    loop {
        let n = sock_read(fd, &mut line_buf[line_len..line_len + 1]);
        if n <= 0 { libc::close(fd); return None; }
        line_len += 1;
        if line_len >= 2 && line_buf[line_len - 2] == b'\r' && line_buf[line_len - 1] == b'\n' {
            break;
        }
        if line_len >= line_buf.len() - 1 { break; }
    }
    // AGREE_UNIX_FD or ignore
    if !sock_write_all(fd, b"BEGIN\r\n") {
        libc::close(fd);
        return None;
    }

    // Send Hello, get unique name
    let hello = build_method_call(
        1, "org.freedesktop.DBus", "/org/freedesktop/DBus",
        "org.freedesktop.DBus", "Hello", "", &[], 0,
    );
    if !sock_write_all(fd, &hello) {
        libc::close(fd);
        return None;
    }

    let (reply, _) = recv_dbus_msg(fd)?;
    // Parse reply to get unique name (method_return, body has one string)
    let (_, body_offset, body_len) = parse_msg_header(&reply)?;
    let body = &reply[body_offset..body_offset + body_len];
    let mut pos = 0;
    let unique_name = rd_string(body, &mut pos);

    Some(DBusConn { fd, serial: 1, unique_name })
}

// ── Message receiving (with fd passing) ───────────────────────────────

pub(crate) unsafe fn recv_dbus_msg(fd: RawFd) -> Option<(Vec<u8>, Vec<RawFd>)> {
    // Read fixed header (16 bytes: endian, type, flags, ver, body_len, serial, fields_array_len)
    let mut hdr = [0u8; 16];
    if !sock_read_exact(fd, &mut hdr) { return None; }

    let body_len = u32::from_le_bytes([hdr[4], hdr[5], hdr[6], hdr[7]]) as usize;
    let fields_len = u32::from_le_bytes([hdr[12], hdr[13], hdr[14], hdr[15]]) as usize;
    // Fields array is followed by padding to 8-byte boundary
    let fields_padded = (fields_len + 7) & !7;
    let remaining = fields_padded + body_len;

    let mut rest = vec![0u8; remaining];
    // Use recvmsg for the rest to capture SCM_RIGHTS fds
    let mut iov = libc::iovec {
        iov_base: rest.as_mut_ptr() as *mut c_void,
        iov_len: remaining,
    };
    let mut cmsg_buf = [0u8; 64]; // enough for a few fds
    let mut msg: libc::msghdr = std::mem::zeroed();
    msg.msg_iov = &mut iov;
    msg.msg_iovlen = 1;
    msg.msg_control = cmsg_buf.as_mut_ptr() as *mut c_void;
    msg.msg_controllen = cmsg_buf.len();

    let mut total_read = 0usize;
    let mut fds = Vec::new();
    while total_read < remaining {
        (*msg.msg_iov).iov_base = rest[total_read..].as_mut_ptr() as *mut c_void;
        (*msg.msg_iov).iov_len = remaining - total_read;
        msg.msg_control = cmsg_buf.as_mut_ptr() as *mut c_void;
        msg.msg_controllen = cmsg_buf.len();

        let n = libc::recvmsg(fd, &mut msg, 0);
        if n <= 0 { return None; }
        total_read += n as usize;

        // Extract fds from ancillary data
        let mut cmsg = libc::CMSG_FIRSTHDR(&msg);
        while !cmsg.is_null() {
            if (*cmsg).cmsg_level == libc::SOL_SOCKET
                && (*cmsg).cmsg_type == libc::SCM_RIGHTS
            {
                let data_ptr = libc::CMSG_DATA(cmsg);
                let data_len = (*cmsg).cmsg_len - libc::CMSG_LEN(0) as usize;
                let n_fds = data_len / std::mem::size_of::<RawFd>();
                for i in 0..n_fds {
                    let fd_ptr = data_ptr.add(i * std::mem::size_of::<RawFd>()) as *const RawFd;
                    fds.push(std::ptr::read_unaligned(fd_ptr));
                }
            }
            cmsg = libc::CMSG_NXTHDR(&msg, cmsg);
        }
    }

    let mut full = Vec::with_capacity(16 + remaining);
    full.extend_from_slice(&hdr);
    full.extend_from_slice(&rest);
    Some((full, fds))
}

pub(crate) fn parse_msg_header(msg: &[u8]) -> Option<(u8, usize, usize)> {
    if msg.len() < 16 { return None; }
    let msg_type = msg[1];
    let body_len = u32::from_le_bytes([msg[4], msg[5], msg[6], msg[7]]) as usize;
    let fields_len = u32::from_le_bytes([msg[12], msg[13], msg[14], msg[15]]) as usize;
    let fields_padded = (fields_len + 7) & !7;
    let body_offset = 16 + fields_padded;
    Some((msg_type, body_offset, body_len))
}

fn get_header_field_string(msg: &[u8], field_code: u8) -> Option<String> {
    if msg.len() < 16 { return None; }
    let fields_len = u32::from_le_bytes([msg[12], msg[13], msg[14], msg[15]]) as usize;
    let fields_end = 16 + fields_len;
    let mut pos = 16usize;
    while pos < fields_end {
        rd_align(&mut pos, 8);
        if pos >= fields_end { break; }
        let code = msg[pos];
        pos += 1;
        let sig = rd_signature(msg, &mut pos);
        if code == field_code && (sig == "s" || sig == "o") {
            return Some(rd_string(msg, &mut pos));
        }
        // Skip value based on signature
        skip_dbus_value(msg, &mut pos, &sig);
    }
    None
}

pub(crate) fn skip_dbus_value(buf: &[u8], pos: &mut usize, sig: &str) {
    for ch in sig.chars() {
        match ch {
            's' | 'o' => { rd_string(buf, pos); }
            'u' | 'i' | 'b' => { rd_u32(buf, pos); }
            'g' => { rd_signature(buf, pos); }
            _ => { *pos = buf.len(); } // bail
        }
    }
}

// ── Portal session negotiation ────────────────────────────────────────

const PORTAL_DEST: &str = "org.freedesktop.portal.Desktop";
const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
const RD_IFACE: &str = "org.freedesktop.portal.RemoteDesktop";

pub(crate) fn request_path(unique_name: &str, token: &str) -> String {
    let sender = unique_name.replace('.', "_").replace(':', "");
    format!("/org/freedesktop/portal/desktop/request/{}/{}", sender, token)
}

pub(crate) unsafe fn add_match(conn: &mut DBusConn, rule: &str) {
    let mut body = Vec::new();
    dbus_string(&mut body, rule);
    let serial = conn.next_serial();
    let msg = build_method_call(
        serial, "org.freedesktop.DBus", "/org/freedesktop/DBus",
        "org.freedesktop.DBus", "AddMatch", "s", &body, 0,
    );
    sock_write_all(conn.fd, &msg);
}

pub(crate) unsafe fn wait_for_response(conn: &mut DBusConn, req_path: &str) -> Option<Vec<u8>> {
    // Loop receiving messages until we get a Response signal on req_path
    for _ in 0..200 {
        let (msg, _fds) = recv_dbus_msg(conn.fd)?;
        let (msg_type, body_offset, body_len) = parse_msg_header(&msg)?;
        if msg_type != 4 { continue; } // not a signal

        let path = get_header_field_string(&msg, 1); // PATH
        let member = get_header_field_string(&msg, 3); // MEMBER
        if path.as_deref() != Some(req_path) { continue; }
        if member.as_deref() != Some("Response") { continue; }

        let body = msg[body_offset..body_offset + body_len].to_vec();
        return Some(body);
    }
    None
}

pub(crate) fn extract_session_handle(response_body: &[u8]) -> Option<String> {
    let mut pos = 0;
    let response_code = rd_u32(response_body, &mut pos);
    if response_code != 0 { return None; }
    // a{sv} results dict — find "session_handle"
    let array_len = rd_u32(response_body, &mut pos) as usize;
    let array_end = pos + array_len;
    while pos < array_end {
        rd_align(&mut pos, 8);
        let key = rd_string(response_body, &mut pos);
        let sig = rd_signature(response_body, &mut pos);
        if key == "session_handle" && sig == "s" {
            return Some(rd_string(response_body, &mut pos));
        }
        skip_dbus_value(response_body, &mut pos, &sig);
    }
    None
}

unsafe fn portal_call(
    conn: &mut DBusConn, method: &str, sig: &str, body: &[u8], token: &str,
) -> Option<Vec<u8>> {
    let req = request_path(&conn.unique_name, token);
    let rule = format!(
        "type='signal',sender='{}',interface='org.freedesktop.portal.Request',member='Response',path='{}'",
        PORTAL_DEST, req
    );
    add_match(conn, &rule);
    let serial = conn.next_serial();
    let msg = build_method_call(serial, PORTAL_DEST, PORTAL_PATH, RD_IFACE, method, sig, body, 0);
    sock_write_all(conn.fd, &msg);
    recv_dbus_msg(conn.fd);
    wait_for_response(conn, &req)
}

pub unsafe fn portal_get_eis_fd() -> Option<RawFd> {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    let mut conn = dbus_connect()?;
    let pid = libc::getpid();
    let cnt = COUNTER.fetch_add(1, Ordering::Relaxed) + 1;

    // CreateSession
    let token1 = format!("mechatron_{}_{}_cs", pid, cnt);
    let session_token = format!("mechatron_{}_{}_s", pid, cnt);
    let ht = variant_string_bytes(&token1);
    let st = variant_string_bytes(&session_token);
    let body1 = build_asv(&[("handle_token", &ht), ("session_handle_token", &st)]);
    let resp1 = portal_call(&mut conn, "CreateSession", "a{sv}", &body1, &token1)?;
    let session_path = extract_session_handle(&resp1)?;

    // SelectDevices (types: 3 = keyboard + pointer)
    let token2 = format!("mechatron_{}_{}_sd", pid, cnt);
    let ht2 = variant_string_bytes(&token2);
    let types_v = variant_u32_bytes(3);
    let mut body2 = Vec::new();
    dbus_object_path(&mut body2, &session_path);
    let opts2 = build_asv(&[("handle_token", &ht2), ("types", &types_v)]);
    body2.extend_from_slice(&opts2);
    let resp2 = portal_call(&mut conn, "SelectDevices", "oa{sv}", &body2, &token2)?;
    let mut p2 = 0;
    if rd_u32(&resp2, &mut p2) != 0 { return None; }

    // Start
    let token3 = format!("mechatron_{}_{}_st", pid, cnt);
    let ht3 = variant_string_bytes(&token3);
    let mut body3 = Vec::new();
    dbus_object_path(&mut body3, &session_path);
    dbus_string(&mut body3, "");
    let opts3 = build_asv(&[("handle_token", &ht3)]);
    body3.extend_from_slice(&opts3);
    let resp3 = portal_call(&mut conn, "Start", "osa{sv}", &body3, &token3)?;
    let mut p3 = 0;
    if rd_u32(&resp3, &mut p3) != 0 { return None; }

    // ConnectToEIS — returns fd directly
    let mut body4 = Vec::new();
    dbus_object_path(&mut body4, &session_path);
    let opts4 = build_asv(&[]);
    body4.extend_from_slice(&opts4);
    let serial4 = conn.next_serial();
    let msg4 = build_method_call(
        serial4, PORTAL_DEST, PORTAL_PATH, RD_IFACE, "ConnectToEIS",
        "oa{sv}", &body4, 0,
    );
    sock_write_all(conn.fd, &msg4);
    let (reply, fds) = recv_dbus_msg(conn.fd)?;
    let (rtype, _, _) = parse_msg_header(&reply)?;
    if rtype != 2 { return None; } // not method_return

    // The fd comes in the ancillary data
    if fds.is_empty() { return None; }

    // Don't close the D-Bus connection fd — session stays alive
    // Leak conn.fd intentionally (portal session must remain open)
    std::mem::forget(conn);

    Some(fds[0])
}
