# Mechatron Compatibility Matrix

This file is both documentation and the **single source of truth** for CI test
expectations.  The test runner (`test/matrix.js`) reads these tables and decides
whether each annotated test entry should run on the current backend/platform.

Every subsystem table includes a `_ctor` row that controls whether any test
in that subsystem can run — when the backend can't load (e.g. blocked dlopen),
the ctor cell is `skip` and all tests in the subsystem are skipped.

## Cell Values

| Value  | Meaning |
|--------|---------|
| `ok`   | Implemented and tested — CI must pass |
| `skip` | Known unimplemented or stub — test skips gracefully |
| `n/a`  | Backend does not run on this platform |

## Column Key

| Column | Backend | Platform | Notes |
|--------|---------|----------|-------|
| napi | Pre-built Rust .node binary | Linux, Windows, macOS | Gold-standard reference |
| ffi/linux | bun:ffi | Linux (X11/EWMH) | Requires libX11; XTest or uinput for input |
| ffi/win32 | bun:ffi | Windows | user32.dll / kernel32.dll |
| ffi/mac | bun:ffi | macOS | CoreGraphics + Accessibility framework |
| nolib/x11 | Pure TS (xproto wire) | Linux with $DISPLAY | No native libraries at all |
| nolib/portal | Pure TS (D-Bus) | Linux/Wayland | RemoteDesktop + ScreenCast portals |
| nolib/vt | Pure TS (uinput + fb) | Linux VT / headless | /dev/uinput + /dev/fb0 |
| nolib/mac | Pure TS (subprocess) | macOS | pbcopy/pbpaste; clipboard only |

---

## Keyboard

| Function | napi | ffi/linux | ffi/win32 | ffi/mac | nolib/x11 | nolib/portal | nolib/vt |
|----------|------|-----------|-----------|---------|-----------|--------------|----------|
| keyboard_ctor | ok | ok | ok | ok | ok | ok | ok |
| keyboard_press | ok | ok | ok | ok | ok | ok | ok |
| keyboard_release | ok | ok | ok | ok | ok | ok | ok |
| keyboard_getKeyState | ok | ok | ok | ok | ok | skip | skip |

## Mouse

| Function | napi | ffi/linux | ffi/win32 | ffi/mac | nolib/x11 | nolib/portal | nolib/vt |
|----------|------|-----------|-----------|---------|-----------|--------------|----------|
| mouse_ctor | ok | ok | ok | ok | ok | ok | ok |
| mouse_press | ok | ok | ok | ok | ok | ok | ok |
| mouse_release | ok | ok | ok | ok | ok | ok | ok |
| mouse_scrollH | ok | ok | ok | ok | ok | ok | ok |
| mouse_scrollV | ok | ok | ok | ok | ok | ok | ok |
| mouse_getPos | ok | ok | ok | ok | ok | skip | n/a |
| mouse_setPos | ok | ok | ok | ok | ok | skip | ok |
| mouse_getButtonState | ok | ok | ok | ok | ok | skip | n/a |

## Window

| Function | napi | ffi/linux | ffi/win32 | ffi/mac | nolib/x11 |
|----------|------|-----------|-----------|---------|-----------|
| window_ctor | ok | ok | ok | ok | ok |
| window_isValid | ok | ok | ok | ok | ok |
| window_close | ok | ok | ok | ok | ok |
| window_isTopMost | ok | ok | ok | ok | ok |
| window_isBorderless | ok | ok | ok | ok | ok |
| window_isMinimized | ok | ok | ok | ok | ok |
| window_isMaximized | ok | ok | ok | ok | ok |
| window_setTopMost | ok | ok | ok | skip | ok |
| window_setBorderless | ok | ok | ok | skip | ok |
| window_setMinimized | ok | ok | ok | ok | ok |
| window_setMaximized | ok | ok | ok | ok | ok |
| window_getProcess | ok | ok | ok | ok | ok |
| window_getPID | ok | ok | ok | ok | ok |
| window_getHandle | ok | ok | ok | ok | ok |
| window_setHandle | ok | ok | ok | ok | ok |
| window_getTitle | ok | ok | ok | ok | ok |
| window_setTitle | ok | ok | ok | ok | ok |
| window_getBounds | ok | ok | ok | ok | ok |
| window_setBounds | ok | ok | ok | ok | ok |
| window_getClient | ok | ok | ok | ok | ok |
| window_setClient | ok | ok | ok | ok | ok |
| window_mapToClient | ok | ok | ok | ok | ok |
| window_mapToScreen | ok | ok | ok | ok | ok |
| window_getList | ok | ok | ok | ok | ok |
| window_getActive | ok | ok | ok | ok | ok |
| window_setActive | ok | ok | ok | ok | ok |
| window_isAxEnabled | ok | ok | ok | ok | ok |

## Process

| Function | napi | ffi/linux | ffi/win32 | ffi/mac | nolib/linux |
|----------|------|-----------|-----------|---------|-------------|
| process_ctor | ok | ok | ok | ok | ok |
| process_open | ok | ok | ok | ok | ok |
| process_close | ok | ok | ok | ok | ok |
| process_isValid | ok | ok | ok | ok | ok |
| process_is64Bit | ok | ok | ok | ok | ok |
| process_isDebugged | ok | ok | ok | ok | ok |
| process_getHandle | ok | ok | ok | ok | ok |
| process_getName | ok | ok | ok | ok | ok |
| process_getPath | ok | ok | ok | ok | ok |
| process_exit | ok | ok | ok | ok | ok |
| process_kill | ok | ok | ok | ok | ok |
| process_hasExited | ok | ok | ok | ok | ok |
| process_getCurrent | ok | ok | ok | ok | ok |
| process_isSys64Bit | ok | ok | ok | ok | ok |
| process_getList | ok | ok | ok | ok | ok |
| process_getWindows | ok | ok | ok | ok | ok |
| process_getModules | ok | ok | ok | ok | skip |
| process_getSegments | ok | ok | ok | ok | skip |

## Screen

| Function | napi | ffi/linux | ffi/win32 | ffi/mac | nolib/x11 | nolib/portal | nolib/vt |
|----------|------|-----------|-----------|---------|-----------|--------------|----------|
| screen_ctor | ok | ok | ok | ok | ok | ok | ok |
| screen_synchronize | ok | ok | ok | ok | ok | ok | ok |
| screen_grabScreen | ok | ok | ok | ok | ok | ok | ok |

## Clipboard

| Function | napi | ffi/linux | ffi/win32 | ffi/mac | nolib/linux | nolib/mac |
|----------|------|-----------|-----------|---------|-------------|-----------|
| clipboard_ctor | ok | ok | ok | ok | ok | ok |
| clipboard_clear | ok | skip | ok | ok | ok | ok |
| clipboard_hasText | ok | skip | ok | ok | ok | ok |
| clipboard_getText | ok | skip | ok | ok | ok | ok |
| clipboard_setText | ok | skip | ok | ok | ok | ok |
| clipboard_hasImage | ok | skip | ok | ok | skip | skip |
| clipboard_getImage | ok | skip | ok | ok | skip | skip |
| clipboard_setImage | ok | skip | ok | ok | skip | skip |
| clipboard_getSequence | ok | skip | ok | ok | skip | skip |

## Memory

| Function | napi | ffi/linux | ffi/win32 | ffi/mac |
|----------|------|-----------|-----------|---------|
| memory_ctor | ok | ok | ok | ok |
