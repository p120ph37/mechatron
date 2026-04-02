# Changelog

All notable changes to this project will be documented in this file.

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
