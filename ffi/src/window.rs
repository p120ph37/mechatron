//! Window FFI surface — stub.  Real implementation deferred.

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn window_isValid(_handle: u64) -> bool { false }
