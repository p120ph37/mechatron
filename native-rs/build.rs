extern crate napi_build;

fn main() {
    napi_build::setup();

    #[cfg(target_os = "linux")]
    {
        println!("cargo:rustc-link-lib=X11");
        println!("cargo:rustc-link-lib=Xtst");
        println!("cargo:rustc-link-lib=Xinerama");
        println!("cargo:rustc-link-lib=rt");
    }

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreFoundation");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=Security");
    }
}
