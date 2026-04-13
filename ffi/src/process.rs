//! Process FFI surface — stub.  Real implementation deferred.

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn process_getCurrent() -> u32 {
    std::process::id()
}
