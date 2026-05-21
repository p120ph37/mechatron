// mechatron-clipboard-x11 — ICCCM selection clipboard on Xorg.
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// Linking pulls in libX11 as a NEEDED entry on the .so so the runtime
// fail-fast behaviour is "this binary won't load on portal-only systems";
// the napi resolver then falls through to the next variant.
//
// The actual implementation lives in ../../src/clipboard_x11_main.rs
// (the napi exports + PNG helpers) which itself includes
// ../../src/clipboard_x11.rs (the ICCCM background-thread logic).

#[cfg(target_os = "linux")]
use mechatron_shared::x11 as x11_mod;
#[cfg(target_os = "linux")]
mod x11 {
    pub use crate::x11_mod::*;
}

#[cfg(target_os = "linux")]
#[path = "../../src/clipboard_x11_main.rs"]
mod main;
