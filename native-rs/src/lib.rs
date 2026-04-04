#[cfg(target_os = "linux")]
mod x11;
#[cfg(target_os = "macos")]
mod mach;
mod keyboard;
mod mouse;
mod clipboard;
mod screen;
mod window;
mod process;
mod memory;
