#[cfg(target_os = "linux")]
#[path = "../../src/x11.rs"]
pub mod x11;

#[cfg(target_os = "macos")]
#[path = "../../src/mach.rs"]
pub mod mach;
