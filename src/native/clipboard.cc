#include "native.h"

static Napi::Value clipboard_clear(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), Robot::Clipboard::Clear());
}

static Napi::Value clipboard_hasText(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), Robot::Clipboard::HasText());
}

static Napi::Value clipboard_getText(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), Robot::Clipboard::GetText().data());
}

static Napi::Value clipboard_setText(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  return Napi::Boolean::New(env, Robot::Clipboard::SetText(
    info[0].As<Napi::String>().Utf8Value().c_str()
  ));
}

static Napi::Value clipboard_hasImage(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), Robot::Clipboard::HasImage());
}

static Napi::Value clipboard_getImage(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  Robot::Image img;
  if (!Robot::Clipboard::GetImage(img)) return env.Null();
  uint32_t w = img.GetWidth();
  uint32_t h = img.GetHeight();
  uint32_t len = img.GetLength();
  auto o = Napi::Object::New(env);
  o["width"] = Napi::Number::New(env, w);
  o["height"] = Napi::Number::New(env, h);
  // Copy pixel data into a new Uint32Array
  auto ab = Napi::ArrayBuffer::New(env, len * sizeof(Robot::uint32));
  memcpy(ab.Data(), img.GetData(), len * sizeof(Robot::uint32));
  o["data"] = Napi::Uint32Array::New(env, len, ab, 0);
  return o;
}

static Napi::Value clipboard_setImage(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  uint32_t w = info[0].As<Napi::Number>().Uint32Value();
  uint32_t h = info[1].As<Napi::Number>().Uint32Value();
  auto data = info[2].As<Napi::Uint32Array>();
  Robot::Image img(w, h);
  if (img.GetData() && data.ElementLength() >= (size_t)(w * h)) {
    memcpy(img.GetData(), data.Data(), w * h * sizeof(Robot::uint32));
  }
  return Napi::Boolean::New(env, Robot::Clipboard::SetImage(img));
}

static Napi::Value clipboard_getSequence(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), Robot::Clipboard::GetSequence());
}

void InitClipboard(Napi::Env env, Napi::Object exports) {
  exports["clipboard_clear"] = Napi::Function::New(env, clipboard_clear);
  exports["clipboard_hasText"] = Napi::Function::New(env, clipboard_hasText);
  exports["clipboard_getText"] = Napi::Function::New(env, clipboard_getText);
  exports["clipboard_setText"] = Napi::Function::New(env, clipboard_setText);
  exports["clipboard_hasImage"] = Napi::Function::New(env, clipboard_hasImage);
  exports["clipboard_getImage"] = Napi::Function::New(env, clipboard_getImage);
  exports["clipboard_setImage"] = Napi::Function::New(env, clipboard_setImage);
  exports["clipboard_getSequence"] = Napi::Function::New(env, clipboard_getSequence);
}
