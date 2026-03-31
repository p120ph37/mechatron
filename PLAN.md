# Mechatron Refactoring Plan - Flat NAPI Backend

## Completed Work

### TypeScript Layer (lib/)
All classes ported from C++ to TypeScript with full argument validation:
- `lib/native.ts` - NativeBackend interface + bridge adapter wrapping existing class-based addon
- `lib/index.ts` - Entry point with callableClass() proxy, constants, exports
- `lib/Point.ts`, `lib/Size.ts`, `lib/Bounds.ts`, `lib/Range.ts`, `lib/Color.ts`
- `lib/Hash.ts`, `lib/Image.ts`, `lib/Timer.ts`
- `lib/Keyboard.ts`, `lib/Mouse.ts`, `lib/Clipboard.ts`
- `lib/Screen.ts`, `lib/Window.ts`, `lib/Process.ts`, `lib/Module.ts`, `lib/Memory.ts`
- `tsconfig.json`

### Build & Test
- Bun bundler: `/root/.bun/bin/bun build lib/index.ts --outdir dist --target node --format cjs --external node-gyp-build --external path`
- `package.json` main changed to `dist/index.js`
- **Tests passing**: `node test/test.js types timer` both pass

## Next Step: Thin the C++ NAPI Addon

### Goal
Replace the class-based C++ adapter layer with a single flat-function NAPI module matching the `NativeBackend` interface in `lib/native.ts`. Then update `native.ts` to call flat functions directly instead of using the bridge adapter.

### Current Architecture (to be replaced)
```
lib/native.ts (createBridgeBackend) → wraps class-based addon → 16 *Adapter.cc files → Robot:: C++ classes
```

### Target Architecture
```
lib/native.ts (direct flat calls) → single NativeBackend.cc → Robot:: C++ classes
```

### Files to Create
- `src/NativeBackend.cc` - Single file exporting all flat NAPI functions

### Files to Modify
- `binding.gyp` - Replace 17 adapter .cc files with single `src/NativeBackend.cc`
- `lib/native.ts` - Remove `createBridgeBackend()`, call flat addon functions directly

### Files to Keep (Robot C++ library - unchanged)
- `src/robot/*.cc` and `src/robot/*.h` - All 16 Robot implementation files

### Files to Remove (old adapter layer)
- `src/RobotAdapter.cc`, `src/RobotAdapter.h`
- `src/ClassAdapter.h`
- `src/*Adapter.cc` and `src/*Adapter.h` (16 pairs: Bounds, Clipboard, Color, Hash, Image, Keyboard, Memory, Module, Mouse, Point, Process, Range, Screen, Size, Timer, Window)

### Implementation Details for NativeBackend.cc

The file should:
1. Include all Robot:: headers directly
2. Use `Napi::Object` exports with flat `Napi::Function` entries (no classes)
3. Use `NODE_API_MODULE` macro (not `NODE_API_ADDON` class pattern)
4. Keep global `Robot::Keyboard` and `Robot::Mouse` instances for stateful operations
5. Create `Robot::Window(handle)`, `Robot::Process(pid)`, `Robot::Memory(Process(pid))` per-call for handle-based operations
6. Export all KEY_* and BUTTON_* constants
7. Export version constants

### Key Patterns from Existing Adapters

**Keyboard** (KeyboardAdapter.cc): Global instance, `Click(Key)`, `Press(Key)`, `Release(Key)`. Static: `Compile(string) -> KeyList`, `GetState() -> KeyState/bool`.

**Mouse** (MouseAdapter.cc): Global instance, `Click(Button)`, `Press/Release(Button)`, `ScrollH/V(int32)`. Static: `GetPos() -> Point`, `SetPos(Point)`, `GetState() -> ButtonState/bool`.

**Clipboard** (ClipboardAdapter.cc): All static. `Clear()`, `HasText()`, `GetText()`, `SetText(string)`, `HasImage()`, `GetImage(Image&)`, `SetImage(Image&)`, `GetSequence()`.

**Screen** (Screen.h): `Synchronize()`, `GetList()`, `GrabScreen(Image&, Bounds, Window)`, `GetTotalBounds()`, `GetTotalUsable()`, `IsCompositing()`, `SetCompositing(bool)`.

**Window** (Window.h): Construct with `Window(uintptr handle)`. Instance: `IsValid()`, `Close()`, `IsTopMost/Borderless/Minimized/Maximized()`, setters, `GetProcess()`, `GetPID()`, `GetHandle()`, `GetTitle()`, `SetTitle()`, `GetBounds/Client()`, `SetBounds/Client()`, `MapToClient/Screen()`. Static: `GetList(title)`, `GetActive()`, `SetActive(Window)`, `IsAxEnabled(bool)`.

**Process** (Process.h): Construct with `Process(int32 pid)`. Instance: `Open(pid)`, `Close()`, `IsValid()`, `Is64Bit()`, `IsDebugged()`, `GetPID()`, `GetName()`, `GetPath()`, `Exit()`, `Kill()`, `HasExited()`, `GetModules(name)`, `GetWindows(title)`. Static: `GetList(name)`, `GetCurrent()`, `IsSys64Bit()`. Segments via: `Module(proc, "", "", base, 0).GetSegments()`.

**Memory** (Memory.h): Construct with `Memory(Process)`. Instance: `IsValid()`, `GetRegion(addr)`, `GetRegions(start,stop)`, `SetAccess(Region, flags/bools)`, `Find(pattern,...)`, `ReadData(addr,buf,len,flags)`, `WriteData(addr,buf,len,flags)`, `CreateCache(...)`, `ClearCache()`, `DeleteCache()`, `IsCaching()`, `GetCacheSize()`, `GetPtrSize()`, `GetMin/MaxAddress()`, `GetPageSize()`.

**Image for clipboard**: `Image()` default constructor, `Image.Create(w,h)`, `Image.GetData()` returns uint32*, `Image.GetWidth/Height()`.

### NativeBackend interface reference
See `lib/native.ts` lines 1-104 for the complete flat function interface.

### After Thinning
- Configure `package.json` dual entry points: `"bun"` for TS, `"default"` for bundled JS
- Add `bun build` script to `package.json`
- Consider removing dist/ from git and building on install
