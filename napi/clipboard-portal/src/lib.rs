// mechatron-clipboard-portal — xdg-desktop-portal RemoteDesktop clipboard.
//
// This crate is Linux-only.  On other targets it produces an empty cdylib.
// No NEEDED libs other than libc — libdbus is dlopen'd lazily by
// dbus_portal.rs — so the .node binary loads without D-Bus present.
//
// The actual implementation lives in ../../src/clipboard_portal_main.rs
// (the napi exports + PNG helpers) which includes
// ../../src/clipboard_portal_dbus.rs (the portal D-Bus logic).

#[cfg(target_os = "linux")]
#[path = "../../src/clipboard_portal_main.rs"]
mod main;
