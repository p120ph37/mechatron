//! Clipboard FFI surface — stub.
//!
//! Real implementation deferred — clipboard requires variable-length string
//! and image marshalling which is more involved over FFI.  See PLAN.md
//! Phase 5 for the design plan.
//!
//! For now, every export returns "no data" so JS can detect missing
//! capabilities via `isAvailable()` returning true but operations no-op'ing.

#[no_mangle]
pub extern "C" fn clipboard_clear() {}

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn clipboard_hasText() -> bool { false }

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn clipboard_hasImage() -> bool { false }

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn clipboard_getSequence() -> u32 { 0 }
