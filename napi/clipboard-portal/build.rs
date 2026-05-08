extern crate napi_build;

fn main() {
    napi_build::setup();

    // No system-lib link directives.  libwayland-client is dlopen'd lazily
    // by clipboard_wl.rs so the .node binary loads without Wayland present
    // — the napi resolver gets a clean "no Wayland session" failure path
    // when the clipboard ops actually run, not at module load time.
}
