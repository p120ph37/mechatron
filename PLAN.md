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

## Phase 2: Rust NAPI Rewrite (PLANNED)

Replace the C++ native layer with Rust using `napi-rs`.

### Motivation
- Memory safety without manual `new`/`delete` or prevent-copy patterns
- `napi-rs` provides ergonomic N-API bindings with automatic type marshalling
- Cargo/crate ecosystem for platform APIs (e.g. `windows`, `core-graphics`,
  `x11rb`) replaces hand-rolled platform `#ifdef` blocks
- `napi-rs` has first-class `prebuildify`-compatible cross-compilation and
  GitHub Actions integration (`napi-rs/napi-rs` build matrix)
- Easier to add new platform support and maintain existing code

### Approach
1. Create `src-rs/` (or a Cargo workspace) alongside existing `src/`
2. Port `src/robot/` platform abstraction to Rust crate(s)
3. Port `src/native/` NAPI bindings to `napi-rs` `#[napi]` exports
4. Update build scripts: `@napi-rs/cli` replaces cmake-js/node-gyp
5. Verify identical behaviour via existing `test/test-ci.js` (no test changes)
6. Remove C++ source (`src/robot/`, `src/native/`, old adapters)
7. Remove cmake-js, node-gyp, node-addon-api dependencies

### Build Tooling Changes
- `Cargo.toml` + `@napi-rs/cli` replace `CMakeLists.txt` + `binding.gyp`
- `npm run build` invokes `napi build --platform` instead of `prebuildify`
- Prebuilt `.node` binaries generated per-platform via `napi-rs` CI template
- The TypeScript wrapper layer (`lib/`) and bundled output (`dist/`) remain
  unchanged — only the `.node` binary interface is reimplemented

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
| `@mechatron/keyboard` | Keyboard simulation and state |
| `@mechatron/mouse` | Mouse simulation and state |
| `@mechatron/clipboard` | Clipboard read/write (text + image) |
| `@mechatron/screen` | Screen enumeration and capture |
| `@mechatron/window` | Window enumeration and management |
| `@mechatron/process` | Process enumeration and inspection |
| `@mechatron/memory` | Process memory read/write/search |
| `@mechatron/types` | Shared types (Point, Bounds, Image, etc.) |

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
| 2 | Planned | Rust NAPI rewrite via napi-rs |
| 3 | Planned | mechatron-robot-js compatibility shim |
| 4 | Planned | API modernization + modular package split |
