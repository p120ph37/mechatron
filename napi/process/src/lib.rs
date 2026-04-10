#[cfg(target_os = "linux")]
use mechatron_shared::x11 as x11_mod;
#[cfg(target_os = "linux")]
mod x11 {
    pub use crate::x11_mod::*;
}

#[cfg(target_os = "macos")]
use mechatron_shared::mach as mach_mod;
#[cfg(target_os = "macos")]
mod mach {
    pub use crate::mach_mod::*;
}

// process.rs on Linux calls crate::window::enum_windows_with_pid,
// so we must include the window module here as well.
#[cfg(target_os = "linux")]
#[path = "../../src/window.rs"]
pub mod window;

#[path = "../../src/process.rs"]
mod process;
