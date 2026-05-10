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

// ── Linked libwayland-client functions ──────────────────────────────────

extern "C" {
    fn wl_display_connect(name: *const c_char) -> *mut WlDisplay;
    fn wl_display_disconnect(display: *mut WlDisplay);
    fn wl_display_roundtrip(display: *mut WlDisplay) -> c_int;
    fn wl_display_get_fd(display: *mut WlDisplay) -> c_int;
    fn wl_display_dispatch(display: *mut WlDisplay) -> c_int;
    fn wl_proxy_marshal_flags(
        proxy: *mut WlProxy, opcode: u32, interface: *const WlInterface,
        version: u32, flags: u32, ...
    ) -> *mut WlProxy;
    fn wl_proxy_add_listener(
        proxy: *mut WlProxy, implementation: *const c_void, data: *mut c_void,
    ) -> c_int;
    fn wl_proxy_destroy(proxy: *mut WlProxy);
    fn wl_proxy_get_version(proxy: *mut WlProxy) -> u32;
}

// ── Protocol interface definitions ──────────────────────────────────────

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

// -- wl_compositor --
static WL_COMPOSITOR_INTERFACE: WlInterface = WlInterface {
    name: b"wl_compositor\0".as_ptr() as *const c_char,
    version: 4,
    method_count: 0,
    methods: std::ptr::null(),
    event_count: 0,
    events: std::ptr::null(),
};

// -- wl_surface (stub for wl_compositor.create_surface) --
static WL_SURFACE_INTERFACE: WlInterface = WlInterface {
    name: b"wl_surface\0".as_ptr() as *const c_char,
    version: 4,
    method_count: 0,
    methods: std::ptr::null(),
    event_count: 0,
    events: std::ptr::null(),
};

// -- wl_data_device_manager --
static WL_DATA_DEVICE_MANAGER_INTERFACE: WlInterface = WlInterface {
    name: b"wl_data_device_manager\0".as_ptr() as *const c_char,
    version: 3,
    method_count: 0,
    methods: std::ptr::null(),
    event_count: 0,
    events: std::ptr::null(),
};

// -- wl_data_source --
static WL_DATA_SOURCE_EVENTS: [WlMessage; 3] = [
    WlMessage {
        name: b"target\0".as_ptr() as *const c_char,
        signature: b"?s\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
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

static WL_DATA_SOURCE_METHODS: [WlMessage; 2] = [
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

static WL_DATA_SOURCE_INTERFACE: WlInterface = WlInterface {
    name: b"wl_data_source\0".as_ptr() as *const c_char,
    version: 3,
    method_count: 2,
    methods: WL_DATA_SOURCE_METHODS.as_ptr(),
    event_count: 3,
    events: WL_DATA_SOURCE_EVENTS.as_ptr(),
};

// -- wl_data_offer --
static WL_DATA_OFFER_EVENTS: [WlMessage; 1] = [
    WlMessage {
        name: b"offer\0".as_ptr() as *const c_char,
        signature: b"s\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
];

static WL_DATA_OFFER_METHODS: [WlMessage; 2] = [
    WlMessage {
        name: b"accept\0".as_ptr() as *const c_char,
        signature: b"u?s\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"receive\0".as_ptr() as *const c_char,
        signature: b"sh\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
];

static WL_DATA_OFFER_INTERFACE: WlInterface = WlInterface {
    name: b"wl_data_offer\0".as_ptr() as *const c_char,
    version: 3,
    method_count: 2,
    methods: WL_DATA_OFFER_METHODS.as_ptr(),
    event_count: 1,
    events: WL_DATA_OFFER_EVENTS.as_ptr(),
};

// -- wl_data_device --
static WL_DATA_DEVICE_OFFER_TYPES: WlTypes<1> = WlTypes([
    &WL_DATA_OFFER_INTERFACE as *const WlInterface,
]);

static WL_DATA_DEVICE_EVENTS: [WlMessage; 3] = [
    WlMessage {
        name: b"data_offer\0".as_ptr() as *const c_char,
        signature: b"n\0".as_ptr() as *const c_char,
        types: WL_DATA_DEVICE_OFFER_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"enter\0".as_ptr() as *const c_char,
        signature: b"uoff?oiff\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: WL_DATA_DEVICE_OFFER_TYPES.0.as_ptr(),
    },
];

static WL_DATA_DEVICE_SET_SELECTION_TYPES: WlTypes<1> = WlTypes([
    &WL_DATA_SOURCE_INTERFACE as *const WlInterface,
]);

static WL_DATA_DEVICE_METHODS: [WlMessage; 1] = [
    WlMessage {
        name: b"set_selection\0".as_ptr() as *const c_char,
        signature: b"?ou\0".as_ptr() as *const c_char,
        types: WL_DATA_DEVICE_SET_SELECTION_TYPES.0.as_ptr(),
    },
];

static WL_DATA_DEVICE_INTERFACE: WlInterface = WlInterface {
    name: b"wl_data_device\0".as_ptr() as *const c_char,
    version: 3,
    method_count: 1,
    methods: WL_DATA_DEVICE_METHODS.as_ptr(),
    event_count: 3,
    events: WL_DATA_DEVICE_EVENTS.as_ptr(),
};

// -- zwlr_data_control_offer_v1 --
static ZWLR_OFFER_EVENTS: [WlMessage; 1] = [WlMessage {
    name: b"offer\0".as_ptr() as *const c_char,
    signature: b"s\0".as_ptr() as *const c_char,
    types: NULL_TYPES.0.as_ptr(),
}];

static ZWLR_OFFER_METHODS: [WlMessage; 2] = [
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
    methods: ZWLR_OFFER_METHODS.as_ptr(),
    event_count: 1,
    events: ZWLR_OFFER_EVENTS.as_ptr(),
};

// -- zwlr_data_control_source_v1 --
static ZWLR_SOURCE_EVENTS: [WlMessage; 2] = [
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

static ZWLR_SOURCE_METHODS: [WlMessage; 2] = [
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
    methods: ZWLR_SOURCE_METHODS.as_ptr(),
    event_count: 2,
    events: ZWLR_SOURCE_EVENTS.as_ptr(),
};

// -- zwlr_data_control_device_v1 --
static ZWLR_DEVICE_DATA_OFFER_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_OFFER_V1_INTERFACE as *const WlInterface,
]);

static ZWLR_DEVICE_SELECTION_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_OFFER_V1_INTERFACE as *const WlInterface,
]);

static ZWLR_DEVICE_SET_SELECTION_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_SOURCE_V1_INTERFACE as *const WlInterface,
]);

static ZWLR_DEVICE_EVENTS: [WlMessage; 4] = [
    WlMessage {
        name: b"data_offer\0".as_ptr() as *const c_char,
        signature: b"n\0".as_ptr() as *const c_char,
        types: ZWLR_DEVICE_DATA_OFFER_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: ZWLR_DEVICE_SELECTION_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"finished\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"primary_selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: ZWLR_DEVICE_SELECTION_TYPES.0.as_ptr(),
    },
];

static ZWLR_DEVICE_METHODS: [WlMessage; 3] = [
    WlMessage {
        name: b"set_selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: ZWLR_DEVICE_SET_SELECTION_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"destroy\0".as_ptr() as *const c_char,
        signature: b"\0".as_ptr() as *const c_char,
        types: NULL_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"set_primary_selection\0".as_ptr() as *const c_char,
        signature: b"?o\0".as_ptr() as *const c_char,
        types: ZWLR_DEVICE_SET_SELECTION_TYPES.0.as_ptr(),
    },
];

static ZWLR_DATA_CONTROL_DEVICE_V1_INTERFACE: WlInterface = WlInterface {
    name: b"zwlr_data_control_device_v1\0".as_ptr() as *const c_char,
    version: 2,
    method_count: 3,
    methods: ZWLR_DEVICE_METHODS.as_ptr(),
    event_count: 4,
    events: ZWLR_DEVICE_EVENTS.as_ptr(),
};

// -- zwlr_data_control_manager_v1 --
static ZWLR_MANAGER_CREATE_SOURCE_TYPES: WlTypes<1> = WlTypes([
    &ZWLR_DATA_CONTROL_SOURCE_V1_INTERFACE as *const WlInterface,
]);

static ZWLR_MANAGER_GET_DEVICE_TYPES: WlTypes<2> = WlTypes([
    &ZWLR_DATA_CONTROL_DEVICE_V1_INTERFACE as *const WlInterface,
    &WL_SEAT_INTERFACE as *const WlInterface,
]);

static ZWLR_MANAGER_METHODS: [WlMessage; 3] = [
    WlMessage {
        name: b"create_data_source\0".as_ptr() as *const c_char,
        signature: b"n\0".as_ptr() as *const c_char,
        types: ZWLR_MANAGER_CREATE_SOURCE_TYPES.0.as_ptr(),
    },
    WlMessage {
        name: b"get_data_device\0".as_ptr() as *const c_char,
        signature: b"no\0".as_ptr() as *const c_char,
        types: ZWLR_MANAGER_GET_DEVICE_TYPES.0.as_ptr(),
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
    methods: ZWLR_MANAGER_METHODS.as_ptr(),
    event_count: 0,
    events: std::ptr::null(),
};

// -- xdg_wm_base --
static XDG_WM_BASE_EVENTS: [WlMessage; 1] = [WlMessage {
    name: b"ping\0".as_ptr() as *const c_char,
    signature: b"u\0".as_ptr() as *const c_char,
    types: NULL_TYPES.0.as_ptr(),
}];

static XDG_WM_BASE_INTERFACE: WlInterface = WlInterface {
    name: b"xdg_wm_base\0".as_ptr() as *const c_char,
    version: 2,
    method_count: 0,
    methods: std::ptr::null(),
    event_count: 1,
    events: XDG_WM_BASE_EVENTS.as_ptr(),
};

// -- xdg_surface --
static XDG_SURFACE_EVENTS: [WlMessage; 1] = [WlMessage {
    name: b"configure\0".as_ptr() as *const c_char,
    signature: b"u\0".as_ptr() as *const c_char,
    types: NULL_TYPES.0.as_ptr(),
}];

static XDG_SURFACE_INTERFACE: WlInterface = WlInterface {
    name: b"xdg_surface\0".as_ptr() as *const c_char,
    version: 2,
    method_count: 0,
    methods: std::ptr::null(),
    event_count: 1,
    events: XDG_SURFACE_EVENTS.as_ptr(),
};

// -- xdg_toplevel --
static XDG_TOPLEVEL_INTERFACE: WlInterface = WlInterface {
    name: b"xdg_toplevel\0".as_ptr() as *const c_char,
    version: 2,
    method_count: 0,
    methods: std::ptr::null(),
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

// zwlr listener types
type ZwlrDeviceDataOfferFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);
type ZwlrDeviceSelectionFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);
type ZwlrDeviceFinishedFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy);
type ZwlrDevicePrimarySelFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);

#[repr(C)]
struct ZwlrDeviceListener {
    data_offer: ZwlrDeviceDataOfferFn,
    selection: ZwlrDeviceSelectionFn,
    finished: ZwlrDeviceFinishedFn,
    primary_selection: ZwlrDevicePrimarySelFn,
}

type OfferOfferFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *const c_char);

#[repr(C)]
struct OfferListener {
    offer: OfferOfferFn,
}

type SourceSendFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *const c_char, i32);
type SourceCancelledFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy);

#[repr(C)]
struct ZwlrSourceListener {
    send: SourceSendFn,
    cancelled: SourceCancelledFn,
}

// core wl_data_source listener (events: target, send, cancelled)
type DataSourceTargetFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *const c_char);

#[repr(C)]
struct WlDataSourceListener {
    target: DataSourceTargetFn,
    send: SourceSendFn,
    cancelled: SourceCancelledFn,
}

// core wl_data_device listener (events: data_offer, enter, selection)
type WlDataDeviceDataOfferFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);
type WlDataDeviceEnterFn = unsafe extern "C" fn(
    *mut c_void, *mut WlProxy, u32, *mut WlProxy, i32, i32, *mut WlProxy,
);
type WlDataDeviceSelectionFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, *mut WlProxy);

#[repr(C)]
struct WlDataDeviceListener {
    data_offer: WlDataDeviceDataOfferFn,
    enter: WlDataDeviceEnterFn,
    selection: WlDataDeviceSelectionFn,
}

// xdg_wm_base listener
type XdgWmBasePingFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, u32);

#[repr(C)]
struct XdgWmBaseListener {
    ping: XdgWmBasePingFn,
}

// xdg_surface listener
type XdgSurfaceConfigureFn = unsafe extern "C" fn(*mut c_void, *mut WlProxy, u32);

#[repr(C)]
struct XdgSurfaceListener {
    configure: XdgSurfaceConfigureFn,
}

// ── Shared state for callbacks ──────────────────────────────────────────

enum BackendKind {
    Zwlr,
    Core,
}

struct WlState {
    // Registry globals
    seat: *mut WlProxy,
    zwlr_manager: *mut WlProxy,
    compositor: *mut WlProxy,
    data_device_manager: *mut WlProxy,
    xdg_wm_base: *mut WlProxy,
    // Active backend
    kind: BackendKind,
    // zwlr-specific
    zwlr_device: *mut WlProxy,
    // core-specific
    core_data_device: *mut WlProxy,
    surface: *mut WlProxy,
    xdg_surface: *mut WlProxy,
    xdg_toplevel: *mut WlProxy,
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

    match iface.to_bytes() {
        b"wl_seat" if state.seat.is_null() => {
            state.seat = wl_proxy_marshal_flags(
                registry, 0,
                &WL_SEAT_INTERFACE, version.min(7), 0,
                name,
                iface.as_ptr(),
                version.min(7),
                std::ptr::null::<c_void>(),
            );
        }
        b"zwlr_data_control_manager_v1" if state.zwlr_manager.is_null() => {
            state.zwlr_manager = wl_proxy_marshal_flags(
                registry, 0,
                &ZWLR_DATA_CONTROL_MANAGER_V1_INTERFACE, version.min(2), 0,
                name,
                iface.as_ptr(),
                version.min(2),
                std::ptr::null::<c_void>(),
            );
        }
        b"wl_compositor" if state.compositor.is_null() => {
            state.compositor = wl_proxy_marshal_flags(
                registry, 0,
                &WL_COMPOSITOR_INTERFACE, version.min(4), 0,
                name,
                iface.as_ptr(),
                version.min(4),
                std::ptr::null::<c_void>(),
            );
        }
        b"wl_data_device_manager" if state.data_device_manager.is_null() => {
            state.data_device_manager = wl_proxy_marshal_flags(
                registry, 0,
                &WL_DATA_DEVICE_MANAGER_INTERFACE, version.min(3), 0,
                name,
                iface.as_ptr(),
                version.min(3),
                std::ptr::null::<c_void>(),
            );
        }
        b"xdg_wm_base" if state.xdg_wm_base.is_null() => {
            state.xdg_wm_base = wl_proxy_marshal_flags(
                registry, 0,
                &XDG_WM_BASE_INTERFACE, version.min(2), 0,
                name,
                iface.as_ptr(),
                version.min(2),
                std::ptr::null::<c_void>(),
            );
        }
        _ => {}
    }
}

unsafe extern "C" fn registry_global_remove(
    _data: *mut c_void, _registry: *mut WlProxy, _name: u32,
) {}

// -- zwlr device callbacks --

unsafe extern "C" fn zwlr_device_data_offer(
    data: *mut c_void, _device: *mut WlProxy, offer: *mut WlProxy,
) {
    let state = &mut *(data as *mut WlState);
    static LISTENER: OfferListener = OfferListener { offer: offer_offer };
    wl_proxy_add_listener(
        offer,
        &LISTENER as *const _ as *const c_void,
        data,
    );
    let _ = state;
}

unsafe extern "C" fn zwlr_device_selection(
    data: *mut c_void, _device: *mut WlProxy, offer: *mut WlProxy,
) {
    let state = &mut *(data as *mut WlState);
    destroy_cur_offer(state);
    state.cur_offer_mimes.clear();
    state.cur_offer = offer;
}

unsafe extern "C" fn zwlr_device_finished(
    _data: *mut c_void, _device: *mut WlProxy,
) {}

unsafe extern "C" fn zwlr_device_primary_selection(
    _data: *mut c_void, _device: *mut WlProxy, _offer: *mut WlProxy,
) {}

// -- core wl_data_device callbacks --

unsafe extern "C" fn core_device_data_offer(
    data: *mut c_void, _device: *mut WlProxy, offer: *mut WlProxy,
) {
    static LISTENER: OfferListener = OfferListener { offer: offer_offer };
    wl_proxy_add_listener(
        offer,
        &LISTENER as *const _ as *const c_void,
        data,
    );
}

unsafe extern "C" fn core_device_enter(
    _data: *mut c_void, _device: *mut WlProxy, _serial: u32,
    _surface: *mut WlProxy, _x: i32, _y: i32, _offer: *mut WlProxy,
) {}

unsafe extern "C" fn core_device_selection(
    data: *mut c_void, _device: *mut WlProxy, offer: *mut WlProxy,
) {
    let state = &mut *(data as *mut WlState);
    destroy_cur_offer(state);
    state.cur_offer_mimes.clear();
    state.cur_offer = offer;
}

// -- shared offer callback --

unsafe extern "C" fn offer_offer(
    data: *mut c_void, _offer: *mut WlProxy, mime: *const c_char,
) {
    let state = &mut *(data as *mut WlState);
    if let Ok(s) = CStr::from_ptr(mime).to_str() {
        state.cur_offer_mimes.push(s.to_string());
    }
}

// -- source callbacks (shared between zwlr and core) --

unsafe extern "C" fn source_send(
    data: *mut c_void, _source: *mut WlProxy, mime_type: *const c_char, fd: i32,
) {
    let state = &*(data as *const WlState);
    let mime = CStr::from_ptr(mime_type);

    if let Ok(m) = mime.to_str() {
        match m {
            "text/plain" | "text/plain;charset=utf-8" | "UTF8_STRING" | "STRING" => {
                if let Some(ref text) = state.text {
                    write_all_fd(fd, text.as_bytes());
                }
            }
            "image/png" => {
                if let Some(ref png) = state.png {
                    write_all_fd(fd, png);
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
        destroy_proxy_opcode(state.source, 1);
        state.source = std::ptr::null_mut();
    }
}

unsafe extern "C" fn source_target(
    _data: *mut c_void, _source: *mut WlProxy, _mime: *const c_char,
) {}

// -- xdg callbacks --

unsafe extern "C" fn xdg_wm_base_ping(
    _data: *mut c_void, wm_base: *mut WlProxy, serial: u32,
) {
    // pong opcode = 1 on xdg_wm_base
    wl_proxy_marshal_flags(
        wm_base, 1,
        std::ptr::null(), wl_proxy_get_version(wm_base), 0,
        serial,
    );
}

unsafe extern "C" fn xdg_surface_configure(
    _data: *mut c_void, xdg_surface: *mut WlProxy, serial: u32,
) {
    // ack_configure opcode = 1 on xdg_surface
    wl_proxy_marshal_flags(
        xdg_surface, 1,
        std::ptr::null(), wl_proxy_get_version(xdg_surface), 0,
        serial,
    );
}

// ── Helper functions ────────────────────────────────────────────────────

unsafe fn write_all_fd(fd: RawFd, data: &[u8]) {
    let mut written = 0;
    while written < data.len() {
        let n = libc::write(
            fd,
            data[written..].as_ptr() as *const c_void,
            data.len() - written,
        );
        if n <= 0 { break; }
        written += n as usize;
    }
}

unsafe fn destroy_proxy_opcode(proxy: *mut WlProxy, opcode: u32) {
    wl_proxy_marshal_flags(
        proxy, opcode,
        std::ptr::null(), 0, WL_MARSHAL_FLAG_DESTROY,
    );
}

unsafe fn destroy_cur_offer(state: &mut WlState) {
    if !state.cur_offer.is_null() {
        match state.kind {
            BackendKind::Zwlr => destroy_proxy_opcode(state.cur_offer, 1),
            BackendKind::Core => wl_proxy_destroy(state.cur_offer),
        }
        state.cur_offer = std::ptr::null_mut();
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
    unsafe {
        let display = wl_display_connect(std::ptr::null());
        if display.is_null() {
            return None;
        }
        wl_display_disconnect(display);
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

// ── Wayland thread ──────────────────────────────────────────────────────

unsafe fn wayland_thread(rx: mpsc::Receiver<WlCmd>, wake_rd: RawFd) {
    let display = wl_display_connect(std::ptr::null());
    if display.is_null() {
        return;
    }

    let mut state = WlState {
        seat: std::ptr::null_mut(),
        zwlr_manager: std::ptr::null_mut(),
        compositor: std::ptr::null_mut(),
        data_device_manager: std::ptr::null_mut(),
        xdg_wm_base: std::ptr::null_mut(),
        kind: BackendKind::Zwlr,
        zwlr_device: std::ptr::null_mut(),
        core_data_device: std::ptr::null_mut(),
        surface: std::ptr::null_mut(),
        xdg_surface: std::ptr::null_mut(),
        xdg_toplevel: std::ptr::null_mut(),
        cur_offer: std::ptr::null_mut(),
        cur_offer_mimes: Vec::new(),
        text: None,
        png: None,
        source: std::ptr::null_mut(),
        sequence: 0,
        owns: false,
    };

    // Get registry
    let version = wl_proxy_get_version(display as *mut WlProxy);
    let registry = wl_proxy_marshal_flags(
        display as *mut WlProxy, 1,
        &WL_REGISTRY_INTERFACE, version, 0,
        std::ptr::null::<c_void>(),
    );
    if registry.is_null() {
        wl_display_disconnect(display);
        return;
    }

    static REG_LISTENER: RegistryListener = RegistryListener {
        global: registry_global,
        global_remove: registry_global_remove,
    };
    wl_proxy_add_listener(
        registry,
        &REG_LISTENER as *const _ as *const c_void,
        &mut state as *mut _ as *mut c_void,
    );

    wl_display_roundtrip(display);

    if state.seat.is_null() {
        wl_proxy_destroy(registry);
        wl_display_disconnect(display);
        return;
    }

    // Try zwlr path first, fall back to core wl_data_device
    if !state.zwlr_manager.is_null() {
        if !init_zwlr_backend(&mut state, display) {
            wl_proxy_destroy(registry);
            wl_display_disconnect(display);
            return;
        }
    } else if !state.data_device_manager.is_null() {
        if !init_core_backend(&mut state, display) {
            wl_proxy_destroy(registry);
            wl_display_disconnect(display);
            return;
        }
    } else {
        wl_proxy_destroy(registry);
        wl_display_disconnect(display);
        return;
    }

    wl_display_roundtrip(display);

    let wl_fd = wl_display_get_fd(display);

    loop {
        let mut fds = [
            libc::pollfd { fd: wl_fd, events: libc::POLLIN, revents: 0 },
            libc::pollfd { fd: wake_rd, events: libc::POLLIN, revents: 0 },
        ];
        libc::poll(fds.as_mut_ptr(), 2, -1);

        if fds[1].revents & libc::POLLIN != 0 {
            let mut buf = [0u8; 64];
            while libc::read(wake_rd, buf.as_mut_ptr() as *mut c_void, buf.len()) > 0 {}
        }

        if fds[0].revents & libc::POLLIN != 0 {
            wl_display_dispatch(display);
        }

        while let Ok(cmd) = rx.try_recv() {
            process_command(cmd, &mut state, display);
        }
    }
}

unsafe fn init_zwlr_backend(state: &mut WlState, display: *mut WlDisplay) -> bool {
    state.kind = BackendKind::Zwlr;

    let device = wl_proxy_marshal_flags(
        state.zwlr_manager, 1,
        &ZWLR_DATA_CONTROL_DEVICE_V1_INTERFACE,
        wl_proxy_get_version(state.zwlr_manager), 0,
        std::ptr::null::<c_void>(),
        state.seat,
    );
    if device.is_null() {
        return false;
    }
    state.zwlr_device = device;

    static DEV_LISTENER: ZwlrDeviceListener = ZwlrDeviceListener {
        data_offer: zwlr_device_data_offer,
        selection: zwlr_device_selection,
        finished: zwlr_device_finished,
        primary_selection: zwlr_device_primary_selection,
    };
    wl_proxy_add_listener(
        device,
        &DEV_LISTENER as *const _ as *const c_void,
        state as *mut _ as *mut c_void,
    );

    wl_display_roundtrip(display);
    true
}

unsafe fn init_core_backend(state: &mut WlState, display: *mut WlDisplay) -> bool {
    state.kind = BackendKind::Core;

    if state.compositor.is_null() || state.xdg_wm_base.is_null() {
        return false;
    }

    // Listen for xdg_wm_base ping
    static WM_BASE_LISTENER: XdgWmBaseListener = XdgWmBaseListener {
        ping: xdg_wm_base_ping,
    };
    wl_proxy_add_listener(
        state.xdg_wm_base,
        &WM_BASE_LISTENER as *const _ as *const c_void,
        state as *mut _ as *mut c_void,
    );

    // wl_data_device_manager.get_data_device(seat) — opcode 1
    let data_device = wl_proxy_marshal_flags(
        state.data_device_manager, 1,
        &WL_DATA_DEVICE_INTERFACE,
        wl_proxy_get_version(state.data_device_manager), 0,
        std::ptr::null::<c_void>(),
        state.seat,
    );
    if data_device.is_null() {
        return false;
    }
    state.core_data_device = data_device;

    static DEV_LISTENER: WlDataDeviceListener = WlDataDeviceListener {
        data_offer: core_device_data_offer,
        enter: core_device_enter,
        selection: core_device_selection,
    };
    wl_proxy_add_listener(
        data_device,
        &DEV_LISTENER as *const _ as *const c_void,
        state as *mut _ as *mut c_void,
    );

    // Create a wl_surface — wl_compositor.create_surface (opcode 0)
    let surface = wl_proxy_marshal_flags(
        state.compositor, 0,
        &WL_SURFACE_INTERFACE,
        wl_proxy_get_version(state.compositor), 0,
        std::ptr::null::<c_void>(),
    );
    if surface.is_null() {
        return false;
    }
    state.surface = surface;

    // xdg_wm_base.get_xdg_surface(surface) — opcode 0
    let xdg_surface = wl_proxy_marshal_flags(
        state.xdg_wm_base, 0,
        &XDG_SURFACE_INTERFACE,
        wl_proxy_get_version(state.xdg_wm_base), 0,
        std::ptr::null::<c_void>(),
        surface,
    );
    if xdg_surface.is_null() {
        return false;
    }
    state.xdg_surface = xdg_surface;

    static XDG_SURFACE_LISTENER: XdgSurfaceListener = XdgSurfaceListener {
        configure: xdg_surface_configure,
    };
    wl_proxy_add_listener(
        xdg_surface,
        &XDG_SURFACE_LISTENER as *const _ as *const c_void,
        state as *mut _ as *mut c_void,
    );

    // xdg_surface.get_toplevel() — opcode 0 on xdg_surface
    let toplevel = wl_proxy_marshal_flags(
        xdg_surface, 0,
        &XDG_TOPLEVEL_INTERFACE,
        wl_proxy_get_version(xdg_surface), 0,
        std::ptr::null::<c_void>(),
    );
    if toplevel.is_null() {
        return false;
    }
    state.xdg_toplevel = toplevel;

    // Commit the surface to map it (wl_surface.commit — opcode 6)
    wl_proxy_marshal_flags(
        surface, 6,
        std::ptr::null(), wl_proxy_get_version(surface), 0,
    );

    wl_display_roundtrip(display);

    // Commit again after configure ack
    wl_proxy_marshal_flags(
        surface, 6,
        std::ptr::null(), wl_proxy_get_version(surface), 0,
    );

    wl_display_roundtrip(display);
    true
}

// ── Command processing ──────────────────────────────────────────────────

unsafe fn process_command(cmd: WlCmd, s: &mut WlState, display: *mut WlDisplay) {
    match cmd {
        WlCmd::Clear { resp } => {
            destroy_source_obj(s);
            s.text = None;
            s.png = None;
            s.owns = false;
            set_selection_null(s);
            wl_display_roundtrip(display);
            s.sequence += 1;
            let _ = resp.send(true);
        }

        WlCmd::HasText { resp } => {
            if s.owns && s.text.is_some() {
                let _ = resp.send(true);
                return;
            }
            wl_display_roundtrip(display);
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
            wl_display_roundtrip(display);
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
            destroy_source_obj(s);
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
            wl_display_roundtrip(display);
            let has = s.cur_offer_mimes.iter().any(|m| m == "image/png");
            let _ = resp.send(has);
        }

        WlCmd::GetImage { resp } => {
            if s.owns {
                let result = s.png.as_ref().and_then(|p| super::png_to_argb(p));
                let _ = resp.send(result);
                return;
            }
            wl_display_roundtrip(display);
            if s.cur_offer.is_null() {
                let _ = resp.send(None);
                return;
            }
            let result = receive_mime(s, display, "image/png")
                .and_then(|b| super::png_to_argb(&b));
            let _ = resp.send(result);
        }

        WlCmd::SetImage { width, height, data, resp } => {
            destroy_source_obj(s);
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

unsafe fn set_selection_null(s: &mut WlState) {
    match s.kind {
        BackendKind::Zwlr => {
            // zwlr_data_control_device_v1.set_selection(null) — opcode 0
            wl_proxy_marshal_flags(
                s.zwlr_device, 0,
                std::ptr::null(), wl_proxy_get_version(s.zwlr_device), 0,
                std::ptr::null::<c_void>(),
            );
        }
        BackendKind::Core => {
            // wl_data_device.set_selection(null, serial) — opcode 0
            wl_proxy_marshal_flags(
                s.core_data_device, 0,
                std::ptr::null(), wl_proxy_get_version(s.core_data_device), 0,
                std::ptr::null::<c_void>(),
                0u32,
            );
        }
    }
}

unsafe fn destroy_source_obj(s: &mut WlState) {
    if !s.source.is_null() {
        match s.kind {
            BackendKind::Zwlr => destroy_proxy_opcode(s.source, 1),
            BackendKind::Core => destroy_proxy_opcode(s.source, 1),
        }
        s.source = std::ptr::null_mut();
    }
}

unsafe fn create_and_set_source(
    s: &mut WlState, display: *mut WlDisplay, mimes: &[&str],
) -> bool {
    match s.kind {
        BackendKind::Zwlr => create_and_set_source_zwlr(s, display, mimes),
        BackendKind::Core => create_and_set_source_core(s, display, mimes),
    }
}

unsafe fn create_and_set_source_zwlr(
    s: &mut WlState, display: *mut WlDisplay, mimes: &[&str],
) -> bool {
    // manager opcode 0 = create_data_source
    let source = wl_proxy_marshal_flags(
        s.zwlr_manager, 0,
        &ZWLR_DATA_CONTROL_SOURCE_V1_INTERFACE,
        wl_proxy_get_version(s.zwlr_manager), 0,
        std::ptr::null::<c_void>(),
    );
    if source.is_null() {
        return false;
    }

    static SRC_LISTENER: ZwlrSourceListener = ZwlrSourceListener {
        send: source_send,
        cancelled: source_cancelled,
    };
    wl_proxy_add_listener(
        source,
        &SRC_LISTENER as *const _ as *const c_void,
        s as *mut _ as *mut c_void,
    );

    for mime in mimes {
        let c_mime = CString::new(*mime).unwrap();
        wl_proxy_marshal_flags(
            source, 0,
            std::ptr::null(), wl_proxy_get_version(source), 0,
            c_mime.as_ptr(),
        );
    }

    s.source = source;

    // device opcode 0 = set_selection
    wl_proxy_marshal_flags(
        s.zwlr_device, 0,
        std::ptr::null(), wl_proxy_get_version(s.zwlr_device), 0,
        source,
    );

    wl_display_roundtrip(display);
    true
}

unsafe fn create_and_set_source_core(
    s: &mut WlState, display: *mut WlDisplay, mimes: &[&str],
) -> bool {
    // wl_data_device_manager.create_data_source() — opcode 0
    let source = wl_proxy_marshal_flags(
        s.data_device_manager, 0,
        &WL_DATA_SOURCE_INTERFACE,
        wl_proxy_get_version(s.data_device_manager), 0,
        std::ptr::null::<c_void>(),
    );
    if source.is_null() {
        return false;
    }

    static SRC_LISTENER: WlDataSourceListener = WlDataSourceListener {
        target: source_target,
        send: source_send,
        cancelled: source_cancelled,
    };
    wl_proxy_add_listener(
        source,
        &SRC_LISTENER as *const _ as *const c_void,
        s as *mut _ as *mut c_void,
    );

    // wl_data_source.offer(mime) — opcode 0
    for mime in mimes {
        let c_mime = CString::new(*mime).unwrap();
        wl_proxy_marshal_flags(
            source, 0,
            std::ptr::null(), wl_proxy_get_version(source), 0,
            c_mime.as_ptr(),
        );
    }

    s.source = source;

    // wl_data_device.set_selection(source, serial) — opcode 0
    wl_proxy_marshal_flags(
        s.core_data_device, 0,
        std::ptr::null(), wl_proxy_get_version(s.core_data_device), 0,
        source,
        0u32,
    );

    wl_display_roundtrip(display);
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

    let c_mime = CString::new(mime).ok()?;

    match s.kind {
        BackendKind::Zwlr => {
            // zwlr offer opcode 0 = receive(mime_type, fd)
            wl_proxy_marshal_flags(
                s.cur_offer, 0,
                std::ptr::null(), wl_proxy_get_version(s.cur_offer), 0,
                c_mime.as_ptr(),
                pipe_wr,
            );
        }
        BackendKind::Core => {
            // wl_data_offer.receive(mime_type, fd) — opcode 1
            wl_proxy_marshal_flags(
                s.cur_offer, 1,
                std::ptr::null(), wl_proxy_get_version(s.cur_offer), 0,
                c_mime.as_ptr(),
                pipe_wr,
            );
        }
    }

    libc::close(pipe_wr);
    wl_display_roundtrip(display);

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
