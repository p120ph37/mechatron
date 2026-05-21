// mechatron-keyboard-x11 — XTest input on Xorg.
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// Linking pulls in libX11 and libXtst as NEEDED entries on the .so so the
// runtime fail-fast behaviour is "this binary won't load on portal-only
// systems"; the napi resolver then falls through to the next variant.

#[cfg(target_os = "linux")]
use mechatron_shared::x11 as x11_mod;
#[cfg(target_os = "linux")]
mod x11 {
    pub use crate::x11_mod::*;
}

#[cfg(target_os = "linux")]
#[path = "../../src/keyboard_x11.rs"]
mod keyboard;
