//! Screen FFI surface — stub.  Real implementation deferred.

#[no_mangle]
pub extern "C" fn screen_synchronize() {}

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn screen_isCompositing() -> bool { false }
