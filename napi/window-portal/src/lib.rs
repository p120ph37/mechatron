// mechatron-window-portal — AT-SPI2 read-only window enumeration on
// Linux. Reads the org.a11y.atspi bus over libdbus-1 to list windows
// from any freedesktop DE. Mirrors the lib/portal/atspi.ts + lib/nolib/
// window-portal.ts logic but runs entirely in Rust so the binary loads
// without Bun, matching how the other napi[portal] crates are shaped.
//
// On non-Linux targets this crate produces an empty cdylib.

#[cfg(target_os = "linux")]
#[path = "../../src/window_portal.rs"]
mod window;
