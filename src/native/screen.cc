#include "native.h"

static Napi::Value screen_synchronize(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (!Robot::Screen::Synchronize()) return env.Null();
  auto screens = Robot::Screen::GetList();
  auto arr = Napi::Array::New(env, screens.size());
  for (size_t i = 0; i < screens.size(); i++) {
    auto b = screens[i]->GetBounds();
    auto u = screens[i]->GetUsable();
    auto o = Napi::Object::New(env);
    auto bo = Napi::Object::New(env);
    bo["x"] = Napi::Number::New(env, b.X);
    bo["y"] = Napi::Number::New(env, b.Y);
    bo["w"] = Napi::Number::New(env, b.W);
    bo["h"] = Napi::Number::New(env, b.H);
    auto uo = Napi::Object::New(env);
    uo["x"] = Napi::Number::New(env, u.X);
    uo["y"] = Napi::Number::New(env, u.Y);
    uo["w"] = Napi::Number::New(env, u.W);
    uo["h"] = Napi::Number::New(env, u.H);
    o["bounds"] = bo;
    o["usable"] = uo;
    arr[i] = o;
  }
  return arr;
}

static Napi::Value screen_grabScreen(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  Robot::Image img;
  Robot::Bounds bounds(
    info[0].As<Napi::Number>().Int32Value(),
    info[1].As<Napi::Number>().Int32Value(),
    info[2].As<Napi::Number>().Int32Value(),
    info[3].As<Napi::Number>().Int32Value()
  );
  Robot::Window win;
  if (!info[4].IsUndefined()) {
    win = Robot::Window((Robot::uintptr)info[4].As<Napi::Number>().Int64Value());
  }
  if (!Robot::Screen::GrabScreen(img, bounds, win)) return env.Null();
  uint32_t len = img.GetLength();
  auto ab = Napi::ArrayBuffer::New(env, len * sizeof(Robot::uint32));
  memcpy(ab.Data(), img.GetData(), len * sizeof(Robot::uint32));
  return Napi::Uint32Array::New(env, len, ab, 0);
}

static Napi::Value screen_isCompositing(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), Robot::Screen::IsCompositing());
}

static void screen_setCompositing(const Napi::CallbackInfo& info) {
  Robot::Screen::SetCompositing(info[0].As<Napi::Boolean>());
}

static Napi::Value screen_getTotalBounds(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto b = Robot::Screen::GetTotalBounds();
  auto o = Napi::Object::New(env);
  o["x"] = Napi::Number::New(env, b.X);
  o["y"] = Napi::Number::New(env, b.Y);
  o["w"] = Napi::Number::New(env, b.W);
  o["h"] = Napi::Number::New(env, b.H);
  return o;
}

static Napi::Value screen_getTotalUsable(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto u = Robot::Screen::GetTotalUsable();
  auto o = Napi::Object::New(env);
  o["x"] = Napi::Number::New(env, u.X);
  o["y"] = Napi::Number::New(env, u.Y);
  o["w"] = Napi::Number::New(env, u.W);
  o["h"] = Napi::Number::New(env, u.H);
  return o;
}

void InitScreen(Napi::Env env, Napi::Object exports) {
  exports["screen_synchronize"] = Napi::Function::New(env, screen_synchronize);
  exports["screen_grabScreen"] = Napi::Function::New(env, screen_grabScreen);
  exports["screen_isCompositing"] = Napi::Function::New(env, screen_isCompositing);
  exports["screen_setCompositing"] = Napi::Function::New(env, screen_setCompositing);
  exports["screen_getTotalBounds"] = Napi::Function::New(env, screen_getTotalBounds);
  exports["screen_getTotalUsable"] = Napi::Function::New(env, screen_getTotalUsable);
}
