extern crate napi_build;

fn main() {
    napi_build::setup();

    // mechatron-clipboard is the non-Linux base crate (macOS / Windows).
    // Linux X11 clipboard lives in mechatron-clipboard-x11 (links libX11).
    // Wayland clipboard is served by nolib[sh] and nolib[gext] instead.

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
    }
}
