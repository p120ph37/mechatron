# Changelog

All notable changes to this project will be documented in this file.

## [v0.0.5] - 2026-04-14

### Added
- **Bun FFI backend** — pure-TypeScript implementation of all seven subsystems
  (keyboard, mouse, clipboard, screen, window, process, memory) on Linux,
  Windows, and macOS, using `bun:ffi` to dlopen system libraries directly:
  libX11/libXtst/libXrandr on Linux, user32/gdi32/kernel32/psapi on Windows,
  CoreGraphics/AppKit/AXUIElement/libproc/mach on macOS.  No native binary
  is downloaded for Bun consumers — Bun loads the package's TypeScript
  directly via the `"bun"` exports condition in `package.json`
- **Unified native loader** (`lib/napi.ts`) — resolves each subsystem to
  either the NAPI prebuild (`@mechatronic/napi-<sub>`) or the pure-TS FFI
  module under `lib/ffi/<sub>.ts`.  Under Bun, NAPI is preferred when the
  prebuild is installed; FFI is the fallback.  `MECHATRON_BACKEND=napi|ffi`
  forces a specific backend; `getBackend(subsystem)` introspects the choice
- **Dual-engine test runner** — `test/test.js` now runs the shared subsystem
  test factories under up to three engines: `node-napi`, `bun-ffi`, and
  `bun-napi`.  `test/bun.test.ts` wraps the same factories in a `bun:test`
  harness so they can run standalone under Bun
- **CI coverage aggregation** — per-cell lcov results from both backends
  are merged into a combined report posted to each PR, with an aggregate
  line-coverage badge across all six platform/arch cells
- **LD_PRELOAD dlopen-block shim** (`test/dlopen-block.c`) — selectively
  refuses `dlopen` for sonames matching a substring list, used in CI to
  exercise the `libXtst`/`libXrandr` unavailable catch arms in `lib/ffi/x11.ts`
  without physically uninstalling the libraries
- **Kernel-failure error-arm probes** — dedicated tests for
  `task_for_pid`-denied (hardened-binary target on macOS) and
  `XGetWindowProperty` non-zero status (invalid-window handle on Linux) to
  cover the genuine-failure branches that the black-box API tests can't reach
- **CI display harness for Linux** — Xvfb + openbox + xmessage provide a
  compositor-less display with a single mapped test window, enabling the
  window-enumeration and screen-capture tests to assert real geometry
  rather than falling back to "no display" skips
- **macOS x64 CI via Rosetta 2** — the `macos-15` arm64 runner now also
  executes the x64 cell under Rosetta, giving both Bun backends full x64
  exercise without needing the deprecated Intel runner pool

### Changed
- **XRandR 1.5 replaces Xinerama** in both the FFI and NAPI screen backends
  — `XRRGetMonitors` is used for primary-monitor identification and
  per-output geometry; `XDefaultScreen` bounds are the fallback when
  libXrandr is not available
- **`mechatron-robot-js` robot-js shim** is now a full legacy compatibility
  layer built on top of the modern mechatron API, rather than a one-line
  re-export — restores `callableClass` Proxies, `ROBOT_VERSION`,
  top-level `sleep`/`clock`, `KEY_*` / `BUTTON_*` globals, and
  `Module.Segment` / `Memory.Stats` / `Memory.Region` nested references
  that were removed from the modern surface in v0.0.4
- **`package.json` `exports`** adds a `"bun"` condition pointing at
  `./lib/index.ts` so Bun consumes TypeScript directly while Node.js
  continues to load `./dist/index.js`

### Fixed
- **FFI/Linux X11 pointer ABI** — XRandR and XImage result pointers are
  now consistently declared as `T.u64` in the `bun:ffi` signatures and
  coerced to `Number` before passing back into pointer-accepting
  functions, fixing intermittent `bigint` rejection crashes under Bun
- **FFI/Linux silent Xlib error handler** — installs an `XSetErrorHandler`
  callback during FFI init so X protocol errors (e.g. `BadWindow` on a
  stale handle) do not tear down the Bun process
- **FFI/macOS clipboard text** — uses `NSData` / `writeObjects:` inside an
  autorelease pool and resolves `NSPasteboardTypeString` via an AppKit
  `dlopen` handle, avoiding the tagged-pointer CFString corruption that
  `bun:ffi` surfaced on Apple Silicon
- **FFI/Windows clipboard image** — uses `bun:ffi`'s `toArrayBuffer` for
  clipboard reads and writes so large bitmaps are copied without the
  truncation seen via generic pointer deref
- **Screen oversize-grab guard** — `grabScreen` in all backends now
  explicitly validates the `Uint32Array` allocation before handing it to
  the native copy, throwing a clean `RangeError` instead of crashing on
  4-billion-pixel requests

## [v0.0.4] - 2026-04-13

### Added
- **Segmented native packages** — native NAPI binaries are delivered via
  `@mechatronic/napi-keyboard`, `napi-mouse`, `napi-clipboard`, `napi-screen`,
  `napi-window`, `napi-process`, `napi-memory` as `optionalDependencies`.
  Users can omit specific subsystems (e.g. memory) to avoid AV false positives,
  or skip all native modules for future Bun FFI support
- **Unified native loader** (`lib/napi.ts`) — `getNative("keyboard")` /
  `isAvailable("keyboard")` resolves native binaries from `@mechatronic/napi-*`
  packages and returns a clear error when absent
- **Async API variants** — `*Async` Promise-returning methods for operations
  that may block: `Screen.grabScreenAsync`/`synchronizeAsync`,
  `Process.getListAsync`/`getModulesAsync`, `Window.getListAsync`,
  `Clipboard.{get,set}{Text,Image}Async`, `Memory.{getRegions,readData,
  writeData,find}Async` (currently `queueMicrotask`-wrapped; can migrate to
  true `napi::Task` worker threads without changing the public surface)
- **`KEYS` record** — typed `Readonly<KeyTable>` (replaces flattened `KEY_*`
  top-level globals)
- **`mechatron-robot-js` compatibility shim** — full legacy robot-js 2.2.0
  surface: `callableClass()` Proxy wrapping (constructor-without-`new`),
  `ROBOT_VERSION` constants, top-level `sleep`/`clock`, `getNativeBackend`/
  `setNativeBackend` stubs, `Module.Segment`/`Memory.Stats`/`Memory.Region`
  nested references, flattened `KEY_*` and `BUTTON_*` constants
- **Conformance test suite** — 320 API-surface checks validating the robot-js
  shim against the documented robot-js 2.2.0 behaviour
- **Modern test suite** (`test/`) — modular per-subsystem tests exercising the
  modern mechatron API including async variants; original robot-js interactive
  test suite preserved in `packages/mechatron-robot-js/test/`
- **CI test details and code coverage** — JUnit XML test results and c8/V8 line
  coverage reported per platform in GitHub Actions step summaries
- **99% line coverage** — comprehensive test expansion across all subsystems
  (types, keyboard, mouse, process, memory, window, screen) covering
  constructor overloads, TypeError branches, comparison operators, async
  variants, and platform-conditional paths
- **Cross-process Memory test harness** — `test/memory.js` now exercises
  full round-trip cross-process writes followed by reads
  (`writeInt8/16/32/64/Bool/String/Real32/Real64/Ptr/Data`), verified both
  through the parent's typed reads and through the child's own view of the
  buffer.  The target is `test/memory-child.c`, a deliberately plain
  (non-hardened) C program that stands in for a real-world debug target
  such as a game — mirroring the scenario where a user has disabled SIP
  or enabled Developer Mode to attach to a same-user third-party process.
  Built with `clang` in CI (already present on every GitHub-hosted runner)
  and declares its buffer `volatile` to prevent the optimiser from caching
  reads across the dump loop.

### Fixed
- macOS cross-process Memory operations (darwin-arm64 and darwin-x64) —
  earlier skip logic is removed; the non-hardened C helper is a reliable
  `mach_vm_write` / `mach_vm_read_overwrite` target that does not require
  re-signing Node with `com.apple.security.get-task-allow`
- Windows x64 cross-process Memory write test — scratch-pad `Buffer`
  placement avoids a crash when writing into the child's address space

### Changed
- **`Uppercase<string>` type constraint** on `resolveKeyName` — compile-time
  enforcement that key name arguments are uppercased; literal violations are
  caught by TypeScript and dynamic strings require explicit
  `as Uppercase<string>` casts after `toUpperCase()`
- **TypeScript reorganised into subsystem subdirectories** — `lib/` now has
  `types/`, `keyboard/`, `mouse/`, `clipboard/`, `screen/`, `window/`,
  `process/`, `memory/` subdirectories; `tsc` compiles into `dist/`
- **Modern API surface** — `mechatron` exports plain typed ES class constructors
  via named exports; `callableClass()` Proxy wrapping, flattened `KEY_*`
  globals, top-level `sleep`/`clock`, `Module.Segment`/`Memory.Stats`/
  `Memory.Region` nesting, and `get/setNativeBackend` stubs are removed from
  the modern surface (available via `mechatron-robot-js` for legacy consumers)
- **Cargo workspace split** — `native-rs/` renamed to `napi/` with one
  `cdylib` crate per subsystem plus a shared helper crate, producing separate
  `.node` binaries per subsystem
- `Process.getModules()` performs Module-wrapping and `_proc` attachment
  internally instead of via monkey-patching from the entry point
- Typed raw-payload interfaces replace ad-hoc `any` parameters (`RawRegion`,
  `RawRect`, `RawScreen`, `WindowLike`)

### Removed
- Committed `dist/` output — now generated on demand by `tsc`
- `lib/native.ts` monolithic native backend interface — replaced by
  `lib/napi.ts` unified per-subsystem loader
- Dead `instanceof` constructor guard in `Segment` — unreachable in ES classes
  where the engine enforces `new`
- Dead single-character fallback branch in `resolveKeyName` — all callers
  already call `toUpperCase()` before passing arguments

## [v0.0.3] - 2026-04-06

### Removed
- C++ native backend (`src/`, `src/native/`, `src/robot/`) — Rust is now the
  sole native backend; the C++ fallback and dual-backend test runner are gone
- `ProcBsdShortInfo` / `proc_pidinfo` usage in Rust — no longer needed now that
  `mac_is_64_bit` unconditionally returns true

### Fixed
- macOS `process_getModules` returning 0 modules on both arm64 and x64 —
  root cause was `mac_is_64_bit()` returning false because modern macOS no
  longer sets the `P_LP64` flag in `pbsi_flags`; fixed by always returning true
  (macOS dropped 32-bit process support in Catalina)
- macOS `VmRegionBasicInfo64` struct had wrong layout — `offset: u64` at byte
  20 caused Rust to insert 4 bytes alignment padding, making the struct 40
  bytes vs the kernel's expected 36; fixed by splitting into `offset_lo: u32`
  and `offset_hi: u32`
- macOS code signing: re-sign `.node` binary after `strip` invalidates the
  ad-hoc signature
- macOS x64 cross-build from arm64 runners
- TypeScript errors: `tsconfig.json` was set to `"module": "ESNext"` but the
  package is CJS; corrected to `"module": "CommonJS"` with
  `"moduleResolution": "node10"`
- `Bounds.ts` `instanceof` checks on union types that include `number`
- `Range.ts` rest-spread into overloaded `eq()` method

### Changed
- Platform key/button/memory constants moved from Rust (`#[cfg]` compile-time)
  to TypeScript (`lib/constants.ts`, runtime `process.platform` dispatch) —
  eliminates per-platform constant compilation in the native layer
- `Keyboard.compile()` moved from Rust to TypeScript (`lib/Keyboard.ts`) —
  key sequence parsing is now pure TS with no native calls
- `Keyboard.getState()` iteration moved to TypeScript — Rust only exports
  `keyboard_getKeyState(keycode)`, TS iterates the platform key list
- Rust native layer reduced to minimal FFI: thin `#[napi]` wrappers over
  platform syscalls, no business logic
- Shared macOS Mach helpers extracted into `napi/src/mach.rs` —
  deduplicates `get_task`, `process_exists`, and Mach extern declarations
  previously copy-pasted across `process.rs` and `memory.rs`
- `Keyboard.ts` modifier key handling: 4 copy-paste switch cases replaced with
  data-driven lookup table
- `constants.ts` `getAllKeys()`: two 50-line platform-specific key lists
  replaced with `new Set(Object.values(keys))` — Set deduplication naturally
  handles the Linux/macOS case where `KEY_ALT == KEY_LALT`
- `dist/` output changed from single bundled file to individual CJS modules
  emitted by `tsc`, plus `.d.ts` type declarations
- macOS Mach VM tests enabled on darwin-arm64 (previously skipped)

## [v0.0.2] - 2026-04-03

### Added
- Rust native backend (`napi/`) via napi-rs, replacing C++ as the default
  native layer while maintaining full behavioral parity with the robot-js
  documented APIs
- Prebuilt Rust `.node` binaries for all 6 platform/arch targets (linux-x64,
  linux-arm64, macos-arm64, macos-x64, windows-x64, windows-ia32)
- Dual-backend CI test runner — both Rust and C++ backends tested in CI for
  parity verification
- `Process.getHandle()` — returns the native process handle (mach task on
  macOS, HANDLE on Windows, 0 on Linux)
- Memory `readData`/`writeData` flag support: `SKIP_ERRORS` (zero-fill
  unreadable regions) and `AUTO_ACCESS` (temporarily elevate page protection
  for the duration of the read/write)
- Windows `Memory.setAccess()` with raw protection flags via `VirtualProtectEx`
- macOS process inspection: `is64Bit` (via `proc_pidinfo` LP64 flag),
  `isDebugged` (via `task_get_exception_ports`), `getName` (via `proc_name`),
  `getModules` (via Mach dyld enumeration), `getHandle` (via `task_for_pid`)
- macOS memory operations: full `readData`/`writeData`/`setAccess`/`getRegion`/
  `getRegions` via Mach VM APIs (`mach_vm_read_overwrite`,
  `mach_vm_write`, `mach_vm_protect`, `mach_vm_region`)
- macOS clipboard image support rewritten using `NSImage` + `CGBitmapContext`
  with proper ARGB pixel format handling
- macOS screen capture rewritten using `CGWindowListCreateImage` +
  `CGBitmapContext` with window-relative capture support

### Changed
- Rust is now the default native backend; C++ is retained as fallback
- `Clipboard.getImage()` defers `image.destroy()` until after the native read
  succeeds, preserving the existing image on failure (per Robot documentation)
- `package.json` `files` field includes `napi/*.node` for prebuilt Rust
  binaries

### Not Implemented (intentional)
- Memory caching (`createCache`/`clearCache`/`deleteCache`/`isCaching`/
  `getCacheSize`) — per original documentation warning about memory overhead;
  TS layer stubs these to no-op/defaults
- Memory stats (`getStats`) — C++ adapter creates new Memory object per call,
  making stats always zero; TS layer returns empty Stats matching effective
  behavior
- `getHandleAx` — not implemented in original robot-js Node layer

## [v0.0.1] - 2026-04-02

### Added
- Initial port of robot-js (NAPI branch) with Robot C++ library merged into
  single project
- TypeScript wrapper layer (`lib/`) with full argument validation, bundled to
  `dist/index.js`
- Flat native backend (`src/native/`) replacing class-based adapter layer
- CMake-based build system (cmake-js) with node-gyp fallback
- Prebuilt binaries for Linux x64/arm64, macOS arm64/x64, Windows x64/ia32
- CI test suite (`test/test-ci.js`) exercising all subsystems across 6
  platform/arch targets
- Platform capability expectations table — probes that were previously
  allowed to silently skip now fail hard if the capability is expected to
  work on the current platform, preventing silent regressions
- Mach VM availability probe (child-process based) to safely detect whether
  `task_for_pid` / `mach_vm_read_overwrite` will SIGABRT on macOS arm64
- Graceful degradation for screen capture when TCC grant is absent
- macOS TCC permission grants in CI (accessibility, post-event, screen
  capture) using named-column INSERT with tccd restart
- Test output artifact upload for CI log inspection
- Changelog-driven release workflow
- MIT license with Robot library acknowledgement

### Changed
- macOS mouse `SetPos` uses `CGWarpMouseCursorPosition` (synchronous) instead
  of `CGEventPost` with `kCGEventMouseMoved` (async), fixing position
  read-back timing issues
- Windows `Keyboard::GetState` uses `GetAsyncKeyState` instead of
  `GetKeyState`, which reads physical key state directly without requiring a
  message pump — fixes keyboard state detection in CI
- Windows `Mouse::GetState` uses proper `& 0x8000` bitmask on
  `GetAsyncKeyState` return value, fixing false positives from bit 0
