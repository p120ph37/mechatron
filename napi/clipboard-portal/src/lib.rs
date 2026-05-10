// mechatron-clipboard-portal — Wayland clipboard via libwayland-client.
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// Links libwayland-client explicitly — detects at init time whether the
// compositor supports zwlr_data_control_v1 (wlroots) or falls back to
// core wl_data_device with a popup surface (GNOME/Mutter).

#[cfg(target_os = "linux")]
#[path = "../../src/clipboard_portal_main.rs"]
mod main;
