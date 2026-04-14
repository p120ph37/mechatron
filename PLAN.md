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
- `test/test.js` — comprehensive test suite exercising all subsystems,
  including a cross-process Memory round-trip against a plain non-hardened
  C helper (`test/memory-child.c`) that stands in for a real-world debug
  target
- TCC grants for macOS (accessibility, post-event, screen capture)
- Platform capability expectations table prevents silent test regressions
- Mach VM tests enabled on both darwin-arm64 and darwin-x64
- Graceful degradation with hard-fail if expected capability regresses

---

## Phase 2: Rust NAPI Rewrite (COMPLETE)

Replaced the C++ native layer with Rust using `napi-rs`, maintaining full
behavioral parity with the original robot-js documented APIs.

### 2a. Rust Native Backend
- `napi/` — Cargo workspace with napi-rs v2 `#[napi]` attribute macros
- `napi/src/` — Rust source modules: `keyboard.rs`, `mouse.rs`,
  `clipboard.rs`, `screen.rs`, `window.rs`, `process.rs`, `memory.rs`,
  `mach.rs` (shared macOS helpers), `x11.rs` (shared Linux helpers)
- Platform-specific code via `#[cfg(target_os = "...")]` guards
- Windows: `windows` crate v0.58
- macOS: `objc2`, `objc2-app-kit`, `objc2-core-graphics`, `objc2-core-foundation`,
  Mach VM APIs via raw `extern "C"` FFI
- Linux: X11/XRandR via raw FFI, `/proc` filesystem

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

#### Package Layout
- Root `mechatron` package — all TypeScript lives in `lib/`, exports the full
  modern API via named exports
- `packages/@mechatronic/napi-keyboard`, `napi-mouse`, `napi-clipboard`,
  `napi-screen`, `napi-window`, `napi-process`, `napi-memory` — native-only
  packages containing per-subsystem `.node` prebuilt binaries, listed as
  `optionalDependencies` of `mechatron`
- `packages/mechatron-robot-js` — compatibility shim (phase 3)
- `lib/napi.ts` — unified native loader: resolves `@mechatronic/napi-<sub>`
  packages (workspace symlinks provide resolution during development)

#### Cargo Workspace Layout
- `napi/Cargo.toml` — workspace root
- `napi/shared/` — internal lib crate for `x11.rs` / `mach.rs` helpers
- `napi/{keyboard,mouse,clipboard,screen,window,process,memory}/` —
  one `cdylib` crate per subsystem, each including its source via
  `#[path = "../../src/<module>.rs"]` from the shared `napi/src/` tree
- CI builds all seven crates and distributes each `.node` into the matching
  `packages/@mechatronic/napi-<sub>/` directory

#### Build System
- `tsc` compiles all TypeScript from `lib/` into `dist/` (single tsconfig,
  no project references); bun was dropped
- `dist/` is not committed — generated on demand by `tsc`

#### Release Flow
- Root version bump via `npm version` is applied across all workspaces
- `optionalDependencies` are pinned to the exact release version at publish
- Publish order: native packages → main package → robot-js shim

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

| Package | Contents |
|---------|---------|
| `mechatron` | All TypeScript + API exports |
| `@mechatronic/napi-keyboard` | Native binary: keyboard |
| `@mechatronic/napi-mouse` | Native binary: mouse |
| `@mechatronic/napi-clipboard` | Native binary: clipboard |
| `@mechatronic/napi-screen` | Native binary: screen |
| `@mechatronic/napi-window` | Native binary: window |
| `@mechatronic/napi-process` | Native binary: process |
| `@mechatronic/napi-memory` | Native binary: memory |
| `mechatron-robot-js` | Legacy robot-js 2.2.0 compat shim |

### Motivation for Split
- **AV false positives**: Memory inspection (read/write foreign process memory,
  module enumeration) triggers antivirus heuristics.  Applications that only
  need keyboard/mouse/screen should not ship memory-related native code.
- **Install size**: Each native binary includes all platform code.  Splitting
  lets consumers download only the capabilities they use.
- **Security surface**: Consumers can audit and permission-gate specific
  capabilities rather than granting access to everything.

---

---

## Phase 5: Bun FFI Backend

A second native backend that uses `bun:ffi` to dlopen the underlying
**system libraries directly** (libX11/libXtst on Linux, user32.dll on
Windows, eventually CoreGraphics on macOS).

### Design

- **No native build artifact ships for FFI.**  The entire FFI implementation
  lives in TypeScript under `lib/ffi/` and is loaded by Bun directly via the
  `"bun"` exports condition in `package.json`.  A Bun consumer needs nothing
  beyond `bun install mechatron` — no `.node`, `.so`, `.dll`, or `.dylib`
  is downloaded for Bun runtime use.
- A first attempt scaffolded a parallel Rust workspace (`ffi/`) producing
  `cdylib`s loaded via `bun:ffi`.  That was reverted: the Rust shim was
  effectively the same code as the existing napi crates, so loading it via
  FFI instead of napi gained nothing.
- The mechatron core API (`lib/keyboard/Keyboard.ts`, etc.) is unchanged.
  It calls `getNative("keyboard")` which goes through `lib/napi.ts` (the
  unified loader) and gets either a napi `.node` module or a TypeScript
  module from `lib/ffi/<sub>.ts`.

### Native TypeScript Entrypoint

`package.json` adds an `exports` map with a `"bun"` condition pointing at
`./lib/index.ts`.  Bun runs the TypeScript directly (no transpile required);
Node.js continues to load the compiled `./dist/index.js`.  The npm package
ships **both** `dist/` and `lib/` so engines can pick whichever is best
suited — there is no standard for engine-conditional downloads.

### Backend Selection

`lib/napi.ts` (the unified loader) picks per-subsystem:

- **Node.js**: only `napi` is considered.
- **Bun**: tries `napi` first (same as Node.js — faster and better tested);
  falls back to `ffi` (loading `lib/ffi/<sub>.ts`) when the
  `@mechatronic/napi-<sub>` prebuild isn't installed.
- `MECHATRON_BACKEND=napi|ffi` env var forces a specific backend.

A new `getBackend(subsystem)` API reports which backend is in use.

### Implementation Status

| Subsystem | FFI | Notes |
|-----------|-----|-------|
| keyboard  | Linux, Windows | macOS deferred (Objective-C runtime via FFI) |
| mouse     | Linux, Windows | macOS deferred |
| clipboard | Linux (stubs), Windows | Linux X11 has no clipboard manager — mirrors napi stubs |
| screen    | Linux, Windows | XRandR 1.5 + XGetImage on Linux; BitBlt + GetDIBits on Windows |
| window    | Linux, Windows (stubs) | Linux full EWMH/Motif; Windows mirrors napi stubs |
| process   | Linux, Windows | /proc on Linux; toolhelp + psapi on Windows |
| memory    | Linux, Windows | process_vm_readv/writev on Linux; RPM/WPM/VirtualQueryEx on Windows |

All subsystems are now FFI-implemented on Linux and Windows (matching the
napi backend's coverage).  macOS remains deferred for both backends.

### Test Runner

`test/test.js` now runs the suite under up to three engines:

- `node-napi`: Node.js + napi backend (always probed)
- `bun-ffi`:  Bun + forced FFI backend (probed if `bun` is in PATH)
- `bun-napi`: Bun + forced napi backend (probed if `bun` is in PATH)

Each engine runs as a child process with `MECHATRON_BACKEND` set
appropriately.  All subsystems run under all three engines.

### Roadmap (Phase 5)

- [x] `lib/ffi/{keyboard,mouse}.ts` for Linux + Windows
- [x] Unified loader with backend selection
- [x] Dual-engine test runner
- [x] FFI port of remaining 5 subsystems (clipboard, screen, window, process, memory)
- [ ] macOS FFI (Objective-C bridge or libffi struct passing)
- [ ] Remove napi dependency for Bun-only deployments

---

---

## Phase 6: Linux / Wayland Platform Compatibility Enhancements

Mechatron's Linux support has historically assumed a classic X11 session with
`libXtst` + `libXrandr` available and accepting synthetic events.  That
assumption breaks in three increasingly common environments:

- **X11 without XTest** — minimal server builds, Xephyr, some remote-access
  servers, and security-hardened hosts often ship Xlib only.  Our mouse /
  keyboard subsystems silently no-op.
- **Wayland sessions** — XWayland provides an X11 compatibility surface but
  most compositors disable synthetic input through it, and screen capture
  through XWayland only sees the single XWayland root, not the real
  compositor output.
- **Headless / container** — a bare framebuffer (`/dev/fb0`, KMS dumb
  buffers) with no display server at all.

Phase 6 adds layered fallback mechanisms, explicit mechanism selection, and
runtime introspection so callers can discover what's in use and why.

### 6a. Platform Mechanism Introspection API (COMPLETE — scaffolding)

A new `Platform` module exports three functions per subsystem that can have
multiple mechanisms (currently `input` — shared by keyboard + mouse — and
`screen`; `clipboard` follows the same shape):

```ts
import { Platform } from "mechatron";

Platform.listMechanisms("input");    // ["xtest", "uinput", "xproto", "libei"]
Platform.getMechanism("input");      // "xtest"   — whichever was probed/picked
Platform.setMechanism("input", "uinput");  // force-select; throws if unavailable
Platform.getCapabilities("screen");  // { offScreenCapture: true, requiresUserApproval: false, … }
```

Selection priority for each capability is:

1. Explicit `Platform.setMechanism(capability, "xclip")` or
   `Platform.setMechanism(capability, ["wl-clipboard", "xclip"])` call at
   runtime.  A list pins the allowed set: runtime fallback never escapes
   into mechanisms the caller excluded, which is useful both for tests
   (force-select a specific implementation) and for production
   deployments that need to exclude a path for security/audit reasons.
2. Environment variable: `MECHATRON_INPUT_MECHANISM`,
   `MECHATRON_SCREEN_MECHANISM`, `MECHATRON_CLIPBOARD_MECHANISM`
   (comma-separated priority list accepted, same semantics as the
   `setMechanism` list form).
3. Auto-detection — probe each mechanism in a defined priority order and
   pick the first that self-reports available.

Query the current selection and pinned preference list with
`Platform.getMechanism(capability)` and
`Platform.getPreferredMechanisms(capability)` respectively.

Each mechanism exposes a `probe()` that returns a `MechanismInfo`:

```ts
interface MechanismInfo {
  name: string;                      // "xtest", "uinput", …
  available: boolean;
  requiresElevatedPrivileges: boolean;
  requiresUserApproval: boolean;     // runtime prompt required?
  supportsOffScreen: boolean;        // virtual displays / off-screen windows
  description: string;
  reason?: string;                   // why unavailable, if applicable
}
```

This gives app authors a principled way to decide (e.g.) whether to prompt
the user for elevated privileges up front, or to skip Wayland's portal
dialog by pre-caching a permission handle.

### 6b. Linux Clipboard Support (COMPLETE — subprocess bridge)

X11 has no clipboard manager; content only persists while the owning client
is alive.  The in-process alternatives all have caveats that make them
unattractive as the *default* path:

- **libX11 + libXfixes + background thread** works on X11 but requires
  process-lifetime thread management and fights short-lived CLI scripts.
- **Wayland `wlr-data-control`** works on wlroots + KWin but not on
  GNOME/Mutter — currently the biggest Wayland installed base.
- **`org.freedesktop.portal.Clipboard`** (part of xdg-desktop-portal)
  requires a RemoteDesktop session and full D-Bus integration; it's new
  enough (2024+) to still have implementation gaps.

Instead we shell out to a small set of well-established helpers that
already handle the per-compositor protocol quirks and maintain their own
persistent owner processes:

| Mechanism | Backing tool(s) | Notes |
|-----------|-----------------|-------|
| `wl-clipboard` | `wl-copy`, `wl-paste` | Wayland (wlroots + KWin) |
| `xclip` | `xclip` | Classic X11 (also reaches GNOME via XWayland) |
| `xsel` | `xsel` | X11 alternative |

Auto-selection considers session type + `$XDG_CURRENT_DESKTOP`:
GNOME-Wayland specifically is routed to `xclip` / `xsel` via XWayland
because `wl-copy` exits 0 but silently no-ops against Mutter.  Override
via `MECHATRON_CLIPBOARD_MECHANISM=wl-clipboard|xclip|xsel|none`.  At
call time, if the active mechanism *throws*, the dispatcher falls
through to the next available one and promotes it to active for the
rest of the process's life; an empty read, by contrast, is treated as
a legitimate "clipboard is empty" signal and not a failure.

Implementation lives in TypeScript (`lib/clipboard/linux.ts`) so it works
for both the napi and ffi backends unchanged — the napi stubs still live
as a last-resort when no tool is installed.

**Image support** (both read and write) requires a small PNG
encoder/decoder to round-trip ARGB through `--type image/png`.  Deferred
but tracked; the text path works today and covers the overwhelming
majority of clipboard use.

**Portal-based clipboard (future work)**: once
`org.freedesktop.portal.Clipboard` reaches universal support across
GNOME, KDE, and wlroots (likely 2026+), a `portal-clipboard` mechanism
can be added that shares session-creation, D-Bus wiring, and
permission-handle caching with the `portal-pipewire` screen-capture
mechanism (6f).  Both use the same `RemoteDesktop` session, so the
heavy lifting — D-Bus method-call scaffolding, `restore_token`
persistence via `Platform.saveScreenPermission` / `loadScreenPermission`,
`CreateSession` request plumbing — is already on the roadmap and will
be re-used rather than re-implemented.

### 6c. uinput Virtual Input Device Fallback (COMPLETE — skeleton)

When XTest is unavailable or the session is Wayland, input can still be
synthesised by creating a virtual keyboard/mouse via `/dev/uinput`:

- Opens `/dev/uinput`, sets `UI_SET_EVBIT` / `UI_SET_KEYBIT` / `UI_SET_RELBIT`
  for the keys and axes we emit, writes `uinput_user_dev`, ioctl
  `UI_DEV_CREATE`.
- Emits `EV_KEY` / `EV_REL` / `EV_SYN` structs to generate presses,
  releases, motions, and scroll events.
- Requires `CAP_SYS_ADMIN` or a udev rule (`KERNEL=="uinput", MODE="0660", GROUP="input"`).

Detection checks read access on `/dev/uinput`; if unavailable, reports
`requiresElevatedPrivileges: true` so callers know to prompt.  Because
uinput works at the evdev layer, it works equally well under X11, Wayland,
and headless sessions — but it cannot report *current* pointer/key state
(that's a session-level concept), so `Mouse.getPos()` / `Keyboard.getState()`
still transparently delegate to the X11 backend if one is also available.

### 6d. Direct X Protocol Implementation (PLANNED)

An intermediate fallback that speaks the X11 wire protocol directly over
`$DISPLAY` (Unix socket or TCP), with no dependency on `libX11` /
`libXtst` / `libXrandr`:

- **Connection setup**: parse `$DISPLAY`, read Xauthority cookie,
  send `X_ConnSetup` (byte-order + protocol version + auth), parse the
  server's reply (screen/visual info lives right in the connection
  setup response).
- **Key/pointer events**: `WarpPointer` is a core X request; synthesised
  input via `XTestFakeInput` is a single extension opcode that we can
  send directly.  We can still probe for the XTEST extension without
  libXtst via `X_QueryExtension`.
- **Screen capture**: `GetImage` is core X; we already decode its reply
  ourselves in the `XGetPixel` path.  XRandR monitor enumeration uses
  opcode 42 of the RandR extension, which decodes to a straightforward
  byte-layout reply.

Benefits: no libX11/libXtst/libXrandr soname dependency (Alpine/musl
distros that don't bundle them; containers that strip shared libraries);
identical behaviour between the napi and ffi backends; easier to thread
or background than libX11 which holds a global display lock.

Risk: the X protocol is large; we only need a tiny subset, but the
connection-setup parse is intricate.  This is planned as an *additional
intermediate* fallback between xtest/libX11 and uinput/framebuffer —
not a replacement for the library path unless it proves robust enough.

### 6e. Framebuffer / KMS Screen Capture (COMPLETE — skeleton)

For headless / TTY / container contexts with no X server, mechatron can
read pixels directly from:

- **`/dev/fb0`** (legacy framebuffer device) — mmap the device, read
  `FBIOGET_VSCREENINFO` + `FBIOGET_FSCREENINFO` for geometry, decode
  the pixel format (usually 32-bit ARGB or 16-bit RGB565) and convert
  to our canonical ARGB.
- **`/dev/dri/card0`** with DRM dumb buffers — required for most
  modern Linux systems where `/dev/fb0` is deprecated and the actual
  scanout lives in KMS planes.  Uses `DRM_IOCTL_MODE_GETCRTC` +
  `DRM_IOCTL_MODE_MAP_DUMB` + `mmap`.

Both paths require `CAP_SYS_ADMIN` or `video` group membership;
`Platform.getCapabilities("screen")` reports `requiresElevatedPrivileges: true`
when only the framebuffer mechanism is available.

### 6f. Wayland / PipeWire Screen Capture (PLANNED)

Wayland compositors expose screen capture via the `org.freedesktop.portal.ScreenCast`
portal over D-Bus.  The flow is:

1. Call `CreateSession` on `org.freedesktop.portal.ScreenCast` → returns a
   session handle.
2. `SelectSources` (optionally with `persist_mode=2` to get a reusable
   permission handle).
3. `Start` — this is where the user sees the permission prompt.  The
   return includes a `restore_token` string we can persist to disk.
4. `OpenPipeWireRemote` → returns a PipeWire fd we consume frames from.

Permission-caching flow:

- `Platform.saveScreenPermission("./my-app.tok")` — writes the restore
  token from the current session.
- `Platform.loadScreenPermission("./my-app.tok")` — on next run, pass
  the cached token; the portal may either skip the prompt or fall back
  to prompting if the token is no longer valid.

If the process is run as root or started via a systemd unit with the
`CAP_SYS_ADMIN` capability, we can bypass the portal entirely via the
DRM scanout path (6e).  The screen mechanism selector is:

```
root / CAP_SYS_ADMIN         → drm  (no prompt)
Wayland session              → portal-pipewire (prompt, cache token)
X11 session                  → xrandr+XGetImage  (the classic path)
last resort                  → framebuffer  (works everywhere, needs perms)
```

### 6g. libei / Remote Desktop Portal Input (PLANNED)

A Wayland-native analogue of uinput for input synthesis:
`org.freedesktop.portal.RemoteDesktop` exposes a libei (Emulated Input)
session that bypasses uinput's root/udev requirement by routing through
the same portal infrastructure as screen capture.  Similar permission-
caching semantics; same `restore_token` idea.

### 6h. CI matrix expansion (PLANNED)

- Add a Wayland runner (Sway + Weston) job to CI.
- Add an XTest-stripped runner that dlopen-blocks libXtst to validate
  the uinput/xproto fallbacks run real workloads.
- Add a framebuffer-only job (no X server) exercising DRM capture.

### 6i. Phase 6 Implementation Status

| Item | Status | Notes |
|------|--------|-------|
| Platform mechanism introspection (6a) | **Complete** | `getMechanism`, `listMechanisms`, `setMechanism`, `getCapabilities` |
| Linux clipboard via wl-clipboard/xclip/xsel (6b) | **Complete** | TS bridge with tool auto-detection |
| uinput fallback (6c) | **Skeleton** | Probe + node-level detection; full write path scaffolded |
| Pure X protocol (6d) | **Planned** | Connection-setup parser is the gating work item |
| Framebuffer / DRM capture (6e) | **Skeleton** | /dev/fb0 probe + mmap path; DRM TBD |
| Portal+PipeWire screen capture (6f) | **Planned** | D-Bus portal detection landed; capture thread TBD |
| Portal+libei input (6g) | **Planned** | Detection landed; sendinput TBD |
| CI expansion (6h) | **Planned** | Job definitions TBD |

---

## Roadmap Summary

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | **Complete** | C++ NAPI port, flat backend, CI on 6 platforms |
| 2 | **Complete** | Rust NAPI rewrite via napi-rs, full robot-js API parity |
| 3 | **Complete** | mechatron-robot-js compatibility shim |
| 4a | **Complete** | Segmented native packages (`@mechatronic/napi-*` as optionalDependencies) |
| 4b | **Complete** | API modernization (async variants, typed named exports, drop `callableClass`) |
| 5 | **Complete** | Bun FFI backend: pure-TS `bun:ffi` to system libs, no native binary needed under Bun (Linux + Windows) |
| 6 | **In progress** | Linux/Wayland compat — mechanism introspection, clipboard, uinput/DRM/portal fallbacks |
