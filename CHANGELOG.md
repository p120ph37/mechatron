# Changelog

All notable changes to this project will be documented in this file.

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
