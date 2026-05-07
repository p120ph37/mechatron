extern crate napi_build;

fn main() {
    napi_build::setup();

    #[cfg(target_os = "linux")]
    {
        println!("cargo:rustc-link-lib=X11");
        println!("cargo:rustc-link-lib=Xtst");
        println!("cargo:rustc-link-lib=rt");
        // Temporary: mouse still bundles ei_input alongside the X11 path
        // until it's split into mechatron-mouse-x11 / mechatron-mouse-portal
        // (mirroring the keyboard split).  Drop this link directive when
        // that split happens.
        println!("cargo:rustc-link-lib=ei");
    }

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
    }
}
