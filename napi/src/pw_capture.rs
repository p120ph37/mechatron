#![allow(non_upper_case_globals, dead_code)]

use std::ffi::{c_char, c_void};
use std::os::unix::io::RawFd;

#[path = "pw.rs"]
mod pw;
use pw::*;

struct GrabCtx {
    loop_: *mut c_void,
    stream: *mut c_void,
    frame: Option<(Vec<u32>, u32, u32)>,
    negotiated_format: u32,
}

unsafe extern "C" fn on_param_changed(data: *mut c_void, id: u32, param: *const c_void) {
    if param.is_null() || id != SPA_PARAM_Format { return; }
    let ctx = &mut *(data as *mut GrabCtx);
    let pod_ptr = param as *const u8;
    let size = u32::from_le_bytes([*pod_ptr, *pod_ptr.add(1), *pod_ptr.add(2), *pod_ptr.add(3)]) as usize;
    let body = std::slice::from_raw_parts(pod_ptr.add(8), size);
    let mut pos = 8usize;
    while pos + 16 <= body.len() {
        let key = u32::from_le_bytes([body[pos], body[pos+1], body[pos+2], body[pos+3]]);
        pos += 8;
        if pos + 8 > body.len() { break; }
        let child_size = u32::from_le_bytes([body[pos], body[pos+1], body[pos+2], body[pos+3]]) as usize;
        let child_type = u32::from_le_bytes([body[pos+4], body[pos+5], body[pos+6], body[pos+7]]);
        if key == SPA_FORMAT_VIDEO_format && child_type == SPA_TYPE_Id && child_size == 4 && pos + 12 <= body.len() {
            ctx.negotiated_format = u32::from_le_bytes([body[pos+8], body[pos+9], body[pos+10], body[pos+11]]);
            break;
        }
        pos += 8 + ((child_size + 7) & !7);
    }
}

unsafe extern "C" fn on_process(data: *mut c_void) {
    let ctx = &mut *(data as *mut GrabCtx);
    let buf = pw_stream_dequeue_buffer(ctx.stream);
    if buf.is_null() { return; }

    let spa_buf = &*(*buf).buffer;
    if spa_buf.n_datas == 0 || spa_buf.datas.is_null() {
        pw_stream_queue_buffer(ctx.stream, buf);
        return;
    }

    let d = &*spa_buf.datas;
    if d.data.is_null() || d.chunk.is_null() {
        pw_stream_queue_buffer(ctx.stream, buf);
        return;
    }

    let chunk = &*d.chunk;
    let stride = chunk.stride as usize;
    if stride == 0 {
        pw_stream_queue_buffer(ctx.stream, buf);
        return;
    }

    let data_ptr = (d.data as *const u8).add(chunk.offset as usize);
    let h = chunk.size as usize / stride;
    let w = stride / 4;
    if w == 0 || h == 0 {
        pw_stream_queue_buffer(ctx.stream, buf);
        return;
    }

    let needed = w * h * 4;
    if chunk.offset as usize + needed > d.maxsize as usize {
        pw_stream_queue_buffer(ctx.stream, buf);
        return;
    }
    let src = std::slice::from_raw_parts(data_ptr as *const u32, w * h);
    let pixels = convert_to_argb(src, w, h, ctx.negotiated_format);
    ctx.frame = Some((pixels, w as u32, h as u32));

    pw_stream_queue_buffer(ctx.stream, buf);
    pw_main_loop_quit(ctx.loop_);
}

unsafe extern "C" fn on_state_changed(data: *mut c_void, _old: i32, state: i32, _err: *const c_char) {
    let ctx = &*(data as *mut GrabCtx);
    if state == PW_STREAM_STATE_ERROR {
        pw_main_loop_quit(ctx.loop_);
    }
}

fn convert_to_argb(src: &[u32], w: usize, h: usize, format: u32) -> Vec<u32> {
    let len = w * h;
    match format {
        SPA_VIDEO_FORMAT_BGRx => {
            let mut out = vec![0u32; len];
            for i in 0..len { out[i] = src[i] | 0xFF000000; }
            out
        }
        SPA_VIDEO_FORMAT_BGRA => {
            src[..len].to_vec()
        }
        SPA_VIDEO_FORMAT_ARGB => {
            let mut out = vec![0u32; len];
            for i in 0..len { out[i] = src[i].swap_bytes(); }
            out
        }
        SPA_VIDEO_FORMAT_RGBx | SPA_VIDEO_FORMAT_RGBA => {
            let mut out = vec![0u32; len];
            for i in 0..len {
                let p = src[i];
                let r = p & 0xFF;
                let g = (p >> 8) & 0xFF;
                let b = (p >> 16) & 0xFF;
                let a = if format == SPA_VIDEO_FORMAT_RGBx { 0xFF } else { (p >> 24) & 0xFF };
                out[i] = (a << 24) | (r << 16) | (g << 8) | b;
            }
            out
        }
        SPA_VIDEO_FORMAT_xRGB => {
            let mut out = vec![0u32; len];
            for i in 0..len {
                let p = src[i];
                let r = (p >> 8) & 0xFF;
                let g = (p >> 16) & 0xFF;
                let b = (p >> 24) & 0xFF;
                out[i] = 0xFF000000 | (r << 16) | (g << 8) | b;
            }
            out
        }
        SPA_VIDEO_FORMAT_xBGR => {
            let mut out = vec![0u32; len];
            for i in 0..len {
                let p = src[i];
                let r = (p >> 24) & 0xFF;
                let g = (p >> 16) & 0xFF;
                let b = (p >> 8) & 0xFF;
                out[i] = 0xFF000000 | (r << 16) | (g << 8) | b;
            }
            out
        }
        _ => {
            let mut out = vec![0u32; len];
            for i in 0..len { out[i] = src[i] | 0xFF000000; }
            out
        }
    }
}

/// Grab a single frame from a PipeWire node.
/// Returns (pixels_argb, width, height) or None.
pub unsafe fn pw_grab_frame(pw_fd: RawFd, node_id: u32) -> Option<(Vec<u32>, u32, u32)> {
    ensure_pw_init();

    let dup_fd = libc::dup(pw_fd);
    if dup_fd < 0 { return None; }

    let loop_ = pw_main_loop_new(std::ptr::null());
    if loop_.is_null() { libc::close(dup_fd); return None; }

    let pw_loop = pw_main_loop_get_loop(loop_);
    let context = pw_context_new(pw_loop, std::ptr::null(), 0);
    if context.is_null() {
        pw_main_loop_destroy(loop_);
        libc::close(dup_fd);
        return None;
    }

    let core = pw_context_connect_fd(context, dup_fd, std::ptr::null(), 0);
    if core.is_null() {
        libc::close(dup_fd);
        pw_context_destroy(context);
        pw_main_loop_destroy(loop_);
        return None;
    }

    let props = pw_properties_new(
        b"media.type\0".as_ptr() as *const c_char,
        b"Video\0".as_ptr() as *const c_char,
        std::ptr::null::<c_char>(),
    );

    let stream = pw_stream_new(core, b"mechatron-capture\0".as_ptr() as _, props);
    if stream.is_null() {
        pw_core_disconnect(core);
        pw_context_destroy(context);
        pw_main_loop_destroy(loop_);
        return None;
    }

    let mut ctx = GrabCtx {
        loop_, stream, frame: None,
        negotiated_format: SPA_VIDEO_FORMAT_BGRx,
    };

    let events = PwStreamEvents {
        version: PW_VERSION_STREAM_EVENTS,
        destroy: None,
        state_changed: Some(on_state_changed),
        control_info: None,
        io_changed: None,
        param_changed: Some(on_param_changed),
        add_buffer: None,
        remove_buffer: None,
        process: Some(on_process),
        drained: None,
        command: None,
        trigger_done: None,
    };

    let mut hook: SpaHook = std::mem::zeroed();
    pw_stream_add_listener(stream, &mut hook, &events, &mut ctx as *mut _ as *mut c_void);

    let format_pod = build_video_format_pod();
    let pod_ptr = format_pod.as_ptr() as *const c_void;
    let params: [*const c_void; 1] = [pod_ptr];

    let flags = PW_STREAM_FLAG_AUTOCONNECT | PW_STREAM_FLAG_MAP_BUFFERS;
    let ret = pw_stream_connect(stream, PW_DIRECTION_INPUT, node_id, flags, params.as_ptr(), 1);
    if ret < 0 {
        pw_stream_destroy(stream);
        pw_core_disconnect(core);
        pw_context_destroy(context);
        pw_main_loop_destroy(loop_);
        return None;
    }

    pw_main_loop_run(loop_);

    let frame = ctx.frame.take();

    pw_stream_destroy(stream);
    pw_core_disconnect(core);
    pw_context_destroy(context);
    pw_main_loop_destroy(loop_);

    frame
}
