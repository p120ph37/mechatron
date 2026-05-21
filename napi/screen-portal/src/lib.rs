// mechatron-screen-portal — xdg-desktop-portal ScreenCast + PipeWire
// screen capture on Wayland (and X11 sessions where the portal is
// available).
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// No NEEDED libs other than libc — libpipewire is dlopen'd lazily by
// pw.rs / pw_capture.rs and the D-Bus protocol is implemented over a
// raw socket — so the .node binary loads without X11 or PipeWire
// present.

#[cfg(target_os = "linux")]
#[path = "../../src/screencast.rs"]
mod screencast;

#[cfg(target_os = "linux")]
#[path = "../../src/screen_portal.rs"]
mod screen;
