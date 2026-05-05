# Mechatron

## Project structure

This is a monorepo. The Rust/napi native layer lives in `napi/` and is built
from this same repository — it is not an external dependency.

### napi/ — Rust Cargo workspace

- **`napi/Cargo.toml`** — workspace root with 8 member crates
- **`napi/shared/`** — shared helpers (x11.rs, mach.rs) used by multiple crates
- **`napi/{keyboard,mouse,clipboard,screen,window,process,memory}/`** — per-subsystem
  crate directories, each containing `Cargo.toml`, `build.rs`, and `src/lib.rs`
- **`napi/src/{subsystem}.rs`** — platform implementations guarded by
  `#[cfg(target_os = "linux")]`, `#[cfg(target_os = "macos")]`,
  `#[cfg(target_os = "windows")]`
- Each crate builds a `.node` cdylib via napi-rs, published as
  `@mechatronic/napi-{subsystem}`

Build: `cd napi && cargo build --release`

### Backend resolution order

`lib/napi.ts` resolves backends in order: **napi → ffi → nolib**. Each
subsystem can have variants (e.g. x11, portal, vt, sh). The `usesVariant` flag
in the backend resolver prevents false variant tagging for subsystems that don't
use variants (like process and memory).

### Key directories

| Directory | Purpose |
|-----------|---------|
| `lib/napi/` | TS wrappers that call into `.node` binaries |
| `lib/ffi/` | `bun:ffi` backend — dlopens system libs directly |
| `lib/nolib/` | Pure TS backend — no native libraries at all |
| `lib/x11proto/` | Pure X11 wire protocol (conn, wire, request, xconn, xproto) |
| `lib/dbus/` | Pure TS D-Bus wire protocol |
| `lib/portal/` | XDG portal clients (remote-desktop, screenshot) |
| `test/` | Test suite; `test/matrix.js` reads `COMPATIBILITY.md` tables |
| `packages/mechatron-robot-js/` | robot-js 2.2.0 backward-compat shim |

## bun:ffi darwin pointer-handling conventions

All darwin FFI work must follow these rules:

1. **T.i64 for all pointer-typed FFI args and returns.** Never use T.ptr for
   darwin — it rejects bigints above 2^63 (tagged pointers have the high bit
   set). T.i64 preserves the full 64-bit pattern as a signed bigint, which is
   ABI-equivalent to an unsigned pointer at the register level.

2. **Pointers are opaque 64-bit bit-patterns.** Never call `Number()` on a
   pointer value. Never assume address-space width, signedness, or alignment.
   The only allowed operations on pointer values are equality comparison and
   falsy/truthy checks (0n is falsy).

3. **Use `bp()` to pass JS buffers as pointer args.** The `bp(view)` helper
   (in `lib/ffi/bun.ts`) calls `F.ptr(view)` and normalises the result to
   bigint, suitable for T.i64 args.

4. **Never use `F.toArrayBuffer` or `F.CString` with bigint pointers.** These
   bun:ffi APIs reject bigint at runtime. Instead, copy data into a JS-owned
   buffer via an FFI call (e.g. `[nsData getBytes:length:]`, `CFStringGetCString`,
   `CFNumberGetValue`) and decode from that buffer.

5. **CF lifecycle: use callback patterns.** When accessing non-owning refs from
   CF containers (e.g. `CFArrayGetValueAtIndex`), use a callback pattern like
   `mac_withWindowDict` or `mac_withAXWindow` so the ref is only accessed while
   the owning container is alive. Never return a non-owning CF ref across a
   CFRelease boundary.

6. **`cfBool(v)` for kCFBooleanTrue/False.** These are singletons resolved via
   `dlsym` at first call. Do not construct CFBoolean values any other way.

7. **`cfStringFromJS(s)` for CFString creation.** Uses `CFStringCreateMutable` +
   `CFStringAppendCString` to avoid tagged-pointer issues with short ASCII
   strings on arm64. Caller must `CFRelease` the result.
