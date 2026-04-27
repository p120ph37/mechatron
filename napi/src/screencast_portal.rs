#![allow(non_upper_case_globals, dead_code)]

use std::os::unix::io::RawFd;

#[path = "dbus_portal.rs"]
mod dbus_portal;

const SC_IFACE: &str = "org.freedesktop.portal.ScreenCast";
const PORTAL_DEST: &str = "org.freedesktop.portal.Desktop";
const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";

pub struct ScreenCastSession {
    pub pw_fd: RawFd,
    pub node_id: u32,
    pub width: u32,
    pub height: u32,
    pub restore_token: Option<String>,
}

unsafe fn sc_portal_call(
    conn: &mut dbus_portal::DBusConn, method: &str, sig: &str, body: &[u8], token: &str,
) -> Option<Vec<u8>> {
    let req = dbus_portal::request_path(&conn.unique_name, token);
    let rule = format!(
        "type='signal',sender='{}',interface='org.freedesktop.portal.Request',member='Response',path='{}'",
        PORTAL_DEST, req
    );
    dbus_portal::add_match(conn, &rule);
    let serial = conn.next_serial();
    let msg = dbus_portal::build_method_call(serial, PORTAL_DEST, PORTAL_PATH, SC_IFACE, method, sig, body, 0);
    dbus_portal::sock_write_all(conn.fd, &msg);
    dbus_portal::recv_dbus_msg(conn.fd);
    dbus_portal::wait_for_response(conn, &req)
}

fn parse_start_response(body: &[u8]) -> Option<(u32, u32, u32, Option<String>)> {
    let mut pos = 0;
    if dbus_portal::rd_u32(body, &mut pos) != 0 { return None; }
    let array_len = dbus_portal::rd_u32(body, &mut pos) as usize;
    let array_end = pos + array_len;
    let (mut node_id, mut width, mut height) = (0u32, 1920u32, 1080u32);
    let mut restore_token: Option<String> = None;
    while pos < array_end {
        dbus_portal::rd_align(&mut pos, 8);
        if pos >= array_end { break; }
        let key = dbus_portal::rd_string(body, &mut pos);
        let sig = dbus_portal::rd_signature(body, &mut pos);
        if key == "restore_token" && sig == "s" {
            let tok = dbus_portal::rd_string(body, &mut pos);
            if !tok.is_empty() { restore_token = Some(tok); }
        } else if key == "streams" {
            let streams_len = dbus_portal::rd_u32(body, &mut pos) as usize;
            let streams_end = pos + streams_len;
            if pos < streams_end {
                dbus_portal::rd_align(&mut pos, 8);
                node_id = dbus_portal::rd_u32(body, &mut pos);
                let inner_len = dbus_portal::rd_u32(body, &mut pos) as usize;
                let inner_end = pos + inner_len;
                while pos < inner_end {
                    dbus_portal::rd_align(&mut pos, 8);
                    if pos >= inner_end { break; }
                    let k = dbus_portal::rd_string(body, &mut pos);
                    let s = dbus_portal::rd_signature(body, &mut pos);
                    if k == "size" && s == "(ii)" {
                        dbus_portal::rd_align(&mut pos, 8);
                        width = dbus_portal::rd_u32(body, &mut pos);
                        height = dbus_portal::rd_u32(body, &mut pos);
                    } else {
                        dbus_portal::skip_dbus_value(body, &mut pos, &s);
                    }
                }
            }
            pos = streams_end;
        } else {
            dbus_portal::skip_dbus_value(body, &mut pos, &sig);
        }
    }
    if node_id == 0 { return None; }
    Some((node_id, width, height, restore_token))
}

pub unsafe fn portal_screencast_start(restore_token: Option<&str>) -> Option<ScreenCastSession> {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    let mut conn = dbus_portal::dbus_connect()?;
    let pid = libc::getpid();
    let cnt = COUNTER.fetch_add(1, Ordering::Relaxed) + 1;

    // CreateSession
    let tok1 = format!("mechatron_{}_{}_scs", pid, cnt);
    let sess_tok = format!("mechatron_{}_{}_ss", pid, cnt);
    let ht1 = dbus_portal::variant_string_bytes(&tok1);
    let st1 = dbus_portal::variant_string_bytes(&sess_tok);
    let body1 = dbus_portal::build_asv(&[("handle_token", &ht1), ("session_handle_token", &st1)]);
    let resp1 = sc_portal_call(&mut conn, "CreateSession", "a{sv}", &body1, &tok1)?;
    let session_path = dbus_portal::extract_session_handle(&resp1)?;

    // SelectSources (types=1 MONITOR, persist_mode=2)
    let tok2 = format!("mechatron_{}_{}_ss2", pid, cnt);
    let ht2 = dbus_portal::variant_string_bytes(&tok2);
    let types_v = dbus_portal::variant_u32_bytes(1);
    let persist_v = dbus_portal::variant_u32_bytes(2);
    let mut entries: Vec<(&str, &[u8])> = vec![
        ("handle_token", &ht2), ("types", &types_v), ("persist_mode", &persist_v),
    ];
    let rt_v;
    if let Some(rt) = restore_token {
        rt_v = dbus_portal::variant_string_bytes(rt);
        entries.push(("restore_token", &rt_v));
    }
    let mut body2 = Vec::new();
    dbus_portal::dbus_object_path(&mut body2, &session_path);
    body2.extend_from_slice(&dbus_portal::build_asv(&entries));
    let resp2 = sc_portal_call(&mut conn, "SelectSources", "oa{sv}", &body2, &tok2)?;
    let mut p2 = 0;
    if dbus_portal::rd_u32(&resp2, &mut p2) != 0 { return None; }

    // Start
    let tok3 = format!("mechatron_{}_{}_st", pid, cnt);
    let ht3 = dbus_portal::variant_string_bytes(&tok3);
    let mut body3 = Vec::new();
    dbus_portal::dbus_object_path(&mut body3, &session_path);
    dbus_portal::dbus_string(&mut body3, "");
    body3.extend_from_slice(&dbus_portal::build_asv(&[("handle_token", &ht3)]));
    let resp3 = sc_portal_call(&mut conn, "Start", "osa{sv}", &body3, &tok3)?;
    let (node_id, width, height, restore_token) = parse_start_response(&resp3)?;

    // OpenPipeWireRemote — direct method return with fd via SCM_RIGHTS
    let mut body4 = Vec::new();
    dbus_portal::dbus_object_path(&mut body4, &session_path);
    body4.extend_from_slice(&dbus_portal::build_asv(&[]));
    let serial4 = conn.next_serial();
    let msg4 = dbus_portal::build_method_call(
        serial4, PORTAL_DEST, PORTAL_PATH, SC_IFACE, "OpenPipeWireRemote", "oa{sv}", &body4, 0,
    );
    dbus_portal::sock_write_all(conn.fd, &msg4);
    let (reply, fds) = dbus_portal::recv_dbus_msg(conn.fd)?;
    let (rtype, _, _) = dbus_portal::parse_msg_header(&reply)?;
    if rtype != 2 || fds.is_empty() { return None; }

    std::mem::forget(conn);
    Some(ScreenCastSession { pw_fd: fds[0], node_id, width, height, restore_token })
}
