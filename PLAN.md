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

### 1b. Flat Native Backend (removed in Phase 2b)
The C++ flat native backend (`src/native/`) and Robot C++ library (`src/robot/`)
were used as the initial native layer.  Removed after Rust reached full parity.

### 1c. Build System
- Prebuilt Rust `.node` binaries for: Linux x64/arm64, macOS arm64/x64,
  Windows x64/ia32
- Cross-compilation: macOS arm64 runners build x64 via `--arch x64`

### 1d. CI / Testing
- GitHub Actions workflow builds and tests all 6 platform/arch combinations
- `test/test-ci.js` — comprehensive test suite exercising all subsystems
- TCC grants for macOS (accessibility, post-event, screen capture)
- Platform capability expectations table prevents silent test regressions
- Mach VM tests enabled on both darwin-arm64 and darwin-x64
- Graceful degradation with hard-fail if expected capability regresses

---

## Phase 2: Rust NAPI Rewrite (COMPLETE)

Replaced the C++ native layer with Rust using `napi-rs`, maintaining full
behavioral parity with the original robot-js documented APIs.

### 2a. Rust Native Backend
- `native-rs/` — Cargo workspace with napi-rs v2 `#[napi]` attribute macros
- `native-rs/src/` — Rust source modules: `keyboard.rs`, `mouse.rs`,
  `clipboard.rs`, `screen.rs`, `window.rs`, `process.rs`, `memory.rs`,
  `mach.rs` (shared macOS helpers), `x11.rs` (shared Linux helpers)
- Platform-specific code via `#[cfg(target_os = "...")]` guards
- Windows: `windows` crate v0.58
- macOS: `objc2`, `objc2-app-kit`, `objc2-core-graphics`, `objc2-core-foundation`,
  Mach VM APIs via raw `extern "C"` FFI
- Linux: X11/Xinerama via raw FFI, `/proc` filesystem

### 2b. C++ Backend Removal
The C++ backend (`src/`, `src/native/`, `src/robot/`) and the dual-backend test
runner have been removed.  Rust is the sole native backend.

### 2c. Logic Shift to TypeScript
Reduced the Rust layer to minimal FFI (thin `#[napi]` wrappers over platform
syscalls).  Business logic moved to TypeScript:
- Platform key/button/memory constants — `lib/constants.ts`, selected at
  runtime via `process.platform`
- `Keyboard.compile()` — key sequence parsing is pure TS
- `Keyboard.getState()` iteration — TS iterates the platform key list,
  Rust only exports `keyboard_getKeyState(keycode)`
- `dist/` output is individual CJS modules emitted by `tsc` (not a bundle)

### What Was Ported
All subsystems with full parity to the robot-js documented API:
- **Keyboard**: press, release, getKeyState
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
  as it will result in a large memory overhead."  The TS layer stubs these to
  no-op/defaults.
- **Memory stats** (`getStats`): The original C++ adapter created a new Memory
  object per native call, making stats always zero.  The TS layer returns an
  empty `Stats` object, matching that effective behavior.
- **getHandleAx**: Not implemented in the original robot-js Node layer.

---

## Phase 3: robot-js Compatibility Shim (COMPLETE)

Created a `mechatron-robot-js` package that provides a drop-in replacement for
the original `robot-js` API, backed by mechatron.

### Motivation
- Enable existing robot-js applications to migrate to mechatron with zero code
  changes (`npm install mechatron-robot-js` as alias for `robot-js`)
- Validate API completeness — any robot-js function not covered is a gap
- Provide a stable compatibility layer before modernizing mechatron's own API

### Implementation
After Phase 4b modernised the mechatron API (dropping `callableClass`, flattened
globals, etc.), the shim was rewritten from a single-line re-export into a full
legacy compatibility layer that reconstructs the robot-js 2.2.0 shape on top of
the modern mechatron modules.

Files:
- `packages/mechatron-robot-js/package.json` — npm package metadata, depends
  on `mechatron`
- `packages/mechatron-robot-js/index.js` — full compat layer: wraps every class
  in `callableClass` Proxy, provides `ROBOT_VERSION` constants, top-level
  `sleep`/`clock`, `getNativeBackend`/`setNativeBackend` stubs, flattened
  `KEY_*` and `BUTTON_*` constants, `Module.Segment`/`Memory.Stats`/
  `Memory.Region` nested references
- `packages/mechatron-robot-js/index.d.ts` — TypeScript type re-export
- `packages/mechatron-robot-js/README.md` — usage instructions and npm alias
  tip (`npm install robot-js@npm:mechatron-robot-js`)
- `packages/mechatron-robot-js/test/conformance.js` — comprehensive conformance
  test suite validating the full robot-js 2.2.0 API surface: version constants,
  top-level functions, all 17 classes (constructors, instance methods, static
  methods, nested classes), platform constants, and behavioral smoke tests

### What Was Validated
The conformance test suite checks ~200 API surface points:
- All classes callable with and without `new`
- Every documented instance method and static method present
- Nested classes (`Memory.Stats`, `Memory.Region`, `Module.Segment`) accessible
- All platform constants (KEY_*, BUTTON_*) present and typed correctly
- Memory flag constants (`DEFAULT`, `SKIP_ERRORS`, `AUTO_ACCESS`)
- Behavioral correctness: clone independence, arithmetic, containment,
  ARGB round-trip, hash determinism, image lifecycle, timer operation,
  keyboard compilation

---

## Phase 4: Modular Split + API Modernization (COMPLETE)

Phase 4 is executed in two parts:
- **4a. Modular Split** — COMPLETE.  The mechatron implementation is split
  into nine independently-installable npm packages, plus a Cargo workspace of
  per-subsystem native crates sharing a common source tree.
- **4b. API Modernization** — COMPLETE.  The modern mechatron meta-package
  exposes plain typed ES class constructors via named exports and drops the
  `callableClass()` Proxy wrapper, flattened `KEY_*` globals, top-level
  `sleep`/`clock`, `Module.Segment`/`Memory.Stats`/`Memory.Region` nesting,
  and `get/setNativeBackend` stubs.  Async `*Async` variants are provided for
  operations that may block (screen capture, process/window enumeration,
  memory scanning, clipboard IO).  Legacy robot-js 2.2.0 consumers continue
  to get the historical shape via `mechatron-robot-js`, which layers the old
  surface on top of the modern API.

### 4a. Modular Split (COMPLETE)

#### npm Workspace Layout
- `packages/mechatron-types` — pure data types (Point, Size, Bounds, Color,
  Range, Hash, Image, Timer); no native dependency
- `packages/mechatron-keyboard`, `-mouse`, `-clipboard`, `-screen`, `-window`,
  `-process`, `-memory` — each wraps its own subsystem and ships its own
  per-subsystem `.node` prebuilt
- `packages/mechatron-robot-js` — thin compatibility shim (phase 3)
- Root `mechatron` package — meta-package re-exporting all subsystems via
  modern typed named exports (legacy callers use `mechatron-robot-js`)

#### Cargo Workspace Layout
- `native-rs/Cargo.toml` — workspace root
- `native-rs/shared/` — internal lib crate for `x11.rs` / `mach.rs` helpers
- `native-rs/{keyboard,mouse,clipboard,screen,window,process,memory}/` —
  one `cdylib` crate per subsystem, each including its source via
  `#[path = "../../src/<module>.rs"]` from the shared `native-rs/src/` tree
- CI builds all seven crates and distributes each `.node` into the matching
  `packages/mechatron-<sub>/` directory

#### Build System
- `tsc --build` is the single canonical TypeScript build path; bun was dropped
- TypeScript project references link all packages for incremental builds
- `dist/` is no longer committed — generated on demand by `tsc --build`

#### Release Flow
- Root version bump via `npm version` is applied across all nine workspaces
- Cross-package dependencies are rewritten to the exact release version at
  publish time
- Publish order: types → subsystems → meta-package → robot-js shim

### 4b. API Modernization (COMPLETE)
- `*Async` Promise-returning variants for potentially-blocking operations:
  `Screen.grabScreenAsync`, `Screen.synchronizeAsync`, `Process.getListAsync`,
  `Process.getModulesAsync`, `Window.getListAsync`, `Clipboard.getTextAsync`,
  `Clipboard.setTextAsync`, `Clipboard.getImageAsync`, `Clipboard.setImageAsync`,
  `Memory.getRegionsAsync`, `Memory.readDataAsync`, `Memory.writeDataAsync`,
  `Memory.findAsync` (currently `queueMicrotask`-wrapped; can migrate to true
  `napi::Task` worker threads without changing the public surface)
- Named TypeScript exports throughout the meta-package; no `callableClass()`
  Proxy wrapping, no flattened `KEY_*` globals (use `KEYS.KEY_A`), no
  top-level `sleep`/`clock` (use `Timer.sleep`/`Timer.getCpuTime`), no
  `Module.Segment`/`Memory.Stats`/`Memory.Region` nesting (import directly),
  no `get/setNativeBackend` stubs
- `mechatron-robot-js` shim reconstructs the historical robot-js 2.2.0 shape
  (callableClass Proxies, version constants, top-level `sleep`/`clock`,
  flattened `KEY_*` globals, nested subclasses, backend stubs) on top of the
  modern API — drop-in replacement for existing robot-js consumers

### Published Package Matrix

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
| 3 | **Complete** | mechatron-robot-js compatibility shim |
| 4a | **Complete** | Modular package split (9 npm packages + 7 per-subsystem Rust crates) |
| 4b | **Complete** | API modernization (async variants, typed named exports, drop `callableClass`) |
