#![allow(non_upper_case_globals, dead_code)]

use std::sync::Mutex;

#[path = "screencast_portal.rs"]
mod screencast_portal;

#[path = "pw_capture.rs"]
mod pw_capture;

use screencast_portal::ScreenCastSession;

struct ScreenCastState {
    session: Option<ScreenCastSession>,
    pending_token: Option<String>,
    init_tried: bool,
}

static STATE: Mutex<Option<ScreenCastState>> = Mutex::new(None);

fn with_state<T>(f: impl FnOnce(&mut ScreenCastState) -> T) -> T {
    let mut guard = STATE.lock().unwrap();
    if guard.is_none() {
        *guard = Some(ScreenCastState { session: None, pending_token: None, init_tried: false });
    }
    f(guard.as_mut().unwrap())
}

fn ensure_session() -> bool {
    with_state(|state| {
        if state.session.is_some() { return true; }
        if state.init_tried { return false; }
        state.init_tried = true;

        let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok()
            || std::env::var("XDG_SESSION_TYPE").ok().map_or(false, |v| v == "wayland");
        if !is_wayland { return false; }

        let token = state.pending_token.as_deref();
        let session = unsafe { screencast_portal::portal_screencast_start(token) };
        if let Some(s) = session {
            state.session = Some(s);
            true
        } else {
            false
        }
    })
}

pub fn is_available() -> bool {
    ensure_session()
}

pub fn grab_frame(x: i32, y: i32, w: i32, h: i32) -> Option<Vec<u32>> {
    if !ensure_session() { return None; }

    let (pw_fd, node_id) = with_state(|state| {
        let s = state.session.as_ref()?;
        Some((s.pw_fd, s.node_id))
    })?;

    let (full_pixels, fw, fh) = unsafe { pw_capture::pw_grab_frame(pw_fd, node_id)? };

    if x == 0 && y == 0 && w as u32 == fw && h as u32 == fh {
        return Some(full_pixels);
    }

    // Crop to requested region
    let fw = fw as i32;
    let fh = fh as i32;
    let cx = x.max(0).min(fw);
    let cy = y.max(0).min(fh);
    let cw = w.min(fw - cx).max(0);
    let ch = h.min(fh - cy).max(0);
    if cw <= 0 || ch <= 0 { return None; }

    let mut cropped = vec![0u32; (cw * ch) as usize];
    for row in 0..ch {
        let src_off = ((cy + row) * fw + cx) as usize;
        let dst_off = (row * cw) as usize;
        cropped[dst_off..dst_off + cw as usize]
            .copy_from_slice(&full_pixels[src_off..src_off + cw as usize]);
    }
    Some(cropped)
}

pub fn get_monitors() -> Option<Vec<(i32, i32, u32, u32)>> {
    if !ensure_session() { return None; }
    with_state(|state| {
        let s = state.session.as_ref()?;
        Some(vec![(0, 0, s.width, s.height)])
    })
}

pub fn get_token() -> Option<String> {
    with_state(|state| {
        state.session.as_ref()?.restore_token.clone()
    })
}

pub fn set_token(token: String) {
    with_state(|state| {
        state.pending_token = Some(token);
    });
}
