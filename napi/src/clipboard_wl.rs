use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::os::unix::io::RawFd;
use std::sync::{mpsc, Mutex, Once};

// ── Wayland C types ─────────────────────────────────────────────────────

type WlDisplay = c_void;
type WlProxy = c_void;

#[repr(C)]
struct WlInterface {
    name: *const c_char,
    version: c_int,
    method_count: c_int,
    methods: *const WlMessage,
    event_count: c_int,
    events: *const WlMessage,
}

#[repr(C)]
struct WlMessage {
    name: *const c_char,
    signature: *const c_char,
    types: *const *const WlInterface,
}

unsafe impl Sync for WlInterface {}
unsafe impl Send for WlInterface {}
unsafe impl Sync for WlMessage {}
unsafe impl Send for WlMessage {}

#[repr(transparent)]
struct WlTypes<const N: usize>([*const WlInterface; N]);
unsafe impl<const N: usize> Sync for WlTypes<N> {}

const WL_MARSHAL_FLAG_DESTROY: u32 = 1;

// ── Dynamically loaded function pointers ────────────────────────────────

struct WlFns {
    display_connect: unsafe extern "C" fn(*const c_char) -> *mut WlDisplay,
    display_disconnect: unsafe extern "C" fn(*mut WlDisplay),
    display_roundtrip: unsafe extern "C" fn(*mut WlDisplay) -> c_int,
    display_get_fd: unsafe extern "C" fn(*mut WlDisplay) -> c_int,
    display_dispatch: unsafe extern "C" fn(*mut WlDisplay) -> c_int,
    proxy_marshal_flags: unsafe extern "C" fn(
        *mut WlProxy, u32, *const WlInterface, u32, u32, ...
    ) -> *mut WlProxy,
    proxy_add_listener: unsafe extern "C" fn(
        *mut WlProxy, *const c_void, *mut c_void,
    ) -> c_int,
    proxy_destroy: unsafe extern "C" fn(*mut WlProxy),
    proxy_get_version: unsafe extern "C" fn(*mut WlProxy) -> u32,
}

static WL_INIT: Once = Once::new();
static mut WL_PTR: *const WlFns = std::ptr::null();

unsafe fn load_wayland() -> Option<&'static WlFns> {
    WL_INIT.call_once(|| {
        let lib = libc::dlopen(
            b"libwayland-client.so.0\0".as_ptr() as *const c_char,
            libc::RTLD_NOW | libc::RTLD_LOCAL,
        );
        if lib.is_null() {
            return;
        }

        macro_rules! sym {
            ($name:expr) => {{
                let s = libc::dlsym(lib, $name.as_ptr() as *const c_char);
                if s.is_null() { return; }
                std::mem::transmute(s)
            }};
        }

        WL_PTR = Box::into_raw(Box::new(WlFns {
            display_connect: sym!(b"wl_display_connect\0"),
            display_disconnect: sym!(b"wl_display_disconnect\0"),
            display_roundtrip: sym!(b"wl_display_roundtrip\0"),
            display_get_fd: sym!(b"wl_display_get_fd\0"),
            display_dispatch: sym!(b"wl_display_dispatch\0"),
            proxy_marshal_flags: sym!(b"wl_proxy_marshal_flags\0"),
            proxy_add_listener: sym!(b"wl_proxy_add_listener\0"),
            proxy_destroy: sym!(b"wl_proxy_destroy\0"),
            proxy_get_version: sym!(b"wl_proxy_get_version\0"),
        }));
    });
    WL_PTR.as_ref()
}

// ── Protocol interface definitions ──────────────────────────────────────
//
// Minimal stubs for the interfaces needed by zwlr_data_control_v1.
// Only name+version are strictly required for wl_registry_bind; the
// method/event arrays are needed for correct marshal/dispatch.

static NULL_TYPES: WlTypes<4> = WlTypes([
    std::ptr::null(),
    std::ptr::null(),
    std::ptr::null(),
    std::ptr::null(),
]);

// -- wl_registry (from core protocol) --
static WL_REGISTRY_EVENTS: [WlMessage; 2] = [
    WlMessage {
        name: b"global\0".as_ptr() as *const c_char,
        signature: b"usu\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"global_remove\0".as_ptr() as *const c_char,
        signature: b"u\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
];

static WL_REGISTRY_METHODS: [WlMessage; 1] = [WlMessage {
    name: b"bind\0".as_ptr() as *const c_char,
    signature: b"usun\0".as_ptr() as *const c_char,
    types: NULL_TYPES.0.as_ptr(),
}];

static WL_REGISTRY_INTERFACE: WlInterface = WlInterface {
    name: b"wl_registry\0".as_ptr() as *const c_char,
    version: 1,
    method_count: 1,
    methods: WL_REGISTRY_METHODS.as_ptr(),
    event_count: 2,
    events: WL_REGISTRY_EVENTS.as_ptr(),
};

// -- wl_seat --
static WL_SEAT_INTERFACE: WlInterface = WlInterface {
    name: b"wl_seat\0".as_ptr() as *const c_char,
    version: 7,
    method_count: 0,
    methods: std::ptr::null(),
    event_count: 0,
    events: std::ptr::null(),
};

// -- zwlr_data_control_offer_v1 --
static OFFER_EVENTS: [WlMessage; 1] = [WlMessage {
    name: b"offer\0".as_ptr() as *const c_char,
    signature: b"s\0".as_ptr() as *const c_char,
    types: NULL_TYPES.0.as_ptr(),
}];

static OFFER_METHODS: [WlMessage; 2] = [
    WlMessage {
        name: b"receive\0".as_ptr() as *const c_char,
        signature: b"sh\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"destroy\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
];

static ZWLR_DATA_CONTROL_OFFER_V1_INTERFACE: WlInterface = WlInterface {
    name: b"zwlr_data_control_offer_v1\0".as_ptr() as *const c_char,
    version: 1,
    method_count: 2,
    methods: OFFER_METHODS.as_ptr(),
    event_count: 1,
    events: OFFER_EVENTS.as_ptr(),
};

// -- zwlr_data_control_source_v1 --
static SOURCE_EVENTS: [WlMessage; 2] = [
    WlMessage {
        name: b"send\0".as_ptr() as *const c_char,
        signature: b"sh\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"cancelled\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
];

static SOURCE_METHODS: [WlMessage; 2] = [
    WlMessage {
        name: b"offer\0".as_ptr() as *const c_char,
        signature: b"s\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"destroy\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
];

static ZWLR_DATA_CONTROL_SOURCE_V1_INTERFACE: WlInterface = WlInterface {
    name: b"zwlr_data_control_source_v1\0".as_ptr() as *const c_char,
    version: 1,
    method_count: 2,
    methods: SOURCE_METHODS.as_ptr(),
    event_count: 2,
    events: SOURCE_EVENTS.as_ptr(),
};

// -- zwlr_data_control_device_v1 --
// Event types array: data_offer creates a new offer object
static DEVICE_DATA_OFFER_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_OFFER_V1_INTERFACE as *const WlInterface,
]);

static DEVICE_SELECTION_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_OFFER_V1_INTERFACE as *const WlInterface,
]);

static DEVICE_SET_SELECTION_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_SOURCE_V1_INTERFACE as *const WlInterface,
]);

static DEVICE_EVENTS: [WlMessage; 4] = [
    WlMessage {
        name: b"data_offer\0".as_ptr() as *const c_char,
        signature: b"n\0".as_ptr() as *const c_char,
        types: DEVICE_DATA_OFFER_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: DEVICE_SELECTION_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"finished\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"primary_selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: DEVICE_SELECTION_TYPES.0.as_ptr(),
    },
];

static DEVICE_METHODS: [WlMessage; 3] = [
    WlMessage {
        name: b"set_selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: DEVICE_SET_SELECTION_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"destroy\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"set_primary_selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: DEVICE_SET_SELECTION_TYPES.0.as_ptr(),
    },
];

static ZWLR_DATA_CONTROL_DEVICE_V1_INTERFACE: WlInterface = WlInterface {
    name: b"zwlr_data_control_device_v1\0".as_ptr() as *const c_char,
    version: 2,
    method_count: 3,
    methods: DEVICE_METHODS.as_ptr(),
    event_count: 4,
    events: DEVICE_EVENTS.as_ptr(),
};

// -- zwlr_data_control_manager_v1 --
static MANAGER_CREATE_SOURCE_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_SOURCE_V1_INTERFACE as *const WlInterface,
]);

static MANAGER_GET_DEVICE_TYPES: WlTypes<2> = WlTypes([
    &ZWLR_DATA_CONTROL_DEVICE_V1_INTERFACE as *const WlInterface,
    &WL_SEAT_INTERFACE as *const WlInterface,
]);

static MANAGER_METHODS: [WlMessage; 3] = [
    WlMessage {
        name: b"create_data_source\0".as_ptr() as *const c_char,
        signature: b"n\0".as_ptr() as *const c_char,
        types: MANAGER_CREATE_SOURCE_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"get_data_device\0".as_ptr() as *const c_char,
        signature: b"no\0".as_ptr() as *const c_char,
        types: MANAGER_GET_DEVICE_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"destroy\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
];

static ZWLR_DATA_CONTROL_MANAGER_V1_INTERFACE: WlInterface = WlInterface {
    name: b"zwlr_data_control_manager_v1\0".as_ptr() as *const c_char,
    version: 2,
    method_count: 3,
    methods: MANAGER_METHODS.as_ptr(),
    event_count: 0,
    events: std::ptr::null(),
};

// ── Listener callback types ─────────────────────────────────────────────

type RegistryGlobalFn = unsafe extern "C" fn(
    *mut c_void, *mut WlProxy, u32, *const c_char, u32,
);
type RegistryGlobalRemoveFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, u32);

#[repr(C)]
struct RegistryListener {
    global: RegistryGlobalFn,
    global_remove: RegistryGlobalRemoveFn,
}

type DeviceDataOfferFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);
type DeviceSelectionFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);
type DeviceFinishedFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy);
type DevicePrimarySelFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);

#[repr(C)]
struct DeviceListener {
    data_offer: DeviceDataOfferFn,
    selection: DeviceSelectionFn,
    finished: DeviceFinishedFn,
    primary_selection: DevicePrimarySelFn,
}

type OfferOfferFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *const c_char);

#[repr(C)]
struct OfferListener {
    offer: OfferOfferFn,
}

type SourceSendFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *const c_char, i32);
type SourceCancelledFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy);

#[repr(C)]
struct SourceListener {
    send: SourceSendFn,
    cancelled: SourceCancelledFn,
}

// ── Shared state for callbacks ──────────────────────────────────────────

struct WlState {
    wl: &'static WlFns,
    manager: *mut WlProxy,
    seat: *mut WlProxy,
    device: *mut WlProxy,
    // Current selection offer
    cur_offer: *mut WlProxy,
    cur_offer_mimes: Vec<String>,
    // Data we own (for serving)
    text: Option<String>,
    png: Option<Vec<u8>>,
    source: *mut WlProxy,
    sequence: u64,
    owns: bool,
}

// ── Callback implementations ────────────────────────────────────────────

unsafe extern "C" fn registry_global(
    data: *mut c_void, registry: *mut WlProxy, name: u32,
    interface: *const c_char, version: u32,
) {
    let state = &mut *(data as *mut WlState);
    let iface = CStr::from_ptr(interface);

    if iface.to_bytes() == b"wl_seat" && state.seat.is_null() {
        state.seat = (state.wl.proxy_marshal_flags)(
            registry, 0,
            &WL_SEAT_INTERFACE, version.min(7), 0,
            name,
            iface.as_ptr(),
            version.min(7),
            std::ptr::null::<c_void>(),
        );
    } else if iface.to_bytes() == b"zwlr_data_control_manager_v1" && state.manager.is_null() {
        state.manager = (state.wl.proxy_marshal_flags)(
            registry, 0,
            &ZWLR_DATA_CONTROL_MANAGER_V1_INTERFACE, version.min(2), 0,
            name,
            iface.as_ptr(),
            version.min(2),
            std::ptr::null::<c_void>(),
        );
    }
}

unsafe extern "C" fn registry_global_remove(
    _data: *mut c_void, _registry: *mut WlProxy, _name: u32,
) {}

unsafe extern "C" fn device_data_offer(
    data: *mut c_void, _device: *mut WlProxy, offer: *mut WlProxy,
) {
    let state = &mut *(data as *mut WlState);
    // Attach offer listener
    static LISTENER: OfferListener = OfferListener { offer: offer_offer };
    (state.wl.proxy_add_listener)(
        offer,
        &LISTENER as *const _ as *const c_void,
        data,
    );
}

unsafe extern "C" fn device_selection(
    data: *mut c_void, _device: *mut WlProxy, offer: *mut WlProxy,
) {
    let state = &mut *(data as *mut WlState);
    // Destroy old offer if any
    if !state.cur_offer.is_null() {
        // opcode 1 = destroy
        (state.wl.proxy_marshal_flags)(
            state.cur_offer, 1,
            std::ptr::null(), 0, WL_MARSHAL_FLAG_DESTROY,
        );
        state.cur_offer = std::ptr::null_mut();
    }
    state.cur_offer_mimes.clear();
    state.cur_offer = offer;
}

unsafe extern "C" fn device_finished(
    _data: *mut c_void, _device: *mut WlProxy,
) {}

unsafe extern "C" fn device_primary_selection(
    _data: *mut c_void, _device: *mut WlProxy, _offer: *mut WlProxy,
) {}

unsafe extern "C" fn offer_offer(
    data: *mut c_void, _offer: *mut WlProxy, mime: *const c_char,
) {
    let state = &mut *(data as *mut WlState);
    if let Ok(s) = CStr::from_ptr(mime).to_str() {
        state.cur_offer_mimes.push(s.to_string());
    }
}

unsafe extern "C" fn source_send(
    data: *mut c_void, _source: *mut WlProxy, mime_type: *const c_char, fd: i32,
) {
    let state = &*(data as *const WlState);
    let mime = CStr::from_ptr(mime_type);

    if let Ok(m) = mime.to_str() {
        match m {
            "text/plain" | "text/plain;charset=utf-8" | "UTF8_STRING" | "STRING" => {
                if let Some(ref text) = state.text {
                    let bytes = text.as_bytes();
                    let mut written = 0;
                    while written < bytes.len() {
                        let n = libc::write(
                            fd,
                            bytes[written..].as_ptr() as *const c_void,
                            bytes.len() - written,
                        );
                        if n <= 0 { break; }
                        written += n as usize;
                    }
                }
            }
            "image/png" => {
                if let Some(ref png) = state.png {
                    let mut written = 0;
                    while written < png.len() {
                        let n = libc::write(
                            fd,
                            png[written..].as_ptr() as *const c_void,
                            png.len() - written,
                        );
                        if n <= 0 { break; }
                        written += n as usize;
                    }
                }
            }
            _ => {}
        }
    }

    libc::close(fd);
}

unsafe extern "C" fn source_cancelled(
    data: *mut c_void, _source: *mut WlProxy,
) {
    let state = &mut *(data as *mut WlState);
    state.owns = false;
    if !state.source.is_null() {
        // opcode 1 = destroy
        (state.wl.proxy_marshal_flags)(
            state.source, 1,
            std::ptr::null(), 0, WL_MARSHAL_FLAG_DESTROY,
        );
        state.source = std::ptr::null_mut();
    }
}

// ── Command channel ─────────────────────────────────────────────────────

enum WlCmd {
    Clear { resp: mpsc::Sender<bool> },
    HasText { resp: mpsc::Sender<bool> },
    GetText { resp: mpsc::Sender<String> },
    SetText { text: String, resp: mpsc::Sender<bool> },
    HasImage { resp: mpsc::Sender<bool> },
    GetImage { resp: mpsc::Sender<Option<(u32, u32, Vec<u32>)>> },
    SetImage { width: u32, height: u32, data: Vec<u32>, resp: mpsc::Sender<bool> },
    GetSequence { resp: mpsc::Sender<f64> },
}

struct WlHandle {
    tx: Mutex<mpsc::Sender<WlCmd>>,
    wake_wr: RawFd,
}

impl WlHandle {
    fn send(&self, cmd: WlCmd) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(cmd);
        }
        unsafe { libc::write(self.wake_wr, b"\x01" as *const _ as *const c_void, 1); }
    }

    fn request<T>(&self, f: impl FnOnce(mpsc::Sender<T>) -> WlCmd) -> Option<T> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(f(resp_tx));
        resp_rx.recv().ok()
    }
}

static WL_HANDLE_INIT: Once = Once::new();
static mut WL_HANDLE: *const WlHandle = std::ptr::null();

fn get_handle() -> Option<&'static WlHandle> {
    unsafe {
        WL_HANDLE_INIT.call_once(|| {
            if let Some(h) = try_init() {
                WL_HANDLE = Box::into_raw(Box::new(h));
            }
        });
        WL_HANDLE.as_ref()
    }
}

fn try_init() -> Option<WlHandle> {
    let wl = unsafe { load_wayland()? };

    // Quick check: can we connect and find the protocol?
    unsafe {
        let display = (wl.display_connect)(std::ptr::null());
        if display.is_null() {
            return None;
        }
        (wl.display_disconnect)(display);
    }

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
    std::thread::spawn(move || unsafe { wayland_thread(rx, pipe_rd) });

    Some(WlHandle {
        tx: Mutex::new(tx),
        wake_wr: pipe_wr,
    })
}

unsafe fn wayland_thread(rx: mpsc::Receiver<WlCmd>, wake_rd: RawFd) {
    let wl = match load_wayland() {
        Some(w) => w,
        None => return,
    };

    let display = (wl.display_connect)(std::ptr::null());
    if display.is_null() {
        return;
    }

    let mut state = WlState {
        wl,
        manager: std::ptr::null_mut(),
        seat: std::ptr::null_mut(),
        device: std::ptr::null_mut(),
        cur_offer: std::ptr::null_mut(),
        cur_offer_mimes: Vec::new(),
        text: None,
        png: None,
        source: std::ptr::null_mut(),
        sequence: 0,
        owns: false,
    };

    // Get registry
    let version = (wl.proxy_get_version)(display as *mut WlProxy);
    let registry = (wl.proxy_marshal_flags)(
        display as *mut WlProxy, 1,
        &WL_REGISTRY_INTERFACE, version, 0,
        std::ptr::null::<c_void>(),
    );
    if registry.is_null() {
        (wl.display_disconnect)(display);
        return;
    }

    static REG_LISTENER: RegistryListener = RegistryListener {
        global: registry_global,
        global_remove: registry_global_remove,
    };
    (wl.proxy_add_listener)(
        registry,
        &REG_LISTENER as *const _ as *const c_void,
        &mut state as *mut _ as *mut c_void,
    );

    // Roundtrip to get globals
    (wl.display_roundtrip)(display);

    if state.manager.is_null() || state.seat.is_null() {
        (wl.proxy_destroy)(registry);
        (wl.display_disconnect)(display);
        return;
    }

    // Get data device for seat
    let device = (wl.proxy_marshal_flags)(
        state.manager, 1,
        &ZWLR_DATA_CONTROL_DEVICE_V1_INTERFACE,
        (wl.proxy_get_version)(state.manager), 0,
        std::ptr::null::<c_void>(),
        state.seat,
    );
    if device.is_null() {
        (wl.proxy_destroy)(registry);
        (wl.display_disconnect)(display);
        return;
    }
    state.device = device;

    static DEV_LISTENER: DeviceListener = DeviceListener {
        data_offer: device_data_offer,
        selection: device_selection,
        finished: device_finished,
        primary_selection: device_primary_selection,
    };
    (wl.proxy_add_listener)(
        device,
        &DEV_LISTENER as *const _ as *const c_void,
        &mut state as *mut _ as *mut c_void,
    );

    // Initial roundtrip to get current selection
    (wl.display_roundtrip)(display);

    let wl_fd = (wl.display_get_fd)(display);

    loop {
        let mut fds = [
            libc::pollfd { fd: wl_fd, events: libc::POLLIN, revents: 0 },
            libc::pollfd { fd: wake_rd, events: libc::POLLIN, revents: 0 },
        ];
        libc::poll(fds.as_mut_ptr(), 2, -1);

        // Drain wake pipe
        if fds[1].revents & libc::POLLIN != 0 {
            let mut buf = [0u8; 64];
            while libc::read(wake_rd, buf.as_mut_ptr() as *mut c_void, buf.len()) > 0 {}
        }

        // Dispatch Wayland events
        if fds[0].revents & libc::POLLIN != 0 {
            (wl.display_dispatch)(display);
        }

        // Process commands
        while let Ok(cmd) = rx.try_recv() {
            process_command(cmd, &mut state, display);
        }
    }
}

unsafe fn process_command(cmd: WlCmd, s: &mut WlState, display: *mut WlDisplay) {
    match cmd {
        WlCmd::Clear { resp } => {
            destroy_source(s);
            s.text = None;
            s.png = None;
            s.owns = false;
            // Set selection to null
            (s.wl.proxy_marshal_flags)(
                s.device, 0,
                std::ptr::null(), (s.wl.proxy_get_version)(s.device), 0,
                std::ptr::null::<c_void>(),
            );
            (s.wl.display_roundtrip)(display);
            s.sequence += 1;
            let _ = resp.send(true);
        }

        WlCmd::HasText { resp } => {
            if s.owns && s.text.is_some() {
                let _ = resp.send(true);
                return;
            }
            // Roundtrip to refresh selection
            (s.wl.display_roundtrip)(display);
            let has = s.cur_offer_mimes.iter().any(|m| {
                m == "text/plain;charset=utf-8" || m == "text/plain"
                    || m == "UTF8_STRING" || m == "STRING"
            });
            let _ = resp.send(has);
        }

        WlCmd::GetText { resp } => {
            if s.owns {
                let _ = resp.send(s.text.clone().unwrap_or_default());
                return;
            }
            (s.wl.display_roundtrip)(display);
            if s.cur_offer.is_null() {
                let _ = resp.send(String::new());
                return;
            }
            let text = receive_mime(s, display, "text/plain;charset=utf-8")
                .or_else(|| receive_mime(s, display, "text/plain"))
                .or_else(|| receive_mime(s, display, "UTF8_STRING"))
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .unwrap_or_default();
            let _ = resp.send(text);
        }

        WlCmd::SetText { text, resp } => {
            destroy_source(s);
            s.text = Some(text);
            s.png = None;
            let ok = create_and_set_source(s, display, &[
                "text/plain;charset=utf-8",
                "text/plain",
                "UTF8_STRING",
                "STRING",
            ]);
            if ok {
                s.owns = true;
                s.sequence += 1;
            }
            let _ = resp.send(ok);
        }

        WlCmd::HasImage { resp } => {
            if s.owns && s.png.is_some() {
                let _ = resp.send(true);
                return;
            }
            (s.wl.display_roundtrip)(display);
            let has = s.cur_offer_mimes.iter().any(|m| m == "image/png");
            let _ = resp.send(has);
        }

        WlCmd::GetImage { resp } => {
            if s.owns {
                let result = s.png.as_ref().and_then(|p| super::png_to_argb(p));
                let _ = resp.send(result);
                return;
            }
            (s.wl.display_roundtrip)(display);
            if s.cur_offer.is_null() {
                let _ = resp.send(None);
                return;
            }
            let result = receive_mime(s, display, "image/png")
                .and_then(|b| super::png_to_argb(&b));
            let _ = resp.send(result);
        }

        WlCmd::SetImage { width, height, data, resp } => {
            destroy_source(s);
            match super::argb_to_png(width, height, &data) {
                Some(png_bytes) => {
                    s.png = Some(png_bytes);
                    s.text = None;
                    let ok = create_and_set_source(s, display, &["image/png"]);
                    if ok {
                        s.owns = true;
                        s.sequence += 1;
                    }
                    let _ = resp.send(ok);
                }
                None => {
                    let _ = resp.send(false);
                }
            }
        }

        WlCmd::GetSequence { resp } => {
            let _ = resp.send(s.sequence as f64);
        }
    }
}

unsafe fn destroy_source(s: &mut WlState) {
    if !s.source.is_null() {
        (s.wl.proxy_marshal_flags)(
            s.source, 1,
            std::ptr::null(), 0, WL_MARSHAL_FLAG_DESTROY,
        );
        s.source = std::ptr::null_mut();
    }
}

unsafe fn create_and_set_source(
    s: &mut WlState, display: *mut WlDisplay, mimes: &[&str],
) -> bool {
    // manager opcode 0 = create_data_source
    let source = (s.wl.proxy_marshal_flags)(
        s.manager, 0,
        &ZWLR_DATA_CONTROL_SOURCE_V1_INTERFACE,
        (s.wl.proxy_get_version)(s.manager), 0,
        std::ptr::null::<c_void>(),
    );
    if source.is_null() {
        return false;
    }

    static SRC_LISTENER: SourceListener = SourceListener {
        send: source_send,
        cancelled: source_cancelled,
    };
    (s.wl.proxy_add_listener)(
        source,
        &SRC_LISTENER as *const _ as *const c_void,
        s as *mut _ as *mut c_void,
    );

    // Offer MIME types (source opcode 0 = offer)
    for mime in mimes {
        let c_mime = CString::new(*mime).unwrap();
        (s.wl.proxy_marshal_flags)(
            source, 0,
            std::ptr::null(), (s.wl.proxy_get_version)(source), 0,
            c_mime.as_ptr(),
        );
    }

    s.source = source;

    // device opcode 0 = set_selection
    (s.wl.proxy_marshal_flags)(
        s.device, 0,
        std::ptr::null(), (s.wl.proxy_get_version)(s.device), 0,
        source,
    );

    (s.wl.display_roundtrip)(display);
    true
}

unsafe fn receive_mime(
    s: &mut WlState, display: *mut WlDisplay, mime: &str,
) -> Option<Vec<u8>> {
    if s.cur_offer.is_null() {
        return None;
    }
    if !s.cur_offer_mimes.iter().any(|m| m == mime) {
        return None;
    }

    let mut pipe_fds = [0i32; 2];
    if libc::pipe(pipe_fds.as_mut_ptr()) != 0 {
        return None;
    }
    let pipe_rd = pipe_fds[0];
    let pipe_wr = pipe_fds[1];

    // offer opcode 0 = receive(mime_type, fd)
    let c_mime = CString::new(mime).ok()?;
    (s.wl.proxy_marshal_flags)(
        s.cur_offer, 0,
        std::ptr::null(), (s.wl.proxy_get_version)(s.cur_offer), 0,
        c_mime.as_ptr(),
        pipe_wr,
    );

    libc::close(pipe_wr);
    (s.wl.display_roundtrip)(display);

    // Read all data from pipe
    let mut data = Vec::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = libc::read(pipe_rd, buf.as_mut_ptr() as *mut c_void, buf.len());
        if n <= 0 { break; }
        data.extend_from_slice(&buf[..n as usize]);
    }
    libc::close(pipe_rd);

    if data.is_empty() { None } else { Some(data) }
}

// ── Availability check ──────────────────────────────────────────────────

pub fn is_available() -> bool {
    get_handle().is_some()
}

// ── Public API ──────────────────────────────────────────────────────────

pub fn wl_clear() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| WlCmd::Clear { resp }))
        .unwrap_or(false)
}

pub fn wl_has_text() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| WlCmd::HasText { resp }))
        .unwrap_or(false)
}

pub fn wl_get_text() -> String {
    get_handle()
        .and_then(|h| h.request(|resp| WlCmd::GetText { resp }))
        .unwrap_or_default()
}

pub fn wl_set_text(text: &str) -> bool {
    get_handle()
        .and_then(|h| {
            h.request(|resp| WlCmd::SetText {
                text: text.to_string(),
                resp,
            })
        })
        .unwrap_or(false)
}

pub fn wl_has_image() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| WlCmd::HasImage { resp }))
        .unwrap_or(false)
}

pub fn wl_get_image() -> Option<(u32, u32, Vec<u32>)> {
    get_handle().and_then(|h| h.request(|resp| WlCmd::GetImage { resp }))?
}

pub fn wl_set_image(width: u32, height: u32, data: &[u32]) -> bool {
    get_handle()
        .and_then(|h| {
            h.request(|resp| WlCmd::SetImage {
                width,
                height,
                data: data.to_vec(),
                resp,
            })
        })
        .unwrap_or(false)
}

pub fn wl_get_sequence() -> f64 {
    get_handle()
        .and_then(|h| h.request(|resp| WlCmd::GetSequence { resp }))
        .unwrap_or(0.0)
}
