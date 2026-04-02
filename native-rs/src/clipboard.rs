use napi::bindgen_prelude::*;
use napi_derive::napi;

// On Linux without a clipboard manager, all clipboard operations return false/empty.
// This matches the C++ Robot::Clipboard behavior on Linux.

#[napi(js_name = "clipboard_clear")]
pub fn clipboard_clear() -> bool {
    false
}

#[napi(js_name = "clipboard_hasText")]
pub fn clipboard_has_text() -> bool {
    false
}

#[napi(js_name = "clipboard_getText")]
pub fn clipboard_get_text() -> String {
    String::new()
}

#[napi(js_name = "clipboard_setText")]
pub fn clipboard_set_text(_text: String) -> bool {
    false
}

#[napi(js_name = "clipboard_hasImage")]
pub fn clipboard_has_image() -> bool {
    false
}

#[napi(js_name = "clipboard_getImage")]
pub fn clipboard_get_image(env: Env) -> Result<napi::JsNull> {
    env.get_null()
}

#[napi(js_name = "clipboard_setImage")]
pub fn clipboard_set_image(_width: u32, _height: u32, _data: Uint32Array) -> bool {
    false
}

#[napi(js_name = "clipboard_getSequence")]
pub fn clipboard_get_sequence() -> f64 {
    0.0
}
