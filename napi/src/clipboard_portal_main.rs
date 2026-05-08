// Linux portal clipboard implementation entry point.
//
// Loaded by the `mechatron-clipboard-portal` crate.  Hosts the
// `clipboard_wl` helper module (Wayland zwlr_data_control_v1 selection
// implementation against a libwayland-client connection) plus the
// napi-derive #[napi] exports that call into it.
//
// PNG helpers (argb_to_png / png_to_argb) live here because clipboard_wl
// uses them as `super::png_to_argb(..)` / `super::argb_to_png(..)`
// — making this file the parent module of clipboard_wl places them at
// the right resolution path.  The x11 variant has its own
// identical-but-separate copy in clipboard_x11_main.rs (the helpers are
// a few dozen lines and duplicating beats threading another shared
// crate just for them).

use napi::bindgen_prelude::*;
use napi::Either;
use napi_derive::napi;

#[path = "clipboard_wl.rs"]
mod clipboard_wl;

#[napi(object)]
pub struct ClipboardImage {
    pub width: u32,
    pub height: u32,
    pub data: Uint32Array,
}

// ── PNG conversion helpers (used by clipboard_wl via super::) ─────────

pub(crate) fn argb_to_png(width: u32, height: u32, data: &[u32]) -> Option<Vec<u8>> {
    let pixel_count = (width as usize) * (height as usize);
    if data.len() < pixel_count { return None; }

    let mut rgba = Vec::with_capacity(pixel_count * 4);
    for &pixel in &data[..pixel_count] {
        rgba.push(((pixel >> 16) & 0xFF) as u8);
        rgba.push(((pixel >> 8) & 0xFF) as u8);
        rgba.push((pixel & 0xFF) as u8);
        rgba.push(((pixel >> 24) & 0xFF) as u8);
    }

    let mut buf = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buf, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
    }
    Some(buf)
}

pub(crate) fn png_to_argb(png_data: &[u8]) -> Option<(u32, u32, Vec<u32>)> {
    let decoder = png::Decoder::new(std::io::Cursor::new(png_data));
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let buf = &buf[..info.buffer_size()];
    let w = info.width;
    let h = info.height;
    let n = (w * h) as usize;
    let mut argb = Vec::with_capacity(n);

    match info.color_type {
        png::ColorType::Rgba => {
            for i in 0..n {
                let r = buf[i * 4] as u32;
                let g = buf[i * 4 + 1] as u32;
                let b = buf[i * 4 + 2] as u32;
                let a = buf[i * 4 + 3] as u32;
                argb.push((a << 24) | (r << 16) | (g << 8) | b);
            }
        }
        png::ColorType::Rgb => {
            for i in 0..n {
                let r = buf[i * 3] as u32;
                let g = buf[i * 3 + 1] as u32;
                let b = buf[i * 3 + 2] as u32;
                argb.push(0xFF000000 | (r << 16) | (g << 8) | b);
            }
        }
        png::ColorType::GrayscaleAlpha => {
            for i in 0..n {
                let v = buf[i * 2] as u32;
                let a = buf[i * 2 + 1] as u32;
                argb.push((a << 24) | (v << 16) | (v << 8) | v);
            }
        }
        png::ColorType::Grayscale => {
            for i in 0..n {
                let v = buf[i] as u32;
                argb.push(0xFF000000 | (v << 16) | (v << 8) | v);
            }
        }
        _ => return None,
    }
    Some((w, h, argb))
}

// ── AsyncTask wrappers ────────────────────────────────────────────────

pub struct ClearTask;
impl Task for ClearTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(clipboard_wl::wl_clear()) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct HasTextTask;
impl Task for HasTextTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(clipboard_wl::wl_has_text()) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct GetTextTask;
impl Task for GetTextTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<String> { Ok(clipboard_wl::wl_get_text()) }
    fn resolve(&mut self, _env: Env, out: String) -> Result<String> { Ok(out) }
}

pub struct SetTextTask { text: String }
impl Task for SetTextTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(clipboard_wl::wl_set_text(&self.text)) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct HasImageTask;
impl Task for HasImageTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> { Ok(clipboard_wl::wl_has_image()) }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct GetImageTask;
impl Task for GetImageTask {
    type Output = Option<(u32, u32, Vec<u32>)>;
    type JsValue = Either<ClipboardImage, ()>;
    fn compute(&mut self) -> Result<Option<(u32, u32, Vec<u32>)>> {
        Ok(clipboard_wl::wl_get_image())
    }
    fn resolve(&mut self, _env: Env, out: Option<(u32, u32, Vec<u32>)>) -> Result<Either<ClipboardImage, ()>> {
        match out {
            Some((w, h, data)) => Ok(Either::A(ClipboardImage {
                width: w,
                height: h,
                data: Uint32Array::new(data),
            })),
            None => Ok(Either::B(())),
        }
    }
}

pub struct SetImageTask { width: u32, height: u32, data: Vec<u32> }
impl Task for SetImageTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> Result<bool> {
        Ok(clipboard_wl::wl_set_image(self.width, self.height, &self.data))
    }
    fn resolve(&mut self, _env: Env, out: bool) -> Result<bool> { Ok(out) }
}

pub struct GetSequenceTask;
impl Task for GetSequenceTask {
    type Output = f64;
    type JsValue = f64;
    fn compute(&mut self) -> Result<f64> { Ok(clipboard_wl::wl_get_sequence()) }
    fn resolve(&mut self, _env: Env, out: f64) -> Result<f64> { Ok(out) }
}

// ── NAPI exports ──────────────────────────────────────────────────────

#[napi(js_name = "clipboard_clear")]
pub fn clipboard_clear() -> AsyncTask<ClearTask> {
    AsyncTask::new(ClearTask)
}

#[napi(js_name = "clipboard_hasText")]
pub fn clipboard_has_text() -> AsyncTask<HasTextTask> {
    AsyncTask::new(HasTextTask)
}

#[napi(js_name = "clipboard_getText")]
pub fn clipboard_get_text() -> AsyncTask<GetTextTask> {
    AsyncTask::new(GetTextTask)
}

#[napi(js_name = "clipboard_setText")]
pub fn clipboard_set_text(text: String) -> AsyncTask<SetTextTask> {
    AsyncTask::new(SetTextTask { text })
}

#[napi(js_name = "clipboard_hasImage")]
pub fn clipboard_has_image() -> AsyncTask<HasImageTask> {
    AsyncTask::new(HasImageTask)
}

#[napi(js_name = "clipboard_getImage")]
pub fn clipboard_get_image() -> AsyncTask<GetImageTask> {
    AsyncTask::new(GetImageTask)
}

#[napi(js_name = "clipboard_setImage")]
pub fn clipboard_set_image(width: u32, height: u32, data: Uint32Array) -> AsyncTask<SetImageTask> {
    AsyncTask::new(SetImageTask { width, height, data: data.to_vec() })
}

#[napi(js_name = "clipboard_getSequence")]
pub fn clipboard_get_sequence() -> AsyncTask<GetSequenceTask> {
    AsyncTask::new(GetSequenceTask)
}
