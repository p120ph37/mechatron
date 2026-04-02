#include "native.h"

#define ADDON_VERSION 0x000000
#define ADDON_VERSION_STR "0.0.0"

static void timer_sleep(const Napi::CallbackInfo& info) {
  Robot::Timer::Sleep(Robot::Range(
    info[0].As<Napi::Number>().Int32Value(),
    info[1].IsUndefined() ? info[0].As<Napi::Number>().Int32Value() : info[1].As<Napi::Number>().Int32Value()
  ));
}

static Napi::Value timer_getCpuTime(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), Robot::Timer::GetCpuTime());
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // Version constants
  exports["ROBOT_VERSION"] = Napi::Number::New(env, ROBOT_VERSION);
  exports["ROBOT_VERSION_STR"] = Napi::String::New(env, ROBOT_VERSION_STR " (" ADDON_VERSION_STR ")");
  exports["ADDON_VERSION"] = Napi::Number::New(env, ADDON_VERSION);
  exports["ADDON_VERSION_STR"] = Napi::String::New(env, ADDON_VERSION_STR);

  // Timer
  exports["sleep"] = Napi::Function::New(env, timer_sleep);
  exports["clock"] = Napi::Function::New(env, timer_getCpuTime);

  // Key constants
  exports["KEY_SPACE"] = Napi::Number::New(env, Robot::Key::KeySpace);
  exports["KEY_ESCAPE"] = Napi::Number::New(env, Robot::Key::KeyEscape);

  exports["KEY_TAB"] = Napi::Number::New(env, Robot::Key::KeyTab);
  exports["KEY_ALT"] = Napi::Number::New(env, Robot::Key::KeyAlt);
  exports["KEY_LALT"] = Napi::Number::New(env, Robot::Key::KeyLAlt);
  exports["KEY_RALT"] = Napi::Number::New(env, Robot::Key::KeyRAlt);
  exports["KEY_CONTROL"] = Napi::Number::New(env, Robot::Key::KeyControl);
  exports["KEY_LCONTROL"] = Napi::Number::New(env, Robot::Key::KeyLControl);
  exports["KEY_RCONTROL"] = Napi::Number::New(env, Robot::Key::KeyRControl);
  exports["KEY_SHIFT"] = Napi::Number::New(env, Robot::Key::KeyShift);
  exports["KEY_LSHIFT"] = Napi::Number::New(env, Robot::Key::KeyLShift);
  exports["KEY_RSHIFT"] = Napi::Number::New(env, Robot::Key::KeyRShift);
  exports["KEY_SYSTEM"] = Napi::Number::New(env, Robot::Key::KeySystem);
  exports["KEY_LSYSTEM"] = Napi::Number::New(env, Robot::Key::KeyLSystem);
  exports["KEY_RSYSTEM"] = Napi::Number::New(env, Robot::Key::KeyRSystem);

  exports["KEY_F1"] = Napi::Number::New(env, Robot::Key::KeyF1);
  exports["KEY_F2"] = Napi::Number::New(env, Robot::Key::KeyF2);
  exports["KEY_F3"] = Napi::Number::New(env, Robot::Key::KeyF3);
  exports["KEY_F4"] = Napi::Number::New(env, Robot::Key::KeyF4);
  exports["KEY_F5"] = Napi::Number::New(env, Robot::Key::KeyF5);
  exports["KEY_F6"] = Napi::Number::New(env, Robot::Key::KeyF6);
  exports["KEY_F7"] = Napi::Number::New(env, Robot::Key::KeyF7);
  exports["KEY_F8"] = Napi::Number::New(env, Robot::Key::KeyF8);
  exports["KEY_F9"] = Napi::Number::New(env, Robot::Key::KeyF9);
  exports["KEY_F10"] = Napi::Number::New(env, Robot::Key::KeyF10);
  exports["KEY_F11"] = Napi::Number::New(env, Robot::Key::KeyF11);
  exports["KEY_F12"] = Napi::Number::New(env, Robot::Key::KeyF12);

  exports["KEY_0"] = Napi::Number::New(env, Robot::Key::Key0);
  exports["KEY_1"] = Napi::Number::New(env, Robot::Key::Key1);
  exports["KEY_2"] = Napi::Number::New(env, Robot::Key::Key2);
  exports["KEY_3"] = Napi::Number::New(env, Robot::Key::Key3);
  exports["KEY_4"] = Napi::Number::New(env, Robot::Key::Key4);
  exports["KEY_5"] = Napi::Number::New(env, Robot::Key::Key5);
  exports["KEY_6"] = Napi::Number::New(env, Robot::Key::Key6);
  exports["KEY_7"] = Napi::Number::New(env, Robot::Key::Key7);
  exports["KEY_8"] = Napi::Number::New(env, Robot::Key::Key8);
  exports["KEY_9"] = Napi::Number::New(env, Robot::Key::Key9);

  exports["KEY_A"] = Napi::Number::New(env, Robot::Key::KeyA);
  exports["KEY_B"] = Napi::Number::New(env, Robot::Key::KeyB);
  exports["KEY_C"] = Napi::Number::New(env, Robot::Key::KeyC);
  exports["KEY_D"] = Napi::Number::New(env, Robot::Key::KeyD);
  exports["KEY_E"] = Napi::Number::New(env, Robot::Key::KeyE);
  exports["KEY_F"] = Napi::Number::New(env, Robot::Key::KeyF);
  exports["KEY_G"] = Napi::Number::New(env, Robot::Key::KeyG);
  exports["KEY_H"] = Napi::Number::New(env, Robot::Key::KeyH);
  exports["KEY_I"] = Napi::Number::New(env, Robot::Key::KeyI);
  exports["KEY_J"] = Napi::Number::New(env, Robot::Key::KeyJ);
  exports["KEY_K"] = Napi::Number::New(env, Robot::Key::KeyK);
  exports["KEY_L"] = Napi::Number::New(env, Robot::Key::KeyL);
  exports["KEY_M"] = Napi::Number::New(env, Robot::Key::KeyM);
  exports["KEY_N"] = Napi::Number::New(env, Robot::Key::KeyN);
  exports["KEY_O"] = Napi::Number::New(env, Robot::Key::KeyO);
  exports["KEY_P"] = Napi::Number::New(env, Robot::Key::KeyP);
  exports["KEY_Q"] = Napi::Number::New(env, Robot::Key::KeyQ);
  exports["KEY_R"] = Napi::Number::New(env, Robot::Key::KeyR);
  exports["KEY_S"] = Napi::Number::New(env, Robot::Key::KeyS);
  exports["KEY_T"] = Napi::Number::New(env, Robot::Key::KeyT);
  exports["KEY_U"] = Napi::Number::New(env, Robot::Key::KeyU);
  exports["KEY_V"] = Napi::Number::New(env, Robot::Key::KeyV);
  exports["KEY_W"] = Napi::Number::New(env, Robot::Key::KeyW);
  exports["KEY_X"] = Napi::Number::New(env, Robot::Key::KeyX);
  exports["KEY_Y"] = Napi::Number::New(env, Robot::Key::KeyY);
  exports["KEY_Z"] = Napi::Number::New(env, Robot::Key::KeyZ);

  exports["KEY_GRAVE"] = Napi::Number::New(env, Robot::Key::KeyGrave);
  exports["KEY_MINUS"] = Napi::Number::New(env, Robot::Key::KeyMinus);
  exports["KEY_EQUAL"] = Napi::Number::New(env, Robot::Key::KeyEqual);
  exports["KEY_BACKSPACE"] = Napi::Number::New(env, Robot::Key::KeyBackspace);
  exports["KEY_LBRACKET"] = Napi::Number::New(env, Robot::Key::KeyLBracket);
  exports["KEY_RBRACKET"] = Napi::Number::New(env, Robot::Key::KeyRBracket);
  exports["KEY_BACKSLASH"] = Napi::Number::New(env, Robot::Key::KeyBackslash);
  exports["KEY_SEMICOLON"] = Napi::Number::New(env, Robot::Key::KeySemicolon);
  exports["KEY_QUOTE"] = Napi::Number::New(env, Robot::Key::KeyQuote);
  exports["KEY_RETURN"] = Napi::Number::New(env, Robot::Key::KeyReturn);
  exports["KEY_COMMA"] = Napi::Number::New(env, Robot::Key::KeyComma);
  exports["KEY_PERIOD"] = Napi::Number::New(env, Robot::Key::KeyPeriod);
  exports["KEY_SLASH"] = Napi::Number::New(env, Robot::Key::KeySlash);

  exports["KEY_LEFT"] = Napi::Number::New(env, Robot::Key::KeyLeft);
  exports["KEY_UP"] = Napi::Number::New(env, Robot::Key::KeyUp);
  exports["KEY_RIGHT"] = Napi::Number::New(env, Robot::Key::KeyRight);
  exports["KEY_DOWN"] = Napi::Number::New(env, Robot::Key::KeyDown);

  exports["KEY_PRINT"] = Napi::Number::New(env, Robot::Key::KeyPrint);
  exports["KEY_PAUSE"] = Napi::Number::New(env, Robot::Key::KeyPause);
  exports["KEY_INSERT"] = Napi::Number::New(env, Robot::Key::KeyInsert);
  exports["KEY_DELETE"] = Napi::Number::New(env, Robot::Key::KeyDelete);
  exports["KEY_HOME"] = Napi::Number::New(env, Robot::Key::KeyHome);
  exports["KEY_END"] = Napi::Number::New(env, Robot::Key::KeyEnd);
  exports["KEY_PAGE_UP"] = Napi::Number::New(env, Robot::Key::KeyPageUp);
  exports["KEY_PAGE_DOWN"] = Napi::Number::New(env, Robot::Key::KeyPageDown);

  exports["KEY_ADD"] = Napi::Number::New(env, Robot::Key::KeyAdd);
  exports["KEY_SUBTRACT"] = Napi::Number::New(env, Robot::Key::KeySubtract);
  exports["KEY_MULTIPLY"] = Napi::Number::New(env, Robot::Key::KeyMultiply);
  exports["KEY_DIVIDE"] = Napi::Number::New(env, Robot::Key::KeyDivide);
  exports["KEY_DECIMAL"] = Napi::Number::New(env, Robot::Key::KeyDecimal);
  exports["KEY_ENTER"] = Napi::Number::New(env, Robot::Key::KeyEnter);

  exports["KEY_NUM0"] = Napi::Number::New(env, Robot::Key::KeyNum0);
  exports["KEY_NUM1"] = Napi::Number::New(env, Robot::Key::KeyNum1);
  exports["KEY_NUM2"] = Napi::Number::New(env, Robot::Key::KeyNum2);
  exports["KEY_NUM3"] = Napi::Number::New(env, Robot::Key::KeyNum3);
  exports["KEY_NUM4"] = Napi::Number::New(env, Robot::Key::KeyNum4);
  exports["KEY_NUM5"] = Napi::Number::New(env, Robot::Key::KeyNum5);
  exports["KEY_NUM6"] = Napi::Number::New(env, Robot::Key::KeyNum6);
  exports["KEY_NUM7"] = Napi::Number::New(env, Robot::Key::KeyNum7);
  exports["KEY_NUM8"] = Napi::Number::New(env, Robot::Key::KeyNum8);
  exports["KEY_NUM9"] = Napi::Number::New(env, Robot::Key::KeyNum9);

  exports["KEY_CAPS_LOCK"] = Napi::Number::New(env, Robot::Key::KeyCapsLock);
  exports["KEY_SCROLL_LOCK"] = Napi::Number::New(env, Robot::Key::KeyScrollLock);
  exports["KEY_NUM_LOCK"] = Napi::Number::New(env, Robot::Key::KeyNumLock);

  // Button constants
  exports["BUTTON_LEFT"] = Napi::Number::New(env, Robot::Button::ButtonLeft);
  exports["BUTTON_MID"] = Napi::Number::New(env, Robot::Button::ButtonMid);
  exports["BUTTON_MIDDLE"] = Napi::Number::New(env, Robot::Button::ButtonMiddle);
  exports["BUTTON_RIGHT"] = Napi::Number::New(env, Robot::Button::ButtonRight);
  exports["BUTTON_X1"] = Napi::Number::New(env, Robot::Button::ButtonX1);
  exports["BUTTON_X2"] = Napi::Number::New(env, Robot::Button::ButtonX2);

  // Memory flag constants
  exports["MEMORY_DEFAULT"] = Napi::Number::New(env, Robot::Memory::Default);
  exports["MEMORY_SKIP_ERRORS"] = Napi::Number::New(env, Robot::Memory::SkipErrors);
  exports["MEMORY_AUTO_ACCESS"] = Napi::Number::New(env, Robot::Memory::AutoAccess);

  // Domain initializers
  InitKeyboard(env, exports);
  InitMouse(env, exports);
  InitClipboard(env, exports);
  InitScreen(env, exports);
  InitWindow(env, exports);
  InitProcess(env, exports);
  InitMemory(env, exports);

  return exports;
}

NODE_API_MODULE(robot, Init)
