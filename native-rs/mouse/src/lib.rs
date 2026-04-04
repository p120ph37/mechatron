#[cfg(target_os = "linux")]
use mechatron_shared::x11 as x11_mod;
#[cfg(target_os = "linux")]
mod x11 {
    pub use crate::x11_mod::*;
}

#[path = "../../src/mouse.rs"]
mod mouse;
