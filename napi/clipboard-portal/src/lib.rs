// mechatron-clipboard-portal — Wayland zwlr_data_control_v1 clipboard.
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// No NEEDED libs other than libc — libwayland-client is dlopen'd lazily
// by clipboard_wl.rs — so the .node binary loads without Wayland present.
//
// The actual implementation lives in ../../src/clipboard_portal_main.rs
// (the napi exports + PNG helpers) which itself includes
// ../../src/clipboard_wl.rs (the wl_data_control protocol logic).

#[cfg(target_os = "linux")]
#[path = "../../src/clipboard_portal_main.rs"]
mod main;
