extern crate napi_build;

fn main() {
    napi_build::setup();

    #[cfg(target_os = "linux")]
    {
        println!("cargo:rustc-link-lib=X11");
    }

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
    }
}
