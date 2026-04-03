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
  auto tb = Robot::Screen::GetTotalBounds();
  auto tbo = Napi::Object::New(env);
  tbo["x"] = Napi::Number::New(env, tb.X);
  tbo["y"] = Napi::Number::New(env, tb.Y);
  tbo["w"] = Napi::Number::New(env, tb.W);
  tbo["h"] = Napi::Number::New(env, tb.H);
  auto tu = Robot::Screen::GetTotalUsable();
  auto tuo = Napi::Object::New(env);
  tuo["x"] = Napi::Number::New(env, tu.X);
  tuo["y"] = Napi::Number::New(env, tu.Y);
  tuo["w"] = Napi::Number::New(env, tu.W);
  tuo["h"] = Napi::Number::New(env, tu.H);
  auto result = Napi::Object::New(env);
  result["screens"] = arr;
  result["totalBounds"] = tbo;
  result["totalUsable"] = tuo;
  return result;
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

void InitScreen(Napi::Env env, Napi::Object exports) {
  exports["screen_synchronize"] = Napi::Function::New(env, screen_synchronize);
  exports["screen_grabScreen"] = Napi::Function::New(env, screen_grabScreen);
  exports["screen_isCompositing"] = Napi::Function::New(env, screen_isCompositing);
  exports["screen_setCompositing"] = Napi::Function::New(env, screen_setCompositing);
}
