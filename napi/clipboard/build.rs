extern crate napi_build;

fn main() {
    napi_build::setup();

    // mechatron-clipboard is the non-Linux base crate (macOS / Windows).
    // Linux variants live in mechatron-clipboard-x11 and
    // mechatron-clipboard-portal which link their respective system libs.

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
    }
}
