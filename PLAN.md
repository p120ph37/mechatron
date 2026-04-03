# Mechatron Development Plan

## Project Overview

Mechatron is a Node.js native addon for desktop automation — keyboard, mouse,
screen capture, clipboard, process/memory inspection, and window management.
Derived from the robot-js / Robot C++ library.

---

## Phase 1: C++ NAPI Port (COMPLETE)

### 1a. TypeScript Wrapper Layer
All classes ported from C++ adapter classes to TypeScript with full argument
validation.  A bundled JS entry point (`dist/index.js`) wraps the flat native
backend.

Files:
- `lib/*.ts` — TypeScript class wrappers (Keyboard, Mouse, Clipboard, Screen,
  Window, Process, Memory, Image, Timer, plus data types)
- `lib/native.ts` — NativeBackend interface + bridge adapter
- `lib/index.ts` — Entry point with `callableClass()` proxy, constants, exports
- `dist/index.js` — Bun-bundled CJS output (committed)

### 1b. Flat Native Backend
Replaced the 16-pair `*Adapter.cc/.h` class-based NAPI layer with a flat
function backend in `src/native/`.

Files:
- `src/native/init.cc` — Module init, constant exports
- `src/native/keyboard.cc`, `mouse.cc`, `clipboard.cc`, `screen.cc`,
  `window.cc`, `process.cc`, `memory.cc` — Flat NAPI function exports
- `src/native/native.h` — Shared declarations

The old adapter layer (`src/*Adapter.cc/.h`, `src/ClassAdapter.h`,
`src/RobotAdapter.cc/.h`) is still present but unused — to be removed in
cleanup.

### 1c. Robot C++ Library
The core platform abstraction layer is unchanged:
- `src/robot/*.cc` and `src/robot/*.h` — 16 implementation files covering
  Keyboard, Mouse, Clipboard, Screen, Window, Process, Memory, Image, Timer,
  plus data types (Bounds, Point, Size, Range, Color, Hash, Module)

### 1d. Build System
- **cmake-js** primary build via `prebuildify --backend cmake-js --napi`
- **node-gyp** fallback via `prebuildify --napi` / `binding.gyp`
- Prebuilt binaries for: Linux x64/arm64, macOS arm64/x64, Windows x64/ia32
- Cross-compilation: macOS arm64 runners build x64 via `--arch x64`

### 1e. CI / Testing
- GitHub Actions workflow builds and tests all 6 platform/arch combinations
- `test/test-ci.js` — comprehensive test suite exercising all subsystems
- TCC grants for macOS (accessibility, post-event, screen capture)
- Platform capability expectations table prevents silent test regressions
- Mach VM probe guards against SIGABRT on macOS arm64 (entitlement limitation)
- Graceful degradation with hard-fail if expected capability regresses

---

## Phase 2: Rust NAPI Rewrite (COMPLETE)

Replaced the C++ native layer with Rust using `napi-rs`, maintaining full
behavioral parity with the original robot-js documented APIs.

### Implementation
- `native-rs/` — Cargo workspace with napi-rs v2 `#[napi]` attribute macros
- `native-rs/src/` — Rust source modules: `keyboard.rs`, `mouse.rs`,
  `clipboard.rs`, `screen.rs`, `window.rs`, `process.rs`, `memory.rs`
- Platform-specific code via `#[cfg(target_os = "...")]` guards
- Windows: `windows` crate v0.58
- macOS: `objc2`, `objc2-app-kit`, `objc2-core-graphics`, `objc2-core-foundation`,
  Mach VM APIs via raw `extern "C"` FFI
- Linux: X11/Xinerama via raw FFI, `/proc` filesystem

### Backend Selection
Rust is the default backend.  `lib/native.ts` loads the Rust `.node` binary
first, falling back to the C++ addon (via `node-gyp-build`) if the Rust binary
is not available.

### What Was Ported
All subsystems with full parity to the robot-js documented API:
- **Keyboard**: click, press, release, compile, getState, getKeyState
- **Mouse**: click, press, release, scrollH/V, getPos, setPos, getState
- **Clipboard**: clear, hasText, getText, setText, hasImage, getImage, setImage,
  getSequence
- **Screen**: synchronize, grabScreen, isCompositing, setCompositing,
  getTotalBounds, getTotalUsable (with window-relative capture support)
- **Window**: full CRUD — isValid, close, topMost/borderless/minimized/maximized,
  getProcess, getTitle/setTitle, getBounds/setBounds, getClient/setClient,
  mapToClient/mapToScreen, getList, getActive/setActive, isAxEnabled
- **Process**: open, close, isValid, is64Bit, isDebugged, getName, getPath,
  getHandle, exit, kill, hasExited, getModules, getWindows, getList,
  getCurrent, isSys64Bit, getSegments
- **Memory**: isValid, getRegion, getRegions, setAccess (bool and flags),
  getPtrSize, getMinAddress, getMaxAddress, getPageSize, find, readData,
  writeData (with SKIP_ERRORS and AUTO_ACCESS flag support)

### Intentionally Not Implemented
- **Memory caching** (`createCache`/`clearCache`/`deleteCache`/`isCaching`/
  `getCacheSize`): Per original documentation — "Caching should not be enabled
  as it will result in a large memory overhead."  High complexity, limited
  utility.  The TS layer stubs these to no-op/defaults.
- **Memory stats** (`getStats`): The C++ adapter creates a new `Robot::Memory`
  object per native call, making stats always zero.  The TS layer returns an
  empty `Stats` object, matching effective C++ behavior.
- **getHandleAx**: Not implemented in the original robot-js Node layer.

### C++ Backend Retained
The C++ backend (`src/native/`, `src/robot/`) is retained in this revision for
comparison and cross-analysis.  Future revisions will remove it as the project
moves toward a napi-rs and bun-FFI-centric design.

---

## Phase 3: robot-js Compatibility Shim (PLANNED)

Create a `mechatron-robot-js` package that provides a drop-in replacement for
the original `robot-js` API, backed by mechatron.

### Motivation
- Enable existing robot-js applications to migrate to mechatron with zero code
  changes (`npm install mechatron-robot-js` as alias for `robot-js`)
- Validate API completeness — any robot-js function not covered is a gap
- Provide a stable compatibility layer before modernizing mechatron's own API

### Approach
1. Create `packages/mechatron-robot-js/` subproject (or separate repo)
2. Export the exact robot-js public API surface, delegating to mechatron
3. Match robot-js argument handling, return types, and error behaviour
4. Add robot-js test suite as integration/conformance tests
5. Publish as `mechatron-robot-js` on npm

---

## Phase 4: API Modernization & Modular Split (PLANNED)

Once the compatibility shim exists as a stable bridge for legacy consumers,
redesign the mechatron API and split the implementation into focused packages.

### API Modernization
- Async/Promise-based APIs where appropriate (e.g. screen grab, process list)
- TypeScript-first public API with proper generics and discriminated unions
- Modern event patterns (EventEmitter / AsyncIterator for key/mouse listeners)
- Drop legacy `callableClass()` pattern — use standard constructors/statics
- Proper ESM support alongside CJS

### Modular Split
Split mechatron into capability-specific packages so consumers only install
what they need:

| Package | Capabilities |
|---------|-------------|
| `mechatron` | Meta-package / re-exports all |
| `mechatron-keyboard` | Keyboard simulation and state |
| `mechatron-mouse` | Mouse simulation and state |
| `mechatron-clipboard` | Clipboard read/write (text + image) |
| `mechatron-screen` | Screen enumeration and capture |
| `mechatron-window` | Window enumeration and management |
| `mechatron-process` | Process enumeration and inspection |
| `mechatron-memory` | Process memory read/write/search |
| `mechatron-types` | Shared types (Point, Bounds, Image, etc.) |

### Motivation for Split
- **AV false positives**: Memory inspection (read/write foreign process memory,
  module enumeration) triggers antivirus heuristics.  Applications that only
  need keyboard/mouse/screen should not ship memory-related native code.
- **Install size**: Each native binary includes all platform code.  Splitting
  lets consumers download only the capabilities they use.
- **Security surface**: Consumers can audit and permission-gate specific
  capabilities rather than granting access to everything.

---

## Roadmap Summary

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | **Complete** | C++ NAPI port, flat backend, CI on 6 platforms |
| 2 | **Complete** | Rust NAPI rewrite via napi-rs, full robot-js API parity |
| 3 | Planned | mechatron-robot-js compatibility shim |
| 4 | Planned | API modernization + modular package split |
