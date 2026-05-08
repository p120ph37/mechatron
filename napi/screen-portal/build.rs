extern crate napi_build;

fn main() {
    napi_build::setup();

    #[cfg(target_os = "linux")]
    {
        // No NEEDED libs — libpipewire is dlopen'd lazily by pw.rs and
        // the D-Bus protocol is implemented over a raw socket.  This
        // gives the napi resolver in lib/backend.ts a clean failure path
        // on systems where the portal/PipeWire stack isn't reachable:
        // get_monitors() returns None and the resolver moves on to the
        // next backend variant.
    }
}
