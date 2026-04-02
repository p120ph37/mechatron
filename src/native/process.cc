#include "native.h"

static Napi::Value process_open(const Napi::CallbackInfo& info) {
  auto p = Robot::Process(info[0].As<Napi::Number>().Int32Value());
  return Napi::Boolean::New(info.Env(), p.Open(info[0].As<Napi::Number>().Int32Value()));
}

static void process_close(const Napi::CallbackInfo& info) {
  Robot::Process(info[0].As<Napi::Number>().Int32Value()).Close();
}

static Napi::Value process_isValid(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Process(info[0].As<Napi::Number>().Int32Value()).IsValid());
}

static Napi::Value process_is64Bit(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Process(info[0].As<Napi::Number>().Int32Value()).Is64Bit());
}

static Napi::Value process_isDebugged(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Process(info[0].As<Napi::Number>().Int32Value()).IsDebugged());
}

static Napi::Value process_getPID(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), info[0].As<Napi::Number>().Int32Value());
}

static Napi::Value process_getName(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(),
    Robot::Process(info[0].As<Napi::Number>().Int32Value()).GetName());
}

static Napi::Value process_getPath(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(),
    Robot::Process(info[0].As<Napi::Number>().Int32Value()).GetPath());
}

static void process_exit(const Napi::CallbackInfo& info) {
  Robot::Process(info[0].As<Napi::Number>().Int32Value()).Exit();
}

static void process_kill(const Napi::CallbackInfo& info) {
  Robot::Process(info[0].As<Napi::Number>().Int32Value()).Kill();
}

static Napi::Value process_hasExited(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Process(info[0].As<Napi::Number>().Int32Value()).HasExited());
}

static Napi::Value process_getModules(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto p = Robot::Process(info[0].As<Napi::Number>().Int32Value());
  auto modules = info[1].IsUndefined()
    ? p.GetModules()
    : p.GetModules(info[1].As<Napi::String>().Utf8Value().c_str());
  auto arr = Napi::Array::New(env, modules.size());
  for (size_t i = 0; i < modules.size(); i++) {
    auto o = Napi::Object::New(env);
    o["valid"] = Napi::Boolean::New(env, modules[i].IsValid());
    o["name"] = Napi::String::New(env, modules[i].GetName());
    o["path"] = Napi::String::New(env, modules[i].GetPath());
    o["base"] = Napi::Number::New(env, (double)modules[i].GetBase());
    o["size"] = Napi::Number::New(env, (double)modules[i].GetSize());
    o["pid"] = Napi::Number::New(env, modules[i].GetProcess().GetPID());
    arr[i] = o;
  }
  return arr;
}

static Napi::Value process_getWindows(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto p = Robot::Process(info[0].As<Napi::Number>().Int32Value());
  auto windows = info[1].IsUndefined()
    ? p.GetWindows()
    : p.GetWindows(info[1].As<Napi::String>().Utf8Value().c_str());
  auto arr = Napi::Array::New(env, windows.size());
  for (size_t i = 0; i < windows.size(); i++) {
    arr[i] = Napi::Number::New(env, (double)windows[i].GetHandle());
  }
  return arr;
}

static Napi::Value process_getList(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto processes = info[0].IsUndefined()
    ? Robot::Process::GetList()
    : Robot::Process::GetList(info[0].As<Napi::String>().Utf8Value().c_str());
  auto arr = Napi::Array::New(env, processes.size());
  for (size_t i = 0; i < processes.size(); i++) {
    arr[i] = Napi::Number::New(env, processes[i].GetPID());
  }
  return arr;
}

static Napi::Value process_getCurrent(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), Robot::Process::GetCurrent().GetPID());
}

static Napi::Value process_isSys64Bit(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), Robot::Process::IsSys64Bit());
}

static Napi::Value process_getSegments(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto proc = Robot::Process(info[0].As<Napi::Number>().Int32Value());
  Robot::Module module(proc, "", "",
    (Robot::uintptr)info[1].As<Napi::Number>().DoubleValue(), 0);
  auto list = module.GetSegments();
  auto arr = Napi::Array::New(env, list.size());
  for (size_t i = 0; i < list.size(); i++) {
    auto obj = Napi::Object::New(env);
    obj["valid"] = Napi::Boolean::New(env, list[i].Valid);
    obj["base"] = Napi::Number::New(env, (double)list[i].Base);
    obj["size"] = Napi::Number::New(env, (double)list[i].Size);
    obj["name"] = Napi::String::New(env, list[i].Name);
    arr[i] = obj;
  }
  return arr;
}

void InitProcess(Napi::Env env, Napi::Object exports) {
  exports["process_open"] = Napi::Function::New(env, process_open);
  exports["process_close"] = Napi::Function::New(env, process_close);
  exports["process_isValid"] = Napi::Function::New(env, process_isValid);
  exports["process_is64Bit"] = Napi::Function::New(env, process_is64Bit);
  exports["process_isDebugged"] = Napi::Function::New(env, process_isDebugged);
  exports["process_getPID"] = Napi::Function::New(env, process_getPID);
  exports["process_getName"] = Napi::Function::New(env, process_getName);
  exports["process_getPath"] = Napi::Function::New(env, process_getPath);
  exports["process_exit"] = Napi::Function::New(env, process_exit);
  exports["process_kill"] = Napi::Function::New(env, process_kill);
  exports["process_hasExited"] = Napi::Function::New(env, process_hasExited);
  exports["process_getModules"] = Napi::Function::New(env, process_getModules);
  exports["process_getWindows"] = Napi::Function::New(env, process_getWindows);
  exports["process_getList"] = Napi::Function::New(env, process_getList);
  exports["process_getCurrent"] = Napi::Function::New(env, process_getCurrent);
  exports["process_isSys64Bit"] = Napi::Function::New(env, process_isSys64Bit);
  exports["process_getSegments"] = Napi::Function::New(env, process_getSegments);
}
