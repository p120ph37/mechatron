#include "native.h"

static Robot::Keyboard gKeyboard;

static void keyboard_click(const Napi::CallbackInfo& info) {
  gKeyboard.Click((Robot::Key)info[0].As<Napi::Number>().Int32Value());
}

static void keyboard_press(const Napi::CallbackInfo& info) {
  gKeyboard.Press((Robot::Key)info[0].As<Napi::Number>().Int32Value());
}

static void keyboard_release(const Napi::CallbackInfo& info) {
  gKeyboard.Release((Robot::Key)info[0].As<Napi::Number>().Int32Value());
}

static Napi::Value keyboard_compile(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  Robot::KeyList keys;
  if (Robot::Keyboard::Compile(info[0].As<Napi::String>().Utf8Value().c_str(), keys)) {
    auto arr = Napi::Array::New(env, keys.size());
    for (size_t i = 0; i < keys.size(); i++) {
      auto o = Napi::Object::New(env);
      o["down"] = Napi::Boolean::New(env, keys[i].first);
      o["key"] = Napi::Number::New(env, (uint32_t)keys[i].second);
      arr[i] = o;
    }
    return arr;
  }
  return Napi::Array::New(env);
}

static Napi::Value keyboard_getState(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto o = Napi::Object::New(env);
  Robot::KeyState state;
  if (Robot::Keyboard::GetState(state)) {
    for (auto el : state) {
      o.Set(el.first, Napi::Boolean::New(env, el.second));
    }
  }
  return o;
}

static Napi::Value keyboard_getKeyState(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  return Napi::Boolean::New(env, Robot::Keyboard::GetState((Robot::Key)info[0].As<Napi::Number>().Int32Value()));
}

void InitKeyboard(Napi::Env env, Napi::Object exports) {
  exports["keyboard_click"] = Napi::Function::New(env, keyboard_click);
  exports["keyboard_press"] = Napi::Function::New(env, keyboard_press);
  exports["keyboard_release"] = Napi::Function::New(env, keyboard_release);
  exports["keyboard_compile"] = Napi::Function::New(env, keyboard_compile);
  exports["keyboard_getState"] = Napi::Function::New(env, keyboard_getState);
  exports["keyboard_getKeyState"] = Napi::Function::New(env, keyboard_getKeyState);
}
