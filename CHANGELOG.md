# Changelog

All notable changes to this project will be documented in this file.

## [v0.0.4]

### Added
- **Modular packages** — split the monolithic `mechatron` package into nine
  independently-installable npm packages (`mechatron-types`, `-keyboard`,
  `-mouse`, `-clipboard`, `-screen`, `-window`, `-process`, `-memory`,
  `-robot-js`) backed by a Cargo workspace of seven per-subsystem native crates
  sharing a common Rust source tree
- **npm workspaces + TypeScript project references** — `tsc --build` compiles
  all packages in dependency order; bun transpile path removed
- **Async API variants** — `*Async` Promise-returning methods for operations
  that may block: `Screen.grabScreenAsync`/`synchronizeAsync`,
  `Process.getListAsync`/`getModulesAsync`, `Window.getListAsync`,
  `Clipboard.{get,set}{Text,Image}Async`, `Memory.{getRegions,readData,
  writeData,find}Async` (currently `queueMicrotask`-wrapped; can migrate to
  true `napi::Task` worker threads without changing the public surface)
- **`KEYS` record** — typed `Readonly<KeyTable>` in `mechatron-keyboard`,
  re-exported by the meta-package (replaces flattened `KEY_*` top-level
  globals)
- **`mechatron-robot-js` compatibility shim** — full legacy robot-js 2.2.0
  surface: `callableClass()` Proxy wrapping (constructor-without-`new`),
  `ROBOT_VERSION` constants, top-level `sleep`/`clock`, `getNativeBackend`/
  `setNativeBackend` stubs, `Module.Segment`/`Memory.Stats`/`Memory.Region`
  nested references, flattened `KEY_*` and `BUTTON_*` constants
- **Conformance test suite** — 320 API-surface checks validating the robot-js
  shim against the documented robot-js 2.2.0 behaviour

### Changed
- **Modern meta-package API** — `mechatron` now exports plain typed ES class
  constructors via named exports; `callableClass()` Proxy wrapping, flattened
  `KEY_*` globals, top-level `sleep`/`clock`, `Module.Segment`/`Memory.Stats`/
  `Memory.Region` nesting, and `get/setNativeBackend` stubs are all removed
  from the modern surface (available via `mechatron-robot-js` for legacy
  consumers)
- `Process.getModules()` now performs the Module-wrapping and `_proc`
  attachment internally instead of via a monkey-patch in the meta-package
- Typed raw-payload interfaces replace ad-hoc `any` parameters (`RawRegion`,
  `RawRect`, `RawScreen`, `WindowLike`)
- CI uses `npm link` for the root-package self-link (replaces manual symlink
  that failed on Windows Git Bash)
- `test/test-ci.js` updated for modern API: `new Class(...)` constructors,
  `KEYS.KEY_*` lookups, mach VM probe uses `new Memory(p)`

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
- Shared macOS Mach helpers extracted into `native-rs/src/mach.rs` —
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
- Rust native backend (`native-rs/`) via napi-rs, replacing C++ as the default
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
- `package.json` `files` field includes `native-rs/*.node` for prebuilt Rust
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
