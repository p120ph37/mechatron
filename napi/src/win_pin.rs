// Pin this DLL in the process address space so Windows never unloads it.
//
// This is the Windows equivalent of `-Wl,-z,nodelete` that napi-build
// applies on Linux.  Without it, the CRT runs destructors for napi-rs's
// global Lazy<RwLock<…>> statics and thread-local storage during
// DLL_PROCESS_DETACH.  When multiple napi cdylibs tear down in
// non-deterministic order this causes a segfault — especially on ia32
// where the TLS teardown path differs from x64.

extern "system" {
    fn GetModuleHandleExW(
        dw_flags: u32,
        lp_module_name: *const u16,
        ph_module: *mut *mut core::ffi::c_void,
    ) -> i32;
}

const GET_MODULE_HANDLE_EX_FLAG_PIN: u32 = 0x00000001;
const GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS: u32 = 0x00000004;

unsafe extern "C" fn _pin_this_dll() {
    let mut handle: *mut core::ffi::c_void = core::ptr::null_mut();
    GetModuleHandleExW(
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        _pin_this_dll as *const u16,
        &mut handle,
    );
}

#[used]
#[link_section = ".CRT$XCU"]
static _PIN_DLL_INIT: unsafe extern "C" fn() = _pin_this_dll;
