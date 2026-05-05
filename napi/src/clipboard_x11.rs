use std::ffi::{c_char, c_int, c_long, c_uint, c_ulong, c_void};
use std::os::unix::io::RawFd;
use std::sync::{mpsc, Mutex, Once};
use std::time::{Duration, Instant};

use crate::x11::*;

const SELECTION_CLEAR: c_int = 29;
const SELECTION_REQUEST: c_int = 30;
const SELECTION_NOTIFY: c_int = 31;
const PROPERTY_CHANGE_MASK: c_long = 1 << 22;

extern "C" {
    fn XCreateSimpleWindow(
        display: *mut Display, parent: Window,
        x: c_int, y: c_int, width: c_uint, height: c_uint,
        border_width: c_uint, border: c_ulong, background: c_ulong,
    ) -> Window;
    fn XSetSelectionOwner(
        display: *mut Display, selection: Atom, owner: Window, time: Time,
    );
    fn XGetSelectionOwner(display: *mut Display, selection: Atom) -> Window;
    fn XConvertSelection(
        display: *mut Display, selection: Atom, target: Atom, property: Atom,
        requestor: Window, time: Time,
    ) -> c_int;
    fn XNextEvent(display: *mut Display, event_return: *mut XEvent) -> c_int;
    fn XPending(display: *mut Display) -> c_int;
    fn XSelectInput(display: *mut Display, w: Window, event_mask: c_long) -> c_int;
    fn XDeleteProperty(display: *mut Display, w: Window, property: Atom) -> c_int;
    fn XConnectionNumber(display: *mut Display) -> c_int;
}

#[repr(C)]
struct XSelectionRequestEvent {
    type_: c_int,
    serial: c_ulong,
    send_event: Bool,
    display: *mut Display,
    owner: Window,
    requestor: Window,
    selection: Atom,
    target: Atom,
    property: Atom,
    time: Time,
}

#[repr(C)]
struct XSelectionEvent {
    type_: c_int,
    serial: c_ulong,
    send_event: Bool,
    display: *mut Display,
    requestor: Window,
    selection: Atom,
    target: Atom,
    property: Atom,
    time: Time,
}

struct ClipAtoms {
    clipboard: Atom,
    utf8_string: Atom,
    string: Atom,
    targets: Atom,
    atom: Atom,
    image_png: Atom,
    timestamp: Atom,
    integer: Atom,
    mechatron_sel: Atom,
}

impl ClipAtoms {
    unsafe fn intern(display: *mut Display) -> Self {
        Self {
            clipboard: XInternAtom(display, b"CLIPBOARD\0".as_ptr() as *const c_char, False_),
            utf8_string: XInternAtom(display, b"UTF8_STRING\0".as_ptr() as *const c_char, False_),
            string: XInternAtom(display, b"STRING\0".as_ptr() as *const c_char, False_),
            targets: XInternAtom(display, b"TARGETS\0".as_ptr() as *const c_char, False_),
            atom: XInternAtom(display, b"ATOM\0".as_ptr() as *const c_char, False_),
            image_png: XInternAtom(display, b"image/png\0".as_ptr() as *const c_char, False_),
            timestamp: XInternAtom(display, b"TIMESTAMP\0".as_ptr() as *const c_char, False_),
            integer: XInternAtom(display, b"INTEGER\0".as_ptr() as *const c_char, False_),
            mechatron_sel: XInternAtom(display, b"_MECHATRON_SEL\0".as_ptr() as *const c_char, False_),
        }
    }
}

enum ClipCmd {
    Clear { resp: mpsc::Sender<bool> },
    HasText { resp: mpsc::Sender<bool> },
    GetText { resp: mpsc::Sender<String> },
    SetText { text: String, resp: mpsc::Sender<bool> },
    HasImage { resp: mpsc::Sender<bool> },
    GetImage { resp: mpsc::Sender<Option<(u32, u32, Vec<u32>)>> },
    SetImage { width: u32, height: u32, data: Vec<u32>, resp: mpsc::Sender<bool> },
    GetSequence { resp: mpsc::Sender<f64> },
}

struct ClipState {
    display: *mut Display,
    window: Window,
    atoms: ClipAtoms,
    text: Option<String>,
    png: Option<Vec<u8>>,
    sequence: u64,
    owns: bool,
}

struct ClipHandle {
    tx: Mutex<mpsc::Sender<ClipCmd>>,
    wake_wr: RawFd,
}

impl ClipHandle {
    fn send(&self, cmd: ClipCmd) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(cmd);
        }
        unsafe {
            libc::write(self.wake_wr, b"\x01" as *const _ as *const c_void, 1);
        }
    }

    fn request<T>(&self, f: impl FnOnce(mpsc::Sender<T>) -> ClipCmd) -> Option<T> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(f(resp_tx));
        resp_rx.recv().ok()
    }
}

static INIT: Once = Once::new();
static mut HANDLE: *const ClipHandle = std::ptr::null();

fn get_handle() -> Option<&'static ClipHandle> {
    unsafe {
        INIT.call_once(|| {
            if let Some(h) = try_init() {
                HANDLE = Box::into_raw(Box::new(h));
            }
        });
        HANDLE.as_ref()
    }
}

fn try_init() -> Option<ClipHandle> {
    let mut pipe_fds = [0 as RawFd; 2];
    if unsafe { libc::pipe(pipe_fds.as_mut_ptr()) } != 0 {
        return None;
    }
    let pipe_rd = pipe_fds[0];
    let pipe_wr = pipe_fds[1];

    // Set read end non-blocking
    unsafe {
        let flags = libc::fcntl(pipe_rd, libc::F_GETFL);
        libc::fcntl(pipe_rd, libc::F_SETFL, flags | libc::O_NONBLOCK);
    }

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || clipboard_thread(rx, pipe_rd));

    Some(ClipHandle {
        tx: Mutex::new(tx),
        wake_wr: pipe_wr,
    })
}

fn clipboard_thread(rx: mpsc::Receiver<ClipCmd>, wake_rd: RawFd) {
    unsafe {
        let display = XOpenDisplay(std::ptr::null());
        if display.is_null() {
            return;
        }

        let root = XDefaultRootWindow(display);
        let window = XCreateSimpleWindow(display, root, -1, -1, 1, 1, 0, 0, 0);
        XSelectInput(display, window, PROPERTY_CHANGE_MASK);

        let atoms = ClipAtoms::intern(display);
        let x_fd = XConnectionNumber(display);

        let mut state = ClipState {
            display,
            window,
            atoms,
            text: None,
            png: None,
            sequence: 0,
            owns: false,
        };

        loop {
            let mut fds = [
                libc::pollfd { fd: x_fd, events: libc::POLLIN, revents: 0 },
                libc::pollfd { fd: wake_rd, events: libc::POLLIN, revents: 0 },
            ];
            libc::poll(fds.as_mut_ptr(), 2, -1);

            // Drain wake pipe
            if fds[1].revents & libc::POLLIN != 0 {
                let mut buf = [0u8; 64];
                while libc::read(wake_rd, buf.as_mut_ptr() as *mut c_void, buf.len()) > 0 {}
            }

            // Process commands
            while let Ok(cmd) = rx.try_recv() {
                process_command(cmd, &mut state);
            }

            // Process X events
            while XPending(state.display) > 0 {
                let mut event = [0u8; 192];
                XNextEvent(state.display, event.as_mut_ptr() as *mut XEvent);
                handle_x_event(&event, &mut state);
            }
        }
    }
}

unsafe fn process_command(cmd: ClipCmd, s: &mut ClipState) {
    match cmd {
        ClipCmd::Clear { resp } => {
            let owner = XGetSelectionOwner(s.display, s.atoms.clipboard);
            if owner == s.window {
                XSetSelectionOwner(s.display, s.atoms.clipboard, None_, CurrentTime);
                XFlush(s.display);
            }
            s.text = None;
            s.png = None;
            s.owns = false;
            s.sequence += 1;
            let _ = resp.send(true);
        }

        ClipCmd::HasText { resp } => {
            if s.owns && s.text.is_some() {
                let _ = resp.send(true);
                return;
            }
            let has = has_target(s, s.atoms.utf8_string);
            let _ = resp.send(has);
        }

        ClipCmd::GetText { resp } => {
            if s.owns {
                let _ = resp.send(s.text.clone().unwrap_or_default());
                return;
            }
            let text = request_selection_text(s);
            let _ = resp.send(text);
        }

        ClipCmd::SetText { text, resp } => {
            s.text = Some(text);
            s.png = None;
            XSetSelectionOwner(s.display, s.atoms.clipboard, s.window, CurrentTime);
            XFlush(s.display);
            let owner = XGetSelectionOwner(s.display, s.atoms.clipboard);
            s.owns = owner == s.window;
            if s.owns {
                s.sequence += 1;
            }
            let _ = resp.send(s.owns);
        }

        ClipCmd::HasImage { resp } => {
            if s.owns && s.png.is_some() {
                let _ = resp.send(true);
                return;
            }
            let has = has_target(s, s.atoms.image_png);
            let _ = resp.send(has);
        }

        ClipCmd::GetImage { resp } => {
            if s.owns {
                let result = s.png.as_ref().and_then(|p| super::png_to_argb(p));
                let _ = resp.send(result);
                return;
            }
            let png_bytes = request_selection_bytes(s, s.atoms.image_png);
            let result = png_bytes.and_then(|b| super::png_to_argb(&b));
            let _ = resp.send(result);
        }

        ClipCmd::SetImage { width, height, data, resp } => {
            match super::argb_to_png(width, height, &data) {
                Some(png_bytes) => {
                    s.png = Some(png_bytes);
                    s.text = None;
                    XSetSelectionOwner(s.display, s.atoms.clipboard, s.window, CurrentTime);
                    XFlush(s.display);
                    let owner = XGetSelectionOwner(s.display, s.atoms.clipboard);
                    s.owns = owner == s.window;
                    if s.owns {
                        s.sequence += 1;
                    }
                    let _ = resp.send(s.owns);
                }
                None => {
                    let _ = resp.send(false);
                }
            }
        }

        ClipCmd::GetSequence { resp } => {
            let _ = resp.send(s.sequence as f64);
        }
    }
}

unsafe fn has_target(s: &mut ClipState, target: Atom) -> bool {
    let owner = XGetSelectionOwner(s.display, s.atoms.clipboard);
    if owner == None_ as Window {
        return false;
    }

    // Request TARGETS
    XDeleteProperty(s.display, s.window, s.atoms.mechatron_sel);
    XConvertSelection(
        s.display, s.atoms.clipboard, s.atoms.targets,
        s.atoms.mechatron_sel, s.window, CurrentTime,
    );
    XFlush(s.display);

    let data = wait_for_selection(s, Duration::from_secs(2));
    match data {
        Some(bytes) if bytes.len() >= 4 => {
            let atoms = std::slice::from_raw_parts(
                bytes.as_ptr() as *const Atom,
                bytes.len() / std::mem::size_of::<Atom>(),
            );
            atoms.contains(&target)
        }
        _ => false,
    }
}

unsafe fn request_selection_text(s: &mut ClipState) -> String {
    let owner = XGetSelectionOwner(s.display, s.atoms.clipboard);
    if owner == None_ as Window {
        return String::new();
    }

    XDeleteProperty(s.display, s.window, s.atoms.mechatron_sel);
    XConvertSelection(
        s.display, s.atoms.clipboard, s.atoms.utf8_string,
        s.atoms.mechatron_sel, s.window, CurrentTime,
    );
    XFlush(s.display);

    match wait_for_selection(s, Duration::from_secs(2)) {
        Some(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        None => String::new(),
    }
}

unsafe fn request_selection_bytes(s: &mut ClipState, target: Atom) -> Option<Vec<u8>> {
    let owner = XGetSelectionOwner(s.display, s.atoms.clipboard);
    if owner == None_ as Window {
        return None;
    }

    XDeleteProperty(s.display, s.window, s.atoms.mechatron_sel);
    XConvertSelection(
        s.display, s.atoms.clipboard, target,
        s.atoms.mechatron_sel, s.window, CurrentTime,
    );
    XFlush(s.display);

    wait_for_selection(s, Duration::from_secs(5))
}

unsafe fn wait_for_selection(s: &mut ClipState, timeout: Duration) -> Option<Vec<u8>> {
    let deadline = Instant::now() + timeout;
    let x_fd = XConnectionNumber(s.display);

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return None;
        }

        let mut pfd = libc::pollfd { fd: x_fd, events: libc::POLLIN, revents: 0 };
        libc::poll(&mut pfd, 1, remaining.as_millis().min(100) as c_int);

        while XPending(s.display) > 0 {
            let mut event = [0u8; 192];
            XNextEvent(s.display, event.as_mut_ptr() as *mut XEvent);

            let event_type = *(event.as_ptr() as *const c_int);
            if event_type == SELECTION_NOTIFY {
                let sel = &*(event.as_ptr() as *const XSelectionEvent);
                if sel.selection == s.atoms.clipboard && sel.requestor == s.window {
                    if sel.property == None_ as Atom {
                        return None;
                    }
                    return read_property(s.display, s.window, s.atoms.mechatron_sel);
                }
            }
            handle_x_event(&event, s);
        }
    }
}

unsafe fn read_property(display: *mut Display, window: Window, property: Atom) -> Option<Vec<u8>> {
    let mut actual_type: Atom = 0;
    let mut actual_format: c_int = 0;
    let mut n_items: c_ulong = 0;
    let mut bytes_after: c_ulong = 0;
    let mut data_ptr: *mut u8 = std::ptr::null_mut();

    let status = XGetWindowProperty(
        display, window, property,
        0, 0x1_000_000, // ~16M longs = ~64MB
        True_ as Bool, AnyPropertyType,
        &mut actual_type, &mut actual_format,
        &mut n_items, &mut bytes_after, &mut data_ptr,
    );

    if status != 0 || data_ptr.is_null() {
        return None;
    }

    let byte_len = match actual_format {
        8 => n_items as usize,
        16 => n_items as usize * 2,
        32 => n_items as usize * std::mem::size_of::<c_long>(),
        _ => {
            XFree(data_ptr as *mut c_void);
            return None;
        }
    };

    let result = std::slice::from_raw_parts(data_ptr, byte_len).to_vec();
    XFree(data_ptr as *mut c_void);
    Some(result)
}

unsafe fn handle_x_event(event: &[u8; 192], s: &mut ClipState) {
    let event_type = *(event.as_ptr() as *const c_int);

    match event_type {
        SELECTION_REQUEST => {
            let req = &*(event.as_ptr() as *const XSelectionRequestEvent);
            handle_selection_request(req, s);
        }
        SELECTION_CLEAR => {
            s.owns = false;
        }
        _ => {}
    }
}

unsafe fn handle_selection_request(req: &XSelectionRequestEvent, s: &ClipState) {
    if req.selection != s.atoms.clipboard {
        send_selection_notify(s.display, req, None_ as Atom);
        return;
    }

    let property = if req.property != None_ as Atom { req.property } else { req.target };

    if req.target == s.atoms.targets {
        let mut targets = vec![s.atoms.targets, s.atoms.timestamp];
        if s.text.is_some() {
            targets.push(s.atoms.utf8_string);
            targets.push(s.atoms.string);
        }
        if s.png.is_some() {
            targets.push(s.atoms.image_png);
        }
        XChangeProperty(
            s.display, req.requestor, property, s.atoms.atom,
            32, PropModeReplace,
            targets.as_ptr() as *const u8,
            targets.len() as c_int,
        );
        send_selection_notify(s.display, req, property);
    } else if (req.target == s.atoms.utf8_string || req.target == s.atoms.string)
        && s.text.is_some()
    {
        let text = s.text.as_ref().unwrap();
        XChangeProperty(
            s.display, req.requestor, property, s.atoms.utf8_string,
            8, PropModeReplace,
            text.as_ptr(), text.len() as c_int,
        );
        send_selection_notify(s.display, req, property);
    } else if req.target == s.atoms.image_png && s.png.is_some() {
        let png = s.png.as_ref().unwrap();
        XChangeProperty(
            s.display, req.requestor, property, s.atoms.image_png,
            8, PropModeReplace,
            png.as_ptr(), png.len() as c_int,
        );
        send_selection_notify(s.display, req, property);
    } else if req.target == s.atoms.timestamp {
        let ts: c_long = 0;
        XChangeProperty(
            s.display, req.requestor, property, s.atoms.integer,
            32, PropModeReplace,
            &ts as *const _ as *const u8, 1,
        );
        send_selection_notify(s.display, req, property);
    } else {
        send_selection_notify(s.display, req, None_ as Atom);
    }
}

unsafe fn send_selection_notify(
    display: *mut Display, req: &XSelectionRequestEvent, property: Atom,
) {
    let mut event = [0u8; 192];
    let sel = &mut *(event.as_mut_ptr() as *mut XSelectionEvent);
    sel.type_ = SELECTION_NOTIFY;
    sel.requestor = req.requestor;
    sel.selection = req.selection;
    sel.target = req.target;
    sel.property = property;
    sel.time = req.time;

    XSendEvent(
        display, req.requestor, False_,
        0, event.as_mut_ptr() as *mut XEvent,
    );
    XFlush(display);
}

// ── Public API ──────────────────────────────────────────────────────────

pub fn x11_clear() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| ClipCmd::Clear { resp }))
        .unwrap_or(false)
}

pub fn x11_has_text() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| ClipCmd::HasText { resp }))
        .unwrap_or(false)
}

pub fn x11_get_text() -> String {
    get_handle()
        .and_then(|h| h.request(|resp| ClipCmd::GetText { resp }))
        .unwrap_or_default()
}

pub fn x11_set_text(text: &str) -> bool {
    get_handle()
        .and_then(|h| {
            h.request(|resp| ClipCmd::SetText {
                text: text.to_string(),
                resp,
            })
        })
        .unwrap_or(false)
}

pub fn x11_has_image() -> bool {
    get_handle()
        .and_then(|h| h.request(|resp| ClipCmd::HasImage { resp }))
        .unwrap_or(false)
}

pub fn x11_get_image() -> Option<(u32, u32, Vec<u32>)> {
    get_handle().and_then(|h| h.request(|resp| ClipCmd::GetImage { resp }))?
}

pub fn x11_set_image(width: u32, height: u32, data: &[u32]) -> bool {
    get_handle()
        .and_then(|h| {
            h.request(|resp| ClipCmd::SetImage {
                width,
                height,
                data: data.to_vec(),
                resp,
            })
        })
        .unwrap_or(false)
}

pub fn x11_get_sequence() -> f64 {
    get_handle()
        .and_then(|h| h.request(|resp| ClipCmd::GetSequence { resp }))
        .unwrap_or(0.0)
}
