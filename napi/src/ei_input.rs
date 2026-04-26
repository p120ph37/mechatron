#![allow(non_upper_case_globals, dead_code)]

use std::ffi::{c_char, c_int, c_void};
use std::os::unix::io::RawFd;
use std::sync::{mpsc, Mutex, Once};

#[path = "ei.rs"]
mod ei;
use ei::*;

#[path = "dbus_portal.rs"]
mod dbus_portal;

// ── Keysym → evdev scancode mapping ───────────────────────────────────

fn keysym_to_evdev(keysym: u32) -> Option<u32> {
    match keysym {
        // Latin-1 printable → evdev
        0x0020 => Some(57),  // space
        0x0027 => Some(40),  // apostrophe
        0x002C => Some(51),  // comma
        0x002D => Some(12),  // minus
        0x002E => Some(52),  // period
        0x002F => Some(53),  // slash
        0x0030 => Some(11),  // 0
        0x0031 => Some(2),   // 1
        0x0032 => Some(3),   // 2
        0x0033 => Some(4),   // 3
        0x0034 => Some(5),   // 4
        0x0035 => Some(6),   // 5
        0x0036 => Some(7),   // 6
        0x0037 => Some(8),   // 7
        0x0038 => Some(9),   // 8
        0x0039 => Some(10),  // 9
        0x003B => Some(39),  // semicolon
        0x003D => Some(13),  // equal
        0x005B => Some(26),  // bracketleft
        0x005C => Some(43),  // backslash
        0x005D => Some(27),  // bracketright
        0x0060 => Some(41),  // grave
        0x0061..=0x007A => {
            // a-z → KEY_A(30)..KEY_Z
            static MAP: [u32; 26] = [
                30,48,46,32,18,33,34,35,23,36,37,38,50,49,24,25,16,19,31,20,22,47,17,45,21,44
            ];
            Some(MAP[(keysym - 0x0061) as usize])
        }
        // Function/special keys (XK_* keysyms)
        0xFF08 => Some(14),  // BackSpace
        0xFF09 => Some(15),  // Tab
        0xFF0D => Some(28),  // Return
        0xFF13 => Some(119), // Pause
        0xFF14 => Some(70),  // Scroll_Lock
        0xFF1B => Some(1),   // Escape
        0xFF50 => Some(102), // Home
        0xFF51 => Some(105), // Left
        0xFF52 => Some(103), // Up
        0xFF53 => Some(106), // Right
        0xFF54 => Some(108), // Down
        0xFF55 => Some(104), // Page_Up
        0xFF56 => Some(109), // Page_Down
        0xFF57 => Some(107), // End
        0xFF61 => Some(99),  // Print
        0xFF63 => Some(110), // Insert
        0xFF7F => Some(69),  // Num_Lock
        0xFF8D => Some(96),  // KP_Enter
        0xFFAA => Some(55),  // KP_Multiply
        0xFFAB => Some(78),  // KP_Add
        0xFFAD => Some(74),  // KP_Subtract
        0xFFAE => Some(83),  // KP_Decimal
        0xFFAF => Some(98),  // KP_Divide
        0xFFB0 => Some(82),  // KP_0
        0xFFB1 => Some(79),  // KP_1
        0xFFB2 => Some(80),  // KP_2
        0xFFB3 => Some(81),  // KP_3
        0xFFB4 => Some(75),  // KP_4
        0xFFB5 => Some(76),  // KP_5
        0xFFB6 => Some(77),  // KP_6
        0xFFB7 => Some(71),  // KP_7
        0xFFB8 => Some(72),  // KP_8
        0xFFB9 => Some(73),  // KP_9
        0xFFBE => Some(59),  // F1
        0xFFBF => Some(60),  // F2
        0xFFC0 => Some(61),  // F3
        0xFFC1 => Some(62),  // F4
        0xFFC2 => Some(63),  // F5
        0xFFC3 => Some(64),  // F6
        0xFFC4 => Some(65),  // F7
        0xFFC5 => Some(66),  // F8
        0xFFC6 => Some(67),  // F9
        0xFFC7 => Some(68),  // F10
        0xFFC8 => Some(87),  // F11
        0xFFC9 => Some(88),  // F12
        0xFFE1 => Some(42),  // Shift_L
        0xFFE2 => Some(54),  // Shift_R
        0xFFE3 => Some(29),  // Control_L
        0xFFE4 => Some(97),  // Control_R
        0xFFE5 => Some(58),  // Caps_Lock
        0xFFE9 => Some(56),  // Alt_L
        0xFFEA => Some(100), // Alt_R
        0xFFEB => Some(125), // Super_L
        0xFFEC => Some(126), // Super_R
        0xFFFF => Some(111), // Delete
        _ => None,
    }
}

// Button constants (matching mouse.rs)
const BUTTON_LEFT: i32 = 0;
const BUTTON_MID: i32 = 1;
const BUTTON_RIGHT: i32 = 2;

fn button_to_evdev(button: i32) -> Option<u32> {
    match button {
        BUTTON_LEFT => Some(0x110),  // BTN_LEFT
        BUTTON_MID => Some(0x112),   // BTN_MIDDLE
        BUTTON_RIGHT => Some(0x111), // BTN_RIGHT
        3 => Some(0x113),            // BTN_SIDE (X1)
        4 => Some(0x114),            // BTN_EXTRA (X2)
        _ => None,
    }
}

// ── Command channel ───────────────────────────────────────────────────

enum EiCmd {
    Key { keycode: u32, press: bool, resp: mpsc::Sender<bool> },
    Button { button: u32, press: bool, resp: mpsc::Sender<bool> },
    ScrollDiscrete { dx: i32, dy: i32, resp: mpsc::Sender<bool> },
    MotionAbsolute { x: f64, y: f64, resp: mpsc::Sender<bool> },
}

struct EiHandle {
    tx: Mutex<mpsc::Sender<EiCmd>>,
    wake_wr: RawFd,
}

impl EiHandle {
    fn send(&self, cmd: EiCmd) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(cmd);
        }
        unsafe { libc::write(self.wake_wr, b"\x01" as *const _ as *const c_void, 1); }
    }

    fn request<T>(&self, f: impl FnOnce(mpsc::Sender<T>) -> EiCmd) -> Option<T> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(f(resp_tx));
        resp_rx.recv().ok()
    }
}

static HANDLE_INIT: Once = Once::new();
static mut HANDLE_PTR: *const EiHandle = std::ptr::null();

fn get_handle() -> Option<&'static EiHandle> {
    unsafe {
        HANDLE_INIT.call_once(|| {
            if let Some(h) = try_init() {
                HANDLE_PTR = Box::into_raw(Box::new(h));
            }
        });
        HANDLE_PTR.as_ref()
    }
}

fn try_init() -> Option<EiHandle> {
    unsafe {
        let ei_fns = load_ei()?;

        // Check Wayland session
        let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok()
            || std::env::var("XDG_SESSION_TYPE").ok().map_or(false, |v| v == "wayland");
        if !is_wayland { return None; }

        // Get EIS fd from portal
        let eis_fd = dbus_portal::portal_get_eis_fd()?;

        let mut pipe_fds = [0 as RawFd; 2];
        if libc::pipe(pipe_fds.as_mut_ptr()) != 0 {
            libc::close(eis_fd);
            return None;
        }
        let pipe_rd = pipe_fds[0];
        let pipe_wr = pipe_fds[1];
        let flags = libc::fcntl(pipe_rd, libc::F_GETFL);
        libc::fcntl(pipe_rd, libc::F_SETFL, flags | libc::O_NONBLOCK);

        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || ei_thread(ei_fns, eis_fd, rx, pipe_rd));

        Some(EiHandle { tx: Mutex::new(tx), wake_wr: pipe_wr })
    }
}

// ── EI background thread ──────────────────────────────────────────────

unsafe fn ei_thread(
    fns: &'static EiFns, eis_fd: RawFd,
    rx: mpsc::Receiver<EiCmd>, wake_rd: RawFd,
) {
    let ei = (fns.ei_new_sender)(std::ptr::null_mut());
    if ei.is_null() { return; }

    let name = b"mechatron\0";
    (fns.ei_configure_name)(ei, name.as_ptr() as *const c_char);

    if (fns.ei_setup_backend_fd)(ei, eis_fd) != 0 {
        (fns.ei_unref)(ei);
        return;
    }

    let ei_fd = (fns.ei_get_fd)(ei);
    let mut device: *mut c_void = std::ptr::null_mut();
    let mut seq: u32 = 0;
    let mut ready = false;

    // Process initial events to get device
    for _ in 0..100 {
        let mut fds = [
            libc::pollfd { fd: ei_fd, events: libc::POLLIN, revents: 0 },
        ];
        libc::poll(fds.as_mut_ptr(), 1, 500);
        if fds[0].revents & libc::POLLIN == 0 { continue; }

        (fns.ei_dispatch)(ei);
        loop {
            let event = (fns.ei_get_event)(ei);
            if event.is_null() { break; }
            let etype = (fns.ei_event_get_type)(event);
            match etype {
                EI_EVENT_SEAT_ADDED => {
                    let seat = (fns.ei_event_get_seat)(event);
                    if !seat.is_null() {
                        // Bind all capabilities via variadic fn
                        type BindFn = unsafe extern "C" fn(
                            *mut c_void, c_int, c_int, c_int, c_int, c_int, *const c_void,
                        );
                        let bind: BindFn = std::mem::transmute(fns.ei_seat_bind_capabilities);
                        bind(seat, CAP_POINTER, CAP_POINTER_ABSOLUTE, CAP_KEYBOARD,
                             CAP_BUTTON, CAP_SCROLL, std::ptr::null());
                    }
                }
                EI_EVENT_DEVICE_ADDED => {
                    let dev = (fns.ei_event_get_device)(event);
                    if !dev.is_null() {
                        device = (fns.ei_device_ref)(dev);
                    }
                }
                EI_EVENT_DEVICE_RESUMED => {
                    if !device.is_null() {
                        seq += 1;
                        (fns.ei_device_start_emulating)(device, seq);
                        ready = true;
                    }
                }
                _ => {}
            }
            (fns.ei_event_unref)(event);
            if ready { break; }
        }
        if ready { break; }
    }

    if !ready || device.is_null() {
        (fns.ei_unref)(ei);
        return;
    }

    // Main event loop
    loop {
        let mut fds = [
            libc::pollfd { fd: ei_fd, events: libc::POLLIN, revents: 0 },
            libc::pollfd { fd: wake_rd, events: libc::POLLIN, revents: 0 },
        ];
        libc::poll(fds.as_mut_ptr(), 2, -1);

        // Drain wake pipe
        if fds[1].revents & libc::POLLIN != 0 {
            let mut buf = [0u8; 64];
            while libc::read(wake_rd, buf.as_mut_ptr() as *mut c_void, buf.len()) > 0 {}
        }

        // Dispatch EI events (handle pause/resume)
        if fds[0].revents & libc::POLLIN != 0 {
            (fns.ei_dispatch)(ei);
            loop {
                let event = (fns.ei_get_event)(ei);
                if event.is_null() { break; }
                let etype = (fns.ei_event_get_type)(event);
                match etype {
                    EI_EVENT_DEVICE_PAUSED => { ready = false; }
                    EI_EVENT_DEVICE_RESUMED => {
                        seq += 1;
                        (fns.ei_device_start_emulating)(device, seq);
                        ready = true;
                    }
                    EI_EVENT_DEVICE_REMOVED | EI_EVENT_DISCONNECT => {
                        (fns.ei_event_unref)(event);
                        return;
                    }
                    _ => {}
                }
                (fns.ei_event_unref)(event);
            }
        }

        // Process commands
        while let Ok(cmd) = rx.try_recv() {
            let ok = ready && !device.is_null();
            match cmd {
                EiCmd::Key { keycode, press, resp } => {
                    if ok {
                        (fns.ei_device_keyboard_key)(device, keycode, press);
                        (fns.ei_device_frame)(device, (fns.ei_now)(ei));
                    }
                    let _ = resp.send(ok);
                }
                EiCmd::Button { button, press, resp } => {
                    if ok {
                        (fns.ei_device_button_button)(device, button, press);
                        (fns.ei_device_frame)(device, (fns.ei_now)(ei));
                    }
                    let _ = resp.send(ok);
                }
                EiCmd::ScrollDiscrete { dx, dy, resp } => {
                    if ok {
                        (fns.ei_device_scroll_discrete)(device, dx, dy);
                        (fns.ei_device_frame)(device, (fns.ei_now)(ei));
                    }
                    let _ = resp.send(ok);
                }
                EiCmd::MotionAbsolute { x, y, resp } => {
                    if ok {
                        (fns.ei_device_pointer_motion_absolute)(device, x, y);
                        (fns.ei_device_frame)(device, (fns.ei_now)(ei));
                    }
                    let _ = resp.send(ok);
                }
            }
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────

pub fn is_available() -> bool {
    get_handle().is_some()
}

pub fn ei_key(keysym: u32, press: bool) -> bool {
    let evdev = match keysym_to_evdev(keysym) {
        Some(k) => k,
        None => return false,
    };
    get_handle()
        .and_then(|h| h.request(|resp| EiCmd::Key { keycode: evdev, press, resp }))
        .unwrap_or(false)
}

pub fn ei_button(button: i32, press: bool) -> bool {
    let evdev = match button_to_evdev(button) {
        Some(b) => b,
        None => return false,
    };
    get_handle()
        .and_then(|h| h.request(|resp| EiCmd::Button { button: evdev, press, resp }))
        .unwrap_or(false)
}

pub fn ei_scroll_discrete(dx: i32, dy: i32) -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| EiCmd::ScrollDiscrete { dx: dx * 120, dy: dy * 120, resp }))
        .unwrap_or(false)
}

pub fn ei_motion_absolute(x: f64, y: f64) -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| EiCmd::MotionAbsolute { x, y, resp }))
        .unwrap_or(false)
}
