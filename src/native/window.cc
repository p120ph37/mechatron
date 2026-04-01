#include "native.h"

static Napi::Value window_isValid(const Napi::CallbackInfo& info) {
  auto w = Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value());
  return Napi::Boolean::New(info.Env(), w.IsValid());
}

static void window_close(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).Close();
}

static Napi::Value window_isTopMost(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).IsTopMost());
}

static Napi::Value window_isBorderless(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).IsBorderless());
}

static Napi::Value window_isMinimized(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).IsMinimized());
}

static Napi::Value window_isMaximized(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).IsMaximized());
}

static void window_setTopMost(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .SetTopMost(info[1].As<Napi::Boolean>());
}

static void window_setBorderless(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .SetBorderless(info[1].As<Napi::Boolean>());
}

static void window_setMinimized(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .SetMinimized(info[1].As<Napi::Boolean>());
}

static void window_setMaximized(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .SetMaximized(info[1].As<Napi::Boolean>());
}

static Napi::Value window_getProcess(const Napi::CallbackInfo& info) {
  auto w = Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value());
  return Napi::Number::New(info.Env(), w.GetProcess().GetPID());
}

static Napi::Value window_getPID(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(),
    Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).GetPID());
}

static Napi::Value window_getHandle(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), (double)info[0].As<Napi::Number>().Int64Value());
}

static Napi::Value window_setHandle(const Napi::CallbackInfo& info) {
  auto w = Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value());
  return Napi::Boolean::New(info.Env(), w.SetHandle(info[1].As<Napi::Number>().Int64Value()));
}

static Napi::Value window_getTitle(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(),
    Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).GetTitle());
}

static void window_setTitle(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .SetTitle(info[1].As<Napi::String>().Utf8Value().c_str());
}

static Napi::Value window_getBounds(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto b = Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).GetBounds();
  auto o = Napi::Object::New(env);
  o["x"] = Napi::Number::New(env, b.X);
  o["y"] = Napi::Number::New(env, b.Y);
  o["w"] = Napi::Number::New(env, b.W);
  o["h"] = Napi::Number::New(env, b.H);
  return o;
}

static void window_setBounds(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .SetBounds(Robot::Bounds(
      info[1].As<Napi::Number>().Int32Value(),
      info[2].As<Napi::Number>().Int32Value(),
      info[3].As<Napi::Number>().Int32Value(),
      info[4].As<Napi::Number>().Int32Value()
    ));
}

static Napi::Value window_getClient(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto b = Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()).GetClient();
  auto o = Napi::Object::New(env);
  o["x"] = Napi::Number::New(env, b.X);
  o["y"] = Napi::Number::New(env, b.Y);
  o["w"] = Napi::Number::New(env, b.W);
  o["h"] = Napi::Number::New(env, b.H);
  return o;
}

static void window_setClient(const Napi::CallbackInfo& info) {
  Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .SetClient(Robot::Bounds(
      info[1].As<Napi::Number>().Int32Value(),
      info[2].As<Napi::Number>().Int32Value(),
      info[3].As<Napi::Number>().Int32Value(),
      info[4].As<Napi::Number>().Int32Value()
    ));
}

static Napi::Value window_mapToClient(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto p = Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .MapToClient(Robot::Point(
      info[1].As<Napi::Number>().Int32Value(),
      info[2].As<Napi::Number>().Int32Value()
    ));
  auto o = Napi::Object::New(env);
  o["x"] = Napi::Number::New(env, p.X);
  o["y"] = Napi::Number::New(env, p.Y);
  return o;
}

static Napi::Value window_mapToScreen(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto p = Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value())
    .MapToScreen(Robot::Point(
      info[1].As<Napi::Number>().Int32Value(),
      info[2].As<Napi::Number>().Int32Value()
    ));
  auto o = Napi::Object::New(env);
  o["x"] = Napi::Number::New(env, p.X);
  o["y"] = Napi::Number::New(env, p.Y);
  return o;
}

static Napi::Value window_getList(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto windows = info[0].IsUndefined()
    ? Robot::Window::GetList()
    : Robot::Window::GetList(info[0].As<Napi::String>().Utf8Value().c_str());
  auto arr = Napi::Array::New(env, windows.size());
  for (size_t i = 0; i < windows.size(); i++) {
    arr[i] = Napi::Number::New(env, (double)windows[i].GetHandle());
  }
  return arr;
}

static Napi::Value window_getActive(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), (double)Robot::Window::GetActive().GetHandle());
}

static void window_setActive(const Napi::CallbackInfo& info) {
  Robot::Window::SetActive(Robot::Window((Robot::uintptr)info[0].As<Napi::Number>().Int64Value()));
}

static Napi::Value window_isAxEnabled(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Window::IsAxEnabled(info[0].IsUndefined() ? false : (bool)info[0].As<Napi::Boolean>()));
}

void InitWindow(Napi::Env env, Napi::Object exports) {
  exports["window_isValid"] = Napi::Function::New(env, window_isValid);
  exports["window_close"] = Napi::Function::New(env, window_close);
  exports["window_isTopMost"] = Napi::Function::New(env, window_isTopMost);
  exports["window_isBorderless"] = Napi::Function::New(env, window_isBorderless);
  exports["window_isMinimized"] = Napi::Function::New(env, window_isMinimized);
  exports["window_isMaximized"] = Napi::Function::New(env, window_isMaximized);
  exports["window_setTopMost"] = Napi::Function::New(env, window_setTopMost);
  exports["window_setBorderless"] = Napi::Function::New(env, window_setBorderless);
  exports["window_setMinimized"] = Napi::Function::New(env, window_setMinimized);
  exports["window_setMaximized"] = Napi::Function::New(env, window_setMaximized);
  exports["window_getProcess"] = Napi::Function::New(env, window_getProcess);
  exports["window_getPID"] = Napi::Function::New(env, window_getPID);
  exports["window_getHandle"] = Napi::Function::New(env, window_getHandle);
  exports["window_setHandle"] = Napi::Function::New(env, window_setHandle);
  exports["window_getTitle"] = Napi::Function::New(env, window_getTitle);
  exports["window_setTitle"] = Napi::Function::New(env, window_setTitle);
  exports["window_getBounds"] = Napi::Function::New(env, window_getBounds);
  exports["window_setBounds"] = Napi::Function::New(env, window_setBounds);
  exports["window_getClient"] = Napi::Function::New(env, window_getClient);
  exports["window_setClient"] = Napi::Function::New(env, window_setClient);
  exports["window_mapToClient"] = Napi::Function::New(env, window_mapToClient);
  exports["window_mapToScreen"] = Napi::Function::New(env, window_mapToScreen);
  exports["window_getList"] = Napi::Function::New(env, window_getList);
  exports["window_getActive"] = Napi::Function::New(env, window_getActive);
  exports["window_setActive"] = Napi::Function::New(env, window_setActive);
  exports["window_isAxEnabled"] = Napi::Function::New(env, window_isAxEnabled);
}
