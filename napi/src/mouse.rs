// Non-Linux mouse implementation.
//
// macOS uses Quartz Event Services (CGEventCreateMouseEvent +
// CGEventPost / CGEventSourceButtonState / CGWarpMouseCursorPosition).
// Windows uses SendInput with INPUT_MOUSE events and GetAsyncKeyState
// for state queries.  Both platforms expose a single OS-native input API
// with no variant fan-out, so this file is the only mouse implementation
// on those platforms.
//
// On Linux, see ../mouse_x11.rs (XTest) and ../mouse_portal.rs (libei via
// xdg-desktop-portal RemoteDesktop) — the build system selects one of
// those crates per backend variant rather than runtime-dispatching at the
// language level.

// Pulled in only by the cfg-gated macOS/Windows code below.  On Linux
// this file is intentionally empty (the per-variant crates
// `mechatron-mouse-x11` and `mechatron-mouse-portal` carry the mouse
// implementation instead).
#[cfg(any(target_os = "macos", target_os = "windows"))]
use napi::bindgen_prelude::*;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use napi_derive::napi;

// Button constants (matching C++ enum) — used by the macOS/Windows
// dispatch tables.  Linux variants define their own button mappings.
#[cfg(any(target_os = "macos", target_os = "windows"))]
const BUTTON_LEFT: i32 = 0;
#[cfg(any(target_os = "macos", target_os = "windows"))]
const BUTTON_MID: i32 = 1;
#[cfg(any(target_os = "macos", target_os = "windows"))]
const BUTTON_RIGHT: i32 = 2;
#[cfg(target_os = "windows")]
const BUTTON_X1: i32 = 3;
#[cfg(target_os = "windows")]
const BUTTON_X2: i32 = 4;

// ==================== macOS ====================

#[cfg(target_os = "macos")]
#[allow(non_upper_case_globals)]
mod mac {
    use std::ffi::c_void;
    pub type CGEventSourceRef = *mut c_void;
    pub type CGEventRef = *mut c_void;
    pub type CGMouseButton = u32;
    pub type CGEventType = u32;
    pub type CGEventSourceStateID = u32;
    pub type CGEventTapLocation = u32;
    pub type CGScrollEventUnit = u32;
    pub type CGEventField = u32;

    #[repr(C)]
    #[derive(Copy, Clone)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }

    pub const kCGEventSourceStateHIDSystemState: CGEventSourceStateID = 1;
    pub const kCGHIDEventTap: CGEventTapLocation = 0;

    pub const kCGEventLeftMouseDown: CGEventType = 1;
    pub const kCGEventLeftMouseUp: CGEventType = 2;
    pub const kCGEventRightMouseDown: CGEventType = 3;
    pub const kCGEventRightMouseUp: CGEventType = 4;
    pub const kCGEventLeftMouseDragged: CGEventType = 6;
    pub const kCGEventRightMouseDragged: CGEventType = 7;
    pub const kCGEventOtherMouseDown: CGEventType = 25;
    pub const kCGEventOtherMouseUp: CGEventType = 26;

    pub const kCGMouseButtonLeft: CGMouseButton = 0;
    pub const kCGMouseButtonRight: CGMouseButton = 1;
    pub const kCGMouseButtonCenter: CGMouseButton = 2;

    pub const kCGScrollEventUnitPixel: CGScrollEventUnit = 1;

    pub const kCGMouseEventClickState: CGEventField = 1;

    extern "C" {
        pub fn CGEventSourceCreate(stateID: CGEventSourceStateID) -> CGEventSourceRef;
        pub fn CGEventCreate(source: CGEventSourceRef) -> CGEventRef;
        pub fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
        pub fn CGEventCreateMouseEvent(
            source: CGEventSourceRef,
            mouseType: CGEventType,
            mouseCursorPosition: CGPoint,
            mouseButton: CGMouseButton,
        ) -> CGEventRef;
        pub fn CGEventCreateScrollWheelEvent(
            source: CGEventSourceRef,
            units: CGScrollEventUnit,
            wheelCount: u32,
            wheel1: i32,
            ...
        ) -> CGEventRef;
        pub fn CGEventPost(tap: CGEventTapLocation, event: CGEventRef);
        pub fn CGEventSetIntegerValueField(
            event: CGEventRef,
            field: CGEventField,
            value: i64,
        );
        pub fn CGEventSourceButtonState(
            stateID: CGEventSourceStateID,
            button: CGMouseButton,
        ) -> bool;
        pub fn CGWarpMouseCursorPosition(newCursorPosition: CGPoint) -> i32;
        pub fn CGAssociateMouseAndMouseCursorPosition(connected: bool) -> i32;
        pub fn CFRelease(cf: *mut c_void);
    }
}

#[cfg(target_os = "macos")]
fn mac_get_cursor_pos() -> mac::CGPoint {
    unsafe {
        let evt = mac::CGEventCreate(std::ptr::null_mut());
        if evt.is_null() {
            return mac::CGPoint { x: 0.0, y: 0.0 };
        }
        let pt = mac::CGEventGetLocation(evt);
        mac::CFRelease(evt);
        pt
    }
}

#[cfg(target_os = "macos")]
mod click_state {
    use std::sync::Mutex;
    use std::time::Instant;

    static LAST_CLICK: Mutex<Option<Instant>> = Mutex::new(None);
    const DOUBLE_CLICK_MS: u128 = 500;

    pub fn get_click_count() -> i64 {
        let mut last = LAST_CLICK.lock().unwrap();
        let now = Instant::now();
        let count = match *last {
            Some(t) if now.duration_since(t).as_millis() < DOUBLE_CLICK_MS => {
                *last = None;
                2
            }
            _ => {
                *last = Some(now);
                1
            }
        };
        count
    }
}

#[cfg(target_os = "macos")]
fn mac_button_params(button: i32, press: bool) -> Option<(mac::CGEventType, mac::CGMouseButton)> {
    match (button, press) {
        (BUTTON_LEFT, true) => Some((mac::kCGEventLeftMouseDown, mac::kCGMouseButtonLeft)),
        (BUTTON_LEFT, false) => Some((mac::kCGEventLeftMouseUp, mac::kCGMouseButtonLeft)),
        (BUTTON_RIGHT, true) => Some((mac::kCGEventRightMouseDown, mac::kCGMouseButtonRight)),
        (BUTTON_RIGHT, false) => Some((mac::kCGEventRightMouseUp, mac::kCGMouseButtonRight)),
        (BUTTON_MID, true) => Some((mac::kCGEventOtherMouseDown, mac::kCGMouseButtonCenter)),
        (BUTTON_MID, false) => Some((mac::kCGEventOtherMouseUp, mac::kCGMouseButtonCenter)),
        _ => None, // X1, X2 not directly supported
    }
}

#[cfg(target_os = "macos")]
fn do_press(button: i32) {
    if let Some((evt_type, cg_button)) = mac_button_params(button, true) {
        unsafe {
            let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
            if src.is_null() { return; }
            let pt = mac_get_cursor_pos();
            let evt = mac::CGEventCreateMouseEvent(src, evt_type, pt, cg_button);
            if !evt.is_null() {
                let count = click_state::get_click_count();
                mac::CGEventSetIntegerValueField(evt, mac::kCGMouseEventClickState, count);
                mac::CGEventPost(mac::kCGHIDEventTap, evt);
                mac::CFRelease(evt);
            }
            mac::CFRelease(src);
        }
    }
}

#[cfg(target_os = "macos")]
fn do_release(button: i32) {
    if let Some((evt_type, cg_button)) = mac_button_params(button, false) {
        unsafe {
            let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
            if src.is_null() { return; }
            let pt = mac_get_cursor_pos();
            let evt = mac::CGEventCreateMouseEvent(src, evt_type, pt, cg_button);
            if !evt.is_null() {
                let count = click_state::get_click_count();
                mac::CGEventSetIntegerValueField(evt, mac::kCGMouseEventClickState, count);
                mac::CGEventPost(mac::kCGHIDEventTap, evt);
                mac::CFRelease(evt);
            }
            mac::CFRelease(src);
        }
    }
}

#[cfg(target_os = "macos")]
fn platform_scroll_h(amount: i32) {
    unsafe {
        let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
        if src.is_null() { return; }
        let dx = amount * -120;
        let evt = mac::CGEventCreateScrollWheelEvent(
            src,
            mac::kCGScrollEventUnitPixel,
            2,
            0i32,
            dx,
        );
        if !evt.is_null() {
            mac::CGEventPost(mac::kCGHIDEventTap, evt);
            mac::CFRelease(evt);
        }
        mac::CFRelease(src);
    }
}

#[cfg(target_os = "macos")]
fn platform_scroll_v(amount: i32) {
    unsafe {
        let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
        if src.is_null() { return; }
        let dy = amount * 120;
        let evt = mac::CGEventCreateScrollWheelEvent(
            src,
            mac::kCGScrollEventUnitPixel,
            2,
            dy,
            0i32,
        );
        if !evt.is_null() {
            mac::CGEventPost(mac::kCGHIDEventTap, evt);
            mac::CFRelease(evt);
        }
        mac::CFRelease(src);
    }
}

#[cfg(target_os = "macos")]
fn platform_get_pos() -> (i32, i32) {
    let pt = mac_get_cursor_pos();
    (pt.x as i32, pt.y as i32)
}

#[cfg(target_os = "macos")]
fn platform_set_pos(x: i32, y: i32) {
    let pt = mac::CGPoint { x: x as f64, y: y as f64 };
    unsafe {
        let left_down = mac::CGEventSourceButtonState(
            mac::kCGEventSourceStateHIDSystemState,
            mac::kCGMouseButtonLeft,
        );
        let right_down = mac::CGEventSourceButtonState(
            mac::kCGEventSourceStateHIDSystemState,
            mac::kCGMouseButtonRight,
        );

        if left_down || right_down {
            let src = mac::CGEventSourceCreate(mac::kCGEventSourceStateHIDSystemState);
            if src.is_null() { return; }
            let (drag_type, drag_button) = if left_down {
                (mac::kCGEventLeftMouseDragged, mac::kCGMouseButtonLeft)
            } else {
                (mac::kCGEventRightMouseDragged, mac::kCGMouseButtonRight)
            };
            let evt = mac::CGEventCreateMouseEvent(src, drag_type, pt, drag_button);
            if !evt.is_null() {
                mac::CGEventPost(mac::kCGHIDEventTap, evt);
                mac::CFRelease(evt);
            }
            mac::CFRelease(src);
        } else {
            mac::CGWarpMouseCursorPosition(pt);
            mac::CGAssociateMouseAndMouseCursorPosition(true);
        }
    }
}

#[cfg(target_os = "macos")]
fn platform_get_button_state(button: i32) -> bool {
    let cg_button = match button {
        BUTTON_LEFT => mac::kCGMouseButtonLeft,
        BUTTON_MID => mac::kCGMouseButtonCenter,
        BUTTON_RIGHT => mac::kCGMouseButtonRight,
        _ => return false,
    };
    unsafe {
        mac::CGEventSourceButtonState(mac::kCGEventSourceStateHIDSystemState, cg_button)
    }
}

// ==================== Windows ====================

#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::*;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;

#[cfg(target_os = "windows")]
fn win_buttons_swapped() -> bool {
    unsafe { GetSystemMetrics(SM_SWAPBUTTON) != 0 }
}

#[cfg(target_os = "windows")]
fn win_mouse_flags(button: i32, press: bool) -> Option<(MOUSE_EVENT_FLAGS, u32)> {
    let swapped = win_buttons_swapped();
    match (button, press) {
        (BUTTON_LEFT, true) => {
            if swapped { Some((MOUSEEVENTF_RIGHTDOWN, 0)) }
            else { Some((MOUSEEVENTF_LEFTDOWN, 0)) }
        }
        (BUTTON_LEFT, false) => {
            if swapped { Some((MOUSEEVENTF_RIGHTUP, 0)) }
            else { Some((MOUSEEVENTF_LEFTUP, 0)) }
        }
        (BUTTON_RIGHT, true) => {
            if swapped { Some((MOUSEEVENTF_LEFTDOWN, 0)) }
            else { Some((MOUSEEVENTF_RIGHTDOWN, 0)) }
        }
        (BUTTON_RIGHT, false) => {
            if swapped { Some((MOUSEEVENTF_LEFTUP, 0)) }
            else { Some((MOUSEEVENTF_RIGHTUP, 0)) }
        }
        (BUTTON_MID, true) => Some((MOUSEEVENTF_MIDDLEDOWN, 0)),
        (BUTTON_MID, false) => Some((MOUSEEVENTF_MIDDLEUP, 0)),
        (BUTTON_X1, true) => Some((MOUSEEVENTF_XDOWN, XBUTTON1 as u32)),
        (BUTTON_X1, false) => Some((MOUSEEVENTF_XUP, XBUTTON1 as u32)),
        (BUTTON_X2, true) => Some((MOUSEEVENTF_XDOWN, XBUTTON2 as u32)),
        (BUTTON_X2, false) => Some((MOUSEEVENTF_XUP, XBUTTON2 as u32)),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn do_press(button: i32) {
    if let Some((flags, mouse_data)) = win_mouse_flags(button, true) {
        unsafe {
            let input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: mouse_data,
                        dwFlags: flags,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }
}

#[cfg(target_os = "windows")]
fn do_release(button: i32) {
    if let Some((flags, mouse_data)) = win_mouse_flags(button, false) {
        unsafe {
            let input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: mouse_data,
                        dwFlags: flags,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }
}

#[cfg(target_os = "windows")]
fn platform_scroll_h(amount: i32) {
    unsafe {
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: (amount * WHEEL_DELTA as i32) as u32,
                    dwFlags: MOUSEEVENTF_HWHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn platform_scroll_v(amount: i32) {
    unsafe {
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: (amount * WHEEL_DELTA as i32) as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn platform_get_pos() -> (i32, i32) {
    unsafe {
        let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        let _ = GetCursorPos(&mut point);
        (point.x, point.y)
    }
}

#[cfg(target_os = "windows")]
fn platform_set_pos(x: i32, y: i32) {
    unsafe {
        let _ = SetCursorPos(x, y);
    }
}

#[cfg(target_os = "windows")]
fn platform_get_button_state(button: i32) -> bool {
    let swapped = win_buttons_swapped();
    let vk = match button {
        BUTTON_LEFT => if swapped { VK_RBUTTON } else { VK_LBUTTON },
        BUTTON_MID => VK_MBUTTON,
        BUTTON_RIGHT => if swapped { VK_LBUTTON } else { VK_RBUTTON },
        BUTTON_X1 => VK_XBUTTON1,
        BUTTON_X2 => VK_XBUTTON2,
        _ => return false,
    };
    unsafe {
        GetAsyncKeyState(vk.0 as i32) & (0x8000u16 as i16) != 0
    }
}

// ==================== AsyncTask wrappers ====================

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(object)]
pub struct MousePos {
    pub x: i32,
    pub y: i32,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct PressTask(i32);
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for PressTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_press(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct ReleaseTask(i32);
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for ReleaseTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { do_release(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct ScrollHTask(i32);
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for ScrollHTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_scroll_h(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct ScrollVTask(i32);
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for ScrollVTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_scroll_v(self.0); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct GetPosTask;
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for GetPosTask {
    type Output = (i32, i32);
    type JsValue = MousePos;
    fn compute(&mut self) -> Result<(i32, i32)> {
        Ok(platform_get_pos())
    }
    fn resolve(&mut self, _env: Env, out: (i32, i32)) -> Result<MousePos> {
        Ok(MousePos { x: out.0, y: out.1 })
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct SetPosTask(i32, i32);
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for SetPosTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> { platform_set_pos(self.0, self.1); Ok(()) }
    fn resolve(&mut self, _env: Env, _: ()) -> Result<()> { Ok(()) }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct GetButtonStateTask(i32);
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Task for GetButtonStateTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(platform_get_button_state(self.0)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "mouse_press")]
pub fn mouse_press(button: i32) -> AsyncTask<PressTask> {
    AsyncTask::new(PressTask(button))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "mouse_release")]
pub fn mouse_release(button: i32) -> AsyncTask<ReleaseTask> {
    AsyncTask::new(ReleaseTask(button))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "mouse_scrollH")]
pub fn mouse_scroll_h(amount: i32) -> AsyncTask<ScrollHTask> {
    AsyncTask::new(ScrollHTask(amount))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "mouse_scrollV")]
pub fn mouse_scroll_v(amount: i32) -> AsyncTask<ScrollVTask> {
    AsyncTask::new(ScrollVTask(amount))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "mouse_getPos")]
pub fn mouse_get_pos() -> AsyncTask<GetPosTask> {
    AsyncTask::new(GetPosTask)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "mouse_setPos")]
pub fn mouse_set_pos(x: i32, y: i32) -> AsyncTask<SetPosTask> {
    AsyncTask::new(SetPosTask(x, y))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[napi(js_name = "mouse_getButtonState")]
pub fn mouse_get_button_state(button: i32) -> AsyncTask<GetButtonStateTask> {
    AsyncTask::new(GetButtonStateTask(button))
}
