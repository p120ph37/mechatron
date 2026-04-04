#[cfg(target_os = "macos")]
use mechatron_shared::mach as mach_mod;
#[cfg(target_os = "macos")]
mod mach {
    pub use crate::mach_mod::*;
}

#[path = "../../src/memory.rs"]
mod memory;
