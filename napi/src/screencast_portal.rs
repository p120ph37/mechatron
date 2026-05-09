#![allow(non_upper_case_globals, dead_code)]

use std::os::unix::io::RawFd;

#[path = "dbus_portal.rs"]
mod dbus_portal;

use dbus_portal::AsvEntry;

const SC_IFACE: &str = "org.freedesktop.portal.ScreenCast";

pub struct ScreenCastSession {
    pub pw_fd: RawFd,
    pub node_id: u32,
    pub width: u32,
    pub height: u32,
    pub restore_token: Option<String>,
}

unsafe fn parse_start_response(resp: &dbus_portal::ResponseData) -> Option<(u32, u32, u32, Option<String>)> {
    if resp.code != 0 { return None; }

    let mut results_iter = resp.results_iter()?;
    // results_iter points at the a{sv} dict — recurse into the array
    let mut arr = dbus_portal::iter_recurse(&mut results_iter)?;

    let (mut node_id, mut width, mut height) = (0u32, 1920u32, 1080u32);
    let mut restore_token: Option<String> = None;

    loop {
        let t = dbus_portal::iter_arg_type(&mut arr);
        if t == 0 { break; } // DBUS_TYPE_INVALID

        // Each element is a dict entry {sv}
        let mut entry = dbus_portal::iter_recurse(&mut arr)?;
        let key = dbus_portal::iter_get_string(&mut entry)?;
        dbus_portal::iter_next(&mut entry);
        // entry is now at the variant 'v'

        if key == "restore_token" {
            let mut variant = dbus_portal::iter_recurse(&mut entry)?;
            if let Some(tok) = dbus_portal::iter_get_string(&mut variant) {
                if !tok.is_empty() {
                    restore_token = Some(tok);
                }
            }
        } else if key == "streams" {
            // variant contains a(ua{sv})
            let mut variant = dbus_portal::iter_recurse(&mut entry)?;
            // variant points at the array a(ua{sv})
            let mut streams_arr = dbus_portal::iter_recurse(&mut variant)?;
            // Read the first stream struct (ua{sv})
            let t = dbus_portal::iter_arg_type(&mut streams_arr);
            if t != 0 {
                // recurse into the struct
                let mut stream_struct = dbus_portal::iter_recurse(&mut streams_arr)?;
                // first element: node_id (uint32)
                if let Some(nid) = dbus_portal::iter_get_u32(&mut stream_struct) {
                    node_id = nid;
                }
                dbus_portal::iter_next(&mut stream_struct);
                // second element: a{sv} properties
                let mut props_arr = dbus_portal::iter_recurse(&mut stream_struct)?;
                loop {
                    let pt = dbus_portal::iter_arg_type(&mut props_arr);
                    if pt == 0 { break; }
                    let mut pentry = dbus_portal::iter_recurse(&mut props_arr)?;
                    let pkey = dbus_portal::iter_get_string(&mut pentry).unwrap_or_default();
                    dbus_portal::iter_next(&mut pentry);
                    if pkey == "size" {
                        // variant contains (ii)
                        let mut pvariant = dbus_portal::iter_recurse(&mut pentry)?;
                        let mut pstruct = dbus_portal::iter_recurse(&mut pvariant)?;
                        if let Some(w) = dbus_portal::iter_get_i32(&mut pstruct) {
                            width = w as u32;
                        }
                        dbus_portal::iter_next(&mut pstruct);
                        if let Some(h) = dbus_portal::iter_get_i32(&mut pstruct) {
                            height = h as u32;
                        }
                    }
                    dbus_portal::iter_next(&mut props_arr);
                }
            }
        }
        dbus_portal::iter_next(&mut arr);
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
    let tok1_clone = tok1.clone();
    let sess_tok_clone = sess_tok.clone();
    let resp1 = dbus_portal::portal_call(&mut conn, SC_IFACE, "CreateSession", &tok1, |iter| {
        dbus_portal::iter_append_asv(iter, &[
            AsvEntry::Str("handle_token", &tok1_clone),
            AsvEntry::Str("session_handle_token", &sess_tok_clone),
        ]);
    })?;
    let session_path = dbus_portal::extract_session_handle(&resp1)?;
    dbus_portal::response_data_free(resp1);

    // SelectSources (types=1 MONITOR, persist_mode=2)
    let tok2 = format!("mechatron_{}_{}_ss2", pid, cnt);
    let tok2_clone = tok2.clone();
    let session_path_clone = session_path.clone();
    let rt_owned: Option<String> = restore_token.map(|s| s.to_string());
    let resp2 = dbus_portal::portal_call(&mut conn, SC_IFACE, "SelectSources", &tok2, |iter| {
        dbus_portal::iter_append_object_path(iter, &session_path_clone);
        let mut entries: Vec<AsvEntry> = vec![
            AsvEntry::Str("handle_token", &tok2_clone),
            AsvEntry::U32("types", 1),
            AsvEntry::U32("persist_mode", 2),
        ];
        if let Some(ref rt) = rt_owned {
            entries.push(AsvEntry::Str("restore_token", rt));
        }
        dbus_portal::iter_append_asv(iter, &entries);
    })?;
    if resp2.code != 0 {
        dbus_portal::response_data_free(resp2);
        return None;
    }
    dbus_portal::response_data_free(resp2);

    // Start
    let tok3 = format!("mechatron_{}_{}_st", pid, cnt);
    let tok3_clone = tok3.clone();
    let session_path_clone = session_path.clone();
    let resp3 = dbus_portal::portal_call(&mut conn, SC_IFACE, "Start", &tok3, |iter| {
        dbus_portal::iter_append_object_path(iter, &session_path_clone);
        dbus_portal::iter_append_string(iter, ""); // parent_window
        dbus_portal::iter_append_asv(iter, &[
            AsvEntry::Str("handle_token", &tok3_clone),
        ]);
    })?;
    let (node_id, width, height, new_restore_token) = parse_start_response(&resp3)?;
    dbus_portal::response_data_free(resp3);

    // OpenPipeWireRemote — blocking method call, fd in reply
    let session_path_clone = session_path.clone();
    let reply = dbus_portal::call_method(
        &mut conn,
        dbus_portal::PORTAL_DEST,
        dbus_portal::PORTAL_PATH,
        SC_IFACE,
        "OpenPipeWireRemote",
        |iter| {
            dbus_portal::iter_append_object_path(iter, &session_path_clone);
            dbus_portal::iter_append_asv(iter, &[]);
        },
    )?;

    let mut iter = dbus_portal::msg_iter_init(reply)?;
    let fd = dbus_portal::iter_get_fd(&mut iter);
    dbus_portal::msg_unref(reply);
    let pw_fd = fd?;

    std::mem::forget(conn);
    Some(ScreenCastSession { pw_fd, node_id, width, height, restore_token: new_restore_token })
}
