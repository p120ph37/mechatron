extern crate napi_build;

fn main() {
    napi_build::setup();

    #[cfg(target_os = "linux")]
    {
        // libei provides the EI (Emulated Input) protocol used over the
        // EIS file descriptor we acquire from xdg-desktop-portal.  Link
        // it directly so the .node binary has libei.so.1 as a NEEDED
        // entry — this gives the napi resolver in lib/backend.ts a clean
        // failure path on systems without libei: the binary fails to load
        // and the resolver moves on to the next backend variant.
        // libei provides the EI (Emulated Input) protocol used over the
        // EIS fd from xdg-desktop-portal.  libdbus-1 is NOT linked here —
        // dbus_portal.rs dlopen's it at runtime so the binary loads cleanly
        // on systems without libdbus installed.
        println!("cargo:rustc-link-lib=ei");
    }
}
