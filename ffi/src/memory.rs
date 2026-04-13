//! Memory FFI surface — stub.  Real implementation deferred.

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn memory_getPageSize() -> u32 {
    #[cfg(unix)]
    unsafe {
        libc::sysconf(libc::_SC_PAGESIZE) as u32
    }
    #[cfg(windows)]
    {
        4096
    }
}
