extern crate napi_build;

fn main() {
    napi_build::setup();

    #[cfg(target_os = "linux")]
    {
        println!("cargo:rustc-link-lib=dbus-1");
        println!("cargo:rustc-link-lib=pipewire-0.3");
    }
}
