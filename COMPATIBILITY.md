# Mechatron Compatibility Matrix

This file is both documentation and the **single source of truth** for CI test
expectations.  The test runner (`test/matrix.js`) reads these tables and decides
whether each annotated test entry should run on the current backend/platform.

## Cell Values

| Value  | Meaning |
|--------|---------|
| `ok`   | Implemented and tested — CI must pass |
| `skip` | Known unimplemented or stub — test skips gracefully |

## Column Key

Each column name follows the format `{platform}-{backend}`, matching the values
returned by `process.platform` and `getBackend(subsystem)` at runtime.

| Column | Backend | Platform | Notes |
|--------|---------|----------|-------|
| linux-napi[x11] | Pre-built Rust .node binary | Linux (X11) | Gold-standard reference |
| linux-ffi[x11] | bun:ffi | Linux (X11/EWMH) | Requires libX11; XTest for input |
| linux-nolib[x11] | Pure TS (xproto wire) | Any OS with $DISPLAY | No native libraries at all |
| linux-nolib[portal] | Pure TS (D-Bus) | Linux/Wayland | RemoteDesktop + ScreenCast portals |
| linux-nolib[vt] | Pure TS (uinput + fb) | Linux VT / headless | /dev/uinput + /dev/fb0 |
| win32-napi | Pre-built Rust .node binary | Windows | |
| win32-ffi | bun:ffi | Windows | user32.dll / kernel32.dll |
| darwin-napi | Pre-built Rust .node binary | macOS | |
| darwin-ffi | bun:ffi | macOS | CoreGraphics + CoreFoundation |
| darwin-nolib | Pure TS (subprocess) | macOS | pbcopy/pbpaste; clipboard only |

---

## Keyboard

| Function | linux-napi[x11] | linux-ffi[x11] | linux-nolib[x11] | linux-nolib[portal] | linux-nolib[vt] | win32-napi | win32-ffi | darwin-napi | darwin-ffi |
|----------|------|------|------|------|------|------|------|------|------|
| keyboard_ctor | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| keyboard_press | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| keyboard_release | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| keyboard_getKeyState | ok | ok | ok | skip | skip | ok | ok | ok | ok |

## Mouse

| Function | linux-napi[x11] | linux-ffi[x11] | linux-nolib[x11] | linux-nolib[portal] | linux-nolib[vt] | win32-napi | win32-ffi | darwin-napi | darwin-ffi |
|----------|------|------|------|------|------|------|------|------|------|
| mouse_ctor | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| mouse_press | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| mouse_release | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| mouse_scrollH | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| mouse_scrollV | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| mouse_getPos | ok | ok | ok | skip | skip | ok | ok | ok | ok |
| mouse_setPos | ok | ok | ok | skip | ok | ok | ok | ok | ok |
| mouse_getButtonState | ok | ok | ok | skip | skip | ok | ok | ok | ok |

## Window

| Function | linux-napi[x11] | linux-ffi[x11] | linux-nolib[x11] | win32-napi | win32-ffi | darwin-napi | darwin-ffi |
|----------|------|------|------|------|------|------|------|
| window_ctor | ok | ok | ok | ok | ok | ok | ok |
| window_isValid | ok | ok | ok | ok | ok | ok | ok |
| window_close | ok | ok | ok | ok | ok | ok | ok |
| window_isTopMost | ok | ok | ok | ok | ok | ok | ok |
| window_isBorderless | ok | ok | ok | ok | ok | ok | skip |
| window_isMinimized | ok | ok | ok | ok | ok | ok | ok |
| window_isMaximized | ok | ok | ok | ok | ok | ok | ok |
| window_setTopMost | ok | ok | ok | ok | ok | skip | skip |
| window_setBorderless | ok | ok | ok | ok | ok | skip | skip |
| window_setMinimized | ok | ok | ok | ok | ok | ok | ok |
| window_setMaximized | ok | ok | ok | ok | ok | ok | ok |
| window_getProcess | ok | ok | ok | ok | ok | ok | ok |
| window_getPID | ok | ok | ok | ok | ok | ok | ok |
| window_getHandle | ok | ok | ok | ok | ok | ok | ok |
| window_setHandle | ok | ok | ok | ok | ok | ok | ok |
| window_getTitle | ok | ok | ok | ok | ok | ok | ok |
| window_setTitle | ok | ok | ok | ok | ok | ok | ok |
| window_getBounds | ok | ok | ok | ok | ok | ok | ok |
| window_setBounds | ok | ok | ok | ok | ok | ok | ok |
| window_getClient | ok | ok | ok | ok | ok | ok | ok |
| window_setClient | ok | ok | ok | ok | ok | ok | ok |
| window_mapToClient | ok | ok | ok | ok | ok | ok | ok |
| window_mapToScreen | ok | ok | ok | ok | ok | ok | ok |
| window_getList | ok | ok | ok | ok | ok | ok | ok |
| window_getActive | ok | ok | ok | ok | ok | ok | ok |
| window_setActive | ok | ok | ok | ok | ok | ok | ok |
| window_isAxEnabled | ok | ok | ok | ok | ok | ok | ok |

## Process

| Function | linux-napi[x11] | linux-ffi[x11] | linux-nolib[x11] | linux-nolib[portal] | linux-nolib[vt] | win32-napi | win32-ffi | darwin-napi | darwin-ffi |
|----------|------|------|------|------|------|------|------|------|------|
| process_ctor | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_open | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_close | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_isValid | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_is64Bit | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_isDebugged | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_getHandle | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_getName | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_getPath | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_exit | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_kill | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_hasExited | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_getCurrent | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_isSys64Bit | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_getList | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_getWindows | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| process_getModules | ok | ok | skip | skip | skip | ok | ok | ok | ok |
| process_getSegments | ok | ok | skip | skip | skip | ok | ok | ok | ok |

## Screen

| Function | linux-napi[x11] | linux-ffi[x11] | linux-nolib[x11] | linux-nolib[portal] | linux-nolib[vt] | win32-napi | win32-ffi | darwin-napi | darwin-ffi |
|----------|------|------|------|------|------|------|------|------|------|
| screen_ctor | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| screen_synchronize | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| screen_grabScreen | ok | ok | ok | ok | ok | ok | ok | ok | ok |

## Clipboard

| Function | linux-napi[x11] | linux-ffi[x11] | linux-nolib[x11] | win32-napi | win32-ffi | darwin-napi | darwin-ffi | darwin-nolib |
|----------|------|------|------|------|------|------|------|------|
| clipboard_ctor | ok | ok | ok | ok | ok | ok | ok | ok |
| clipboard_clear | ok | skip | ok | ok | ok | ok | ok | ok |
| clipboard_hasText | ok | skip | ok | ok | ok | ok | ok | ok |
| clipboard_getText | ok | skip | ok | ok | ok | ok | ok | ok |
| clipboard_setText | ok | skip | ok | ok | ok | ok | ok | ok |
| clipboard_hasImage | ok | skip | skip | ok | ok | ok | ok | skip |
| clipboard_getImage | ok | skip | skip | ok | ok | ok | ok | skip |
| clipboard_setImage | ok | skip | skip | ok | ok | ok | ok | skip |
| clipboard_getSequence | ok | skip | skip | ok | ok | ok | ok | skip |

## Memory

| Function | linux-napi[x11] | linux-ffi[x11] | win32-napi | win32-ffi | darwin-napi | darwin-ffi |
|----------|------|------|------|------|------|------|
| memory_ctor | ok | ok | ok | ok | ok | ok |
