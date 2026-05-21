// mechatron-keyboard-portal — libei input via the xdg-desktop-portal
// RemoteDesktop session.
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// No NEEDED libs other than libc — libei is dlopen'd lazily by ei_input.rs
// and dbus is implemented over a raw socket — so the .node binary loads
// without X11 present.

#[cfg(target_os = "linux")]
#[path = "../../src/ei_input.rs"]
mod ei_input;

#[cfg(target_os = "linux")]
#[path = "../../src/keyboard_portal.rs"]
mod keyboard;
