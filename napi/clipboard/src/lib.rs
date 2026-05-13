// mechatron-clipboard — non-Linux clipboard binary (macOS / Windows).
//
// On Linux, see mechatron-clipboard-x11 which is a separate crate
// linking libX11.  Wayland clipboard is handled by nolib[sh]/[gext].

#[path = "../../src/clipboard.rs"]
mod clipboard;
