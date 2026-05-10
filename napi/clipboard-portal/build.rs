extern crate napi_build;

fn main() {
    napi_build::setup();

    // No system-lib link directives.  libdbus is dlopen'd lazily by
    // dbus_portal.rs so the .node binary loads without D-Bus present.
}
