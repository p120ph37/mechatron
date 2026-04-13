//! Shared helpers for the FFI native crates.
//!
//! Re-exports platform helper modules from the napi-rs source tree
//! (`napi/src/x11.rs`, `napi/src/mach.rs`) so the FFI variants do not duplicate
//! their FFI definitions of X11 / Mach.

#[cfg(target_os = "linux")]
#[path = "../../../napi/src/x11.rs"]
pub mod x11;

#[cfg(target_os = "macos")]
#[path = "../../../napi/src/mach.rs"]
pub mod mach;
