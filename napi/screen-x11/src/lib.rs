// mechatron-screen-x11 — XRandR + XGetImage screen capture on Xorg.
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// Linking pulls in libX11 and libXrandr as NEEDED entries on the .so so
// the runtime fail-fast behaviour is "this binary won't load on
// Wayland-only systems"; the napi resolver then falls through to the
// next variant.

#[cfg(target_os = "linux")]
use mechatron_shared::x11 as x11_mod;
#[cfg(target_os = "linux")]
mod x11 {
    pub use crate::x11_mod::*;
}

#[cfg(target_os = "linux")]
#[path = "../../src/screen_x11.rs"]
mod screen;
