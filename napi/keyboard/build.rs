extern crate napi_build;

fn main() {
    napi_build::setup();

    // mechatron-keyboard is the non-Linux base crate (macOS / Windows).
    // Linux variants live in mechatron-keyboard-x11 and
    // mechatron-keyboard-portal which link their respective system libs.

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
    }
}
