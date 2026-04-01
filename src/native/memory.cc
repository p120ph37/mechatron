#include "native.h"

static Napi::Object regionToObj(Napi::Env env, const Robot::Memory::Region& r) {
  auto o = Napi::Object::New(env);
  o["valid"] = Napi::Boolean::New(env, r.Valid);
  o["bound"] = Napi::Boolean::New(env, r.Bound);
  o["start"] = Napi::Number::New(env, (double)r.Start);
  o["stop"] = Napi::Number::New(env, (double)r.Stop);
  o["size"] = Napi::Number::New(env, (double)r.Size);
  o["readable"] = Napi::Boolean::New(env, r.Readable);
  o["writable"] = Napi::Boolean::New(env, r.Writable);
  o["executable"] = Napi::Boolean::New(env, r.Executable);
  o["access"] = Napi::Number::New(env, r.Access);
  o.Set("private", Napi::Boolean::New(env, r.Private));
  o["guarded"] = Napi::Boolean::New(env, r.Guarded);
  return o;
}

static Napi::Value memory_isValid(const Napi::CallbackInfo& info) {
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  return Napi::Boolean::New(info.Env(), m.IsValid());
}

static Napi::Value memory_getRegion(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  return regionToObj(env, m.GetRegion((Robot::uintptr)info[1].As<Napi::Number>().DoubleValue()));
}

static Napi::Value memory_getRegions(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  auto regions = m.GetRegions(
    info[1].IsUndefined() ? 0 : (Robot::uintptr)info[1].As<Napi::Number>().DoubleValue(),
    info[2].IsUndefined() ? (Robot::uintptr)-1 : (Robot::uintptr)info[2].As<Napi::Number>().DoubleValue()
  );
  auto arr = Napi::Array::New(env, regions.size());
  for (size_t i = 0; i < regions.size(); i++) {
    arr[i] = regionToObj(env, regions[i]);
  }
  return arr;
}

static Napi::Value memory_setAccess(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  auto r = m.GetRegion((Robot::uintptr)info[1].As<Napi::Number>().DoubleValue());
  return Napi::Boolean::New(env, m.SetAccess(r,
    (bool)info[2].As<Napi::Boolean>(),
    (bool)info[3].As<Napi::Boolean>(),
    (bool)info[4].As<Napi::Boolean>()
  ));
}

static Napi::Value memory_setAccessFlags(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  auto r = m.GetRegion((Robot::uintptr)info[1].As<Napi::Number>().DoubleValue());
  return Napi::Boolean::New(env, m.SetAccess(r, (Robot::uint32)info[2].As<Napi::Number>().Uint32Value()));
}

static Napi::Value memory_getPtrSize(const Napi::CallbackInfo& info) {
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  return Napi::Number::New(info.Env(), (double)m.GetPtrSize());
}

static Napi::Value memory_getMinAddress(const Napi::CallbackInfo& info) {
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  return Napi::Number::New(info.Env(), (double)m.GetMinAddress());
}

static Napi::Value memory_getMaxAddress(const Napi::CallbackInfo& info) {
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  return Napi::Number::New(info.Env(), (double)m.GetMaxAddress());
}

static Napi::Value memory_getPageSize(const Napi::CallbackInfo& info) {
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  return Napi::Number::New(info.Env(), (double)m.GetPageSize());
}

static Napi::Value memory_find(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  std::string flags_str;
  const char* flags_ptr = nullptr;
  if (!info[5].IsUndefined()) {
    flags_str = info[5].As<Napi::String>().Utf8Value();
    flags_ptr = flags_str.c_str();
  }
  auto addresses = m.Find(
    info[1].As<Napi::String>().Utf8Value().c_str(),
    info[2].IsUndefined() ? 0 : (Robot::uintptr)info[2].As<Napi::Number>().DoubleValue(),
    info[3].IsUndefined() ? (Robot::uintptr)-1 : (Robot::uintptr)info[3].As<Napi::Number>().DoubleValue(),
    info[4].IsUndefined() ? 0 : (Robot::uintptr)info[4].As<Napi::Number>().DoubleValue(),
    flags_ptr
  );
  auto arr = Napi::Array::New(env, addresses.size());
  for (size_t i = 0; i < addresses.size(); i++) {
    arr[i] = Napi::Number::New(env, (double)addresses[i]);
  }
  return arr;
}

static Napi::Value memory_readData(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  auto address = (Robot::uintptr)info[1].As<Napi::Number>().DoubleValue();
  auto length = (Robot::uintptr)info[2].As<Napi::Number>().DoubleValue();
  auto flags = info[3].IsUndefined() ? Robot::Memory::Default : (Robot::Memory::Flags)info[3].As<Napi::Number>().Int32Value();
  auto buf = Napi::Buffer<uint8_t>::New(env, length);
  auto read = m.ReadData(address, buf.Data(), length, flags);
  if (read > 0) return buf;
  return env.Null();
}

static Napi::Value memory_writeData(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  auto address = (Robot::uintptr)info[1].As<Napi::Number>().DoubleValue();
  auto buffer = info[2].As<Napi::Buffer<uint8_t>>();
  auto flags = info[3].IsUndefined() ? Robot::Memory::Default : (Robot::Memory::Flags)info[3].As<Napi::Number>().Int32Value();
  return Napi::Number::New(env, (double)m.WriteData(address, buffer.Data(), buffer.Length(), flags));
}

static Napi::Value memory_createCache(const Napi::CallbackInfo& info) {
  auto m = Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value()));
  return Napi::Boolean::New(info.Env(), m.CreateCache(
    (Robot::uintptr)info[1].As<Napi::Number>().DoubleValue(),
    (Robot::uintptr)info[2].As<Napi::Number>().DoubleValue(),
    (Robot::uintptr)info[3].As<Napi::Number>().DoubleValue(),
    info[4].IsUndefined() ? 0 : (Robot::uintptr)info[4].As<Napi::Number>().DoubleValue(),
    info[5].IsUndefined() ? 0 : (Robot::uintptr)info[5].As<Napi::Number>().DoubleValue()
  ));
}

static void memory_clearCache(const Napi::CallbackInfo& info) {
  Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value())).ClearCache();
}

static void memory_deleteCache(const Napi::CallbackInfo& info) {
  Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value())).DeleteCache();
}

static Napi::Value memory_isCaching(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value())).IsCaching());
}

static Napi::Value memory_getCacheSize(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(),
    (double)Robot::Memory(Robot::Process(info[0].As<Napi::Number>().Int32Value())).GetCacheSize());
}

void InitMemory(Napi::Env env, Napi::Object exports) {
  exports["memory_isValid"] = Napi::Function::New(env, memory_isValid);
  exports["memory_getRegion"] = Napi::Function::New(env, memory_getRegion);
  exports["memory_getRegions"] = Napi::Function::New(env, memory_getRegions);
  exports["memory_setAccess"] = Napi::Function::New(env, memory_setAccess);
  exports["memory_setAccessFlags"] = Napi::Function::New(env, memory_setAccessFlags);
  exports["memory_getPtrSize"] = Napi::Function::New(env, memory_getPtrSize);
  exports["memory_getMinAddress"] = Napi::Function::New(env, memory_getMinAddress);
  exports["memory_getMaxAddress"] = Napi::Function::New(env, memory_getMaxAddress);
  exports["memory_getPageSize"] = Napi::Function::New(env, memory_getPageSize);
  exports["memory_find"] = Napi::Function::New(env, memory_find);
  exports["memory_readData"] = Napi::Function::New(env, memory_readData);
  exports["memory_writeData"] = Napi::Function::New(env, memory_writeData);
  exports["memory_createCache"] = Napi::Function::New(env, memory_createCache);
  exports["memory_clearCache"] = Napi::Function::New(env, memory_clearCache);
  exports["memory_deleteCache"] = Napi::Function::New(env, memory_deleteCache);
  exports["memory_isCaching"] = Napi::Function::New(env, memory_isCaching);
  exports["memory_getCacheSize"] = Napi::Function::New(env, memory_getCacheSize);
}
