#![allow(non_upper_case_globals, dead_code)]

use std::ffi::{c_char, c_int, c_void};
use std::sync::Once;

// ── SPA type constants ────────────────────────────────────────────────
pub const SPA_TYPE_None: u32 = 1;
pub const SPA_TYPE_Id: u32 = 3;
pub const SPA_TYPE_Int: u32 = 4;
pub const SPA_TYPE_Rectangle: u32 = 10;
pub const SPA_TYPE_Fraction: u32 = 11;
pub const SPA_TYPE_Object: u32 = 15;
pub const SPA_TYPE_Choice: u32 = 19;

pub const SPA_TYPE_OBJECT_Format: u32 = 0x40003;

pub const SPA_PARAM_EnumFormat: u32 = 3;

pub const SPA_FORMAT_mediaType: u32 = 1;
pub const SPA_FORMAT_mediaSubtype: u32 = 2;
pub const SPA_FORMAT_VIDEO_format: u32 = 0x20001;
pub const SPA_FORMAT_VIDEO_size: u32 = 0x20003;
pub const SPA_FORMAT_VIDEO_framerate: u32 = 0x20004;

pub const SPA_MEDIA_TYPE_video: u32 = 2;
pub const SPA_MEDIA_SUBTYPE_raw: u32 = 1;

pub const SPA_VIDEO_FORMAT_RGBx: u32 = 7;
pub const SPA_VIDEO_FORMAT_BGRx: u32 = 8;
pub const SPA_VIDEO_FORMAT_xRGB: u32 = 9;
pub const SPA_VIDEO_FORMAT_xBGR: u32 = 10;
pub const SPA_VIDEO_FORMAT_RGBA: u32 = 11;
pub const SPA_VIDEO_FORMAT_BGRA: u32 = 12;
pub const SPA_VIDEO_FORMAT_ARGB: u32 = 13;
pub const SPA_VIDEO_FORMAT_ABGR: u32 = 14;

pub const SPA_CHOICE_None: u32 = 0;
pub const SPA_CHOICE_Enum: u32 = 3;

pub const PW_DIRECTION_INPUT: u32 = 0;

pub const PW_STREAM_STATE_ERROR: i32 = -1;
pub const PW_STREAM_STATE_STREAMING: i32 = 3;

pub const PW_STREAM_FLAG_AUTOCONNECT: u32 = 1 << 0;
pub const PW_STREAM_FLAG_MAP_BUFFERS: u32 = 1 << 2;

pub const PW_VERSION_STREAM_EVENTS: u32 = 2;

pub const PW_ID_ANY: u32 = 0xffffffff;

// ── SPA / PipeWire structs ────────────────────────────────────────────

#[repr(C)]
pub struct SpaList {
    pub next: *mut SpaList,
    pub prev: *mut SpaList,
}

#[repr(C)]
pub struct SpaCallbacks {
    pub funcs: *const c_void,
    pub data: *mut c_void,
}

#[repr(C)]
pub struct SpaHook {
    pub link: SpaList,
    pub cb: SpaCallbacks,
    pub removed: Option<unsafe extern "C" fn(*mut SpaHook)>,
    pub priv_: *mut c_void,
}

#[repr(C)]
pub struct SpaChunk {
    pub offset: u32,
    pub size: u32,
    pub stride: i32,
    pub flags: i32,
}

#[repr(C)]
pub struct SpaData {
    pub type_: u32,
    pub flags: u32,
    pub fd: i64,
    pub mapoffset: u32,
    pub maxsize: u32,
    pub data: *mut c_void,
    pub chunk: *mut SpaChunk,
}

#[repr(C)]
pub struct SpaBuffer {
    pub n_metas: u32,
    pub n_datas: u32,
    pub metas: *mut c_void,
    pub datas: *mut SpaData,
}

#[repr(C)]
pub struct PwBuffer {
    pub buffer: *mut SpaBuffer,
    pub user_data: *mut c_void,
    pub size: u64,
}

#[repr(C)]
pub struct PwStreamEvents {
    pub version: u32,
    pub destroy: Option<unsafe extern "C" fn(*mut c_void)>,
    pub state_changed: Option<unsafe extern "C" fn(*mut c_void, i32, i32, *const c_char)>,
    pub control_info: Option<unsafe extern "C" fn(*mut c_void, u32, *const c_void)>,
    pub io_changed: Option<unsafe extern "C" fn(*mut c_void, u32, *mut c_void, u32)>,
    pub param_changed: Option<unsafe extern "C" fn(*mut c_void, u32, *const c_void)>,
    pub add_buffer: Option<unsafe extern "C" fn(*mut c_void, *mut PwBuffer)>,
    pub remove_buffer: Option<unsafe extern "C" fn(*mut c_void, *mut PwBuffer)>,
    pub process: Option<unsafe extern "C" fn(*mut c_void)>,
    pub drained: Option<unsafe extern "C" fn(*mut c_void)>,
    pub command: Option<unsafe extern "C" fn(*mut c_void, *const c_void)>,
    pub trigger_done: Option<unsafe extern "C" fn(*mut c_void)>,
}

// ── SPA pod helpers (binary construction) ─────────────────────────────

pub fn spa_pod_u32(buf: &mut Vec<u8>, size: u32, type_: u32) {
    buf.extend_from_slice(&size.to_le_bytes());
    buf.extend_from_slice(&type_.to_le_bytes());
}

pub fn spa_pod_id(buf: &mut Vec<u8>, val: u32) {
    spa_pod_u32(buf, 4, SPA_TYPE_Id);
    buf.extend_from_slice(&val.to_le_bytes());
}

pub fn spa_pod_int(buf: &mut Vec<u8>, val: i32) {
    spa_pod_u32(buf, 4, SPA_TYPE_Int);
    buf.extend_from_slice(&val.to_le_bytes());
}

pub fn spa_pod_rectangle(buf: &mut Vec<u8>, w: u32, h: u32) {
    spa_pod_u32(buf, 8, SPA_TYPE_Rectangle);
    buf.extend_from_slice(&w.to_le_bytes());
    buf.extend_from_slice(&h.to_le_bytes());
}

pub fn spa_pod_fraction(buf: &mut Vec<u8>, num: u32, denom: u32) {
    spa_pod_u32(buf, 8, SPA_TYPE_Fraction);
    buf.extend_from_slice(&num.to_le_bytes());
    buf.extend_from_slice(&denom.to_le_bytes());
}

fn spa_pod_align(buf: &mut Vec<u8>) {
    while buf.len() % 8 != 0 { buf.push(0); }
}

pub fn spa_pod_prop(buf: &mut Vec<u8>, key: u32, flags: u32) {
    buf.extend_from_slice(&key.to_le_bytes());
    buf.extend_from_slice(&flags.to_le_bytes());
}

/// Build a format negotiation pod for video capture.
/// Prefers BGRx/BGRA formats (minimal conversion to ARGB u32).
pub fn build_video_format_pod() -> Vec<u8> {
    let mut body = Vec::new();

    // Object body header: object_type + param_id
    body.extend_from_slice(&SPA_TYPE_OBJECT_Format.to_le_bytes());
    body.extend_from_slice(&SPA_PARAM_EnumFormat.to_le_bytes());

    // Prop: mediaType = video
    spa_pod_prop(&mut body, SPA_FORMAT_mediaType, 0);
    spa_pod_id(&mut body, SPA_MEDIA_TYPE_video);

    // Prop: mediaSubtype = raw
    spa_pod_prop(&mut body, SPA_FORMAT_mediaSubtype, 0);
    spa_pod_id(&mut body, SPA_MEDIA_SUBTYPE_raw);

    // Prop: VIDEO_format = Choice::Enum(BGRx, BGRA, RGBx, RGBA, xRGB, ARGB)
    spa_pod_prop(&mut body, SPA_FORMAT_VIDEO_format, 0);
    {
        let formats: &[u32] = &[
            SPA_VIDEO_FORMAT_BGRx, SPA_VIDEO_FORMAT_BGRA,
            SPA_VIDEO_FORMAT_RGBx, SPA_VIDEO_FORMAT_RGBA,
            SPA_VIDEO_FORMAT_xRGB, SPA_VIDEO_FORMAT_ARGB,
        ];
        // Choice pod: header(body_size, SPA_TYPE_Choice) + choice_type + flags + child pods
        let mut choice_body = Vec::new();
        choice_body.extend_from_slice(&SPA_CHOICE_Enum.to_le_bytes());
        choice_body.extend_from_slice(&0u32.to_le_bytes()); // flags
        for &fmt in formats {
            spa_pod_id(&mut choice_body, fmt);
        }
        spa_pod_u32(&mut body, choice_body.len() as u32, SPA_TYPE_Choice);
        body.extend_from_slice(&choice_body);
    }

    // Prop: VIDEO_framerate = 0/1 (any)
    spa_pod_prop(&mut body, SPA_FORMAT_VIDEO_framerate, 0);
    spa_pod_fraction(&mut body, 0, 1);

    // Wrap in Object pod
    let mut pod = Vec::new();
    spa_pod_u32(&mut pod, body.len() as u32, SPA_TYPE_Object);
    pod.extend_from_slice(&body);
    pod
}

// ── Dynamically loaded function pointers ──────────────────────────────

pub struct PwFns {
    pub pw_init: unsafe extern "C" fn(*mut c_int, *mut *mut *mut c_char),
    pub pw_main_loop_new: unsafe extern "C" fn(*const c_void) -> *mut c_void,
    pub pw_main_loop_destroy: unsafe extern "C" fn(*mut c_void),
    pub pw_main_loop_get_loop: unsafe extern "C" fn(*mut c_void) -> *mut c_void,
    pub pw_main_loop_run: unsafe extern "C" fn(*mut c_void) -> c_int,
    pub pw_main_loop_quit: unsafe extern "C" fn(*mut c_void) -> c_int,
    pub pw_context_new: unsafe extern "C" fn(*mut c_void, *const c_void, usize) -> *mut c_void,
    pub pw_context_destroy: unsafe extern "C" fn(*mut c_void),
    pub pw_context_connect_fd: unsafe extern "C" fn(*mut c_void, c_int, *const c_void, usize) -> *mut c_void,
    pub pw_core_disconnect: unsafe extern "C" fn(*mut c_void),
    pub pw_stream_new: unsafe extern "C" fn(*mut c_void, *const c_char, *const c_void) -> *mut c_void,
    pub pw_stream_destroy: unsafe extern "C" fn(*mut c_void),
    pub pw_stream_connect: unsafe extern "C" fn(*mut c_void, u32, u32, u32, *const *const c_void, u32) -> c_int,
    pub pw_stream_add_listener: unsafe extern "C" fn(*mut c_void, *mut SpaHook, *const PwStreamEvents, *mut c_void),
    pub pw_stream_dequeue_buffer: unsafe extern "C" fn(*mut c_void) -> *mut PwBuffer,
    pub pw_stream_queue_buffer: unsafe extern "C" fn(*mut c_void, *mut PwBuffer) -> c_int,
    pub pw_properties_new: *mut c_void, // variadic — called via transmute
}

unsafe impl Sync for PwFns {}
unsafe impl Send for PwFns {}

static PW_INIT: Once = Once::new();
static mut PW_PTR: *const PwFns = std::ptr::null();

pub unsafe fn load_pw() -> Option<&'static PwFns> {
    PW_INIT.call_once(|| {
        let lib = libc::dlopen(
            b"libpipewire-0.3.so.0\0".as_ptr() as *const c_char,
            libc::RTLD_NOW | libc::RTLD_LOCAL,
        );
        let lib = if lib.is_null() {
            let l = libc::dlopen(
                b"libpipewire-0.3.so\0".as_ptr() as *const c_char,
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

        // Call pw_init once
        let pw_init_fn: unsafe extern "C" fn(*mut c_int, *mut *mut *mut c_char) =
            std::mem::transmute(libc::dlsym(lib, b"pw_init\0".as_ptr() as *const c_char));
        pw_init_fn(std::ptr::null_mut(), std::ptr::null_mut());

        PW_PTR = Box::into_raw(Box::new(PwFns {
            pw_init: sym!(b"pw_init\0"),
            pw_main_loop_new: sym!(b"pw_main_loop_new\0"),
            pw_main_loop_destroy: sym!(b"pw_main_loop_destroy\0"),
            pw_main_loop_get_loop: sym!(b"pw_main_loop_get_loop\0"),
            pw_main_loop_run: sym!(b"pw_main_loop_run\0"),
            pw_main_loop_quit: sym!(b"pw_main_loop_quit\0"),
            pw_context_new: sym!(b"pw_context_new\0"),
            pw_context_destroy: sym!(b"pw_context_destroy\0"),
            pw_context_connect_fd: sym!(b"pw_context_connect_fd\0"),
            pw_core_disconnect: sym!(b"pw_core_disconnect\0"),
            pw_stream_new: sym!(b"pw_stream_new\0"),
            pw_stream_destroy: sym!(b"pw_stream_destroy\0"),
            pw_stream_connect: sym!(b"pw_stream_connect\0"),
            pw_stream_add_listener: sym!(b"pw_stream_add_listener\0"),
            pw_stream_dequeue_buffer: sym!(b"pw_stream_dequeue_buffer\0"),
            pw_stream_queue_buffer: sym!(b"pw_stream_queue_buffer\0"),
            pw_properties_new: sym_raw!(b"pw_properties_new\0"),
        }));
    });
    PW_PTR.as_ref()
}
