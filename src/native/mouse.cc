#include "native.h"

static Robot::Mouse gMouse;

static void mouse_click(const Napi::CallbackInfo& info) {
  gMouse.Click((Robot::Button)info[0].As<Napi::Number>().Int32Value());
}

static void mouse_press(const Napi::CallbackInfo& info) {
  gMouse.Press((Robot::Button)info[0].As<Napi::Number>().Int32Value());
}

static void mouse_release(const Napi::CallbackInfo& info) {
  gMouse.Release((Robot::Button)info[0].As<Napi::Number>().Int32Value());
}

static void mouse_scrollH(const Napi::CallbackInfo& info) {
  gMouse.ScrollH(info[0].As<Napi::Number>());
}

static void mouse_scrollV(const Napi::CallbackInfo& info) {
  gMouse.ScrollV(info[0].As<Napi::Number>());
}

static Napi::Value mouse_getPos(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto p = Robot::Mouse::GetPos();
  auto o = Napi::Object::New(env);
  o["x"] = Napi::Number::New(env, p.X);
  o["y"] = Napi::Number::New(env, p.Y);
  return o;
}

static void mouse_setPos(const Napi::CallbackInfo& info) {
  Robot::Mouse::SetPos(Robot::Point(
    info[0].As<Napi::Number>().Int32Value(),
    info[1].As<Napi::Number>().Int32Value()
  ));
}

static Napi::Value mouse_getState(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto o = Napi::Object::New(env);
  Robot::ButtonState state;
  if (Robot::Mouse::GetState(state)) {
    for (auto el : state) {
      o.Set(el.first, Napi::Boolean::New(env, el.second));
    }
  }
  return o;
}

static Napi::Value mouse_getButtonState(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  return Napi::Boolean::New(env, Robot::Mouse::GetState((Robot::Button)info[0].As<Napi::Number>().Int32Value()));
}

void InitMouse(Napi::Env env, Napi::Object exports) {
  exports["mouse_click"] = Napi::Function::New(env, mouse_click);
  exports["mouse_press"] = Napi::Function::New(env, mouse_press);
  exports["mouse_release"] = Napi::Function::New(env, mouse_release);
  exports["mouse_scrollH"] = Napi::Function::New(env, mouse_scrollH);
  exports["mouse_scrollV"] = Napi::Function::New(env, mouse_scrollV);
  exports["mouse_getPos"] = Napi::Function::New(env, mouse_getPos);
  exports["mouse_setPos"] = Napi::Function::New(env, mouse_setPos);
  exports["mouse_getState"] = Napi::Function::New(env, mouse_getState);
  exports["mouse_getButtonState"] = Napi::Function::New(env, mouse_getButtonState);
}
