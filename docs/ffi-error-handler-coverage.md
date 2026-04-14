# FFI Error-Handler Coverage Plan

The FFI backend's "normal-path" lines now sit around 95% after the CI display
harness (openbox + xmessage) and the additional clipboard-image, mouse-X1/X2,
and memory-flag tests land.  The residual ~5% is concentrated in error
handlers that can't be reached by black-box exercise of the API because they
require simulated failure of a kernel/OS primitive.  This document enumerates
each category and proposes a specific strategy for exercising it.

A guiding principle: **do not instrument around the error path**.  Every line
below is live code that runs on real failures — a corrupted clipboard blob,
an aggressive WM, OpenProcess denied after AV quarantine, etc.  The goal is
to trigger the failure in a repeatable way in CI, not to stub it out.

## Categorisation

The uncovered error-path lines fall into four buckets, each with its own
testing strategy:

1. **dlopen / symbol-load failures** — the `try { dlopen(...) } catch { _x = null; }`
   arms in `lib/ffi/{mac,win,x11,linux}.ts`.  Reached when a shared library
   isn't present (e.g. AppKit headless, libXinerama missing).
2. **Handle-allocation failures** — `GlobalAlloc`/`GlobalLock` returning 0,
   `CreateCompatibleBitmap` returning null, `CGBitmapContextCreate` returning
   null.  Reached under memory pressure or with invalid arguments.
3. **Kernel-call failures** — `OpenClipboard` returning 0 (another app holds
   it), `task_for_pid` denied, `XGetWindowProperty` returning non-zero
   status.
4. **Object-validity guards** — the defensive `if (!nsImg || nsImg === 0n)
   return null;` / `if (!send) return false;` arms after `msgSendTyped`
   cache fetches.  Reached when `macFFI()` is nulled between calls (can't
   happen in practice; these are belt-and-suspenders).

## Strategy by category

### 1. dlopen / symbol-load failures

The loader is written so that each shared library is optional — losing
libXinerama or libXtst doesn't crash, it just disables the corresponding
feature.  We can force the catch arms to run by:

- **`LD_PRELOAD` with a stub that refuses `dlopen` for a chosen soname.**
  A 20-line C shim can intercept `dlopen()` and return `NULL` when the
  requested path matches a pattern passed via an env var, while forwarding
  everything else.  Build once in CI, then run one additional test invocation
  with `LD_PRELOAD=./dlopen-stub.so MECHATRON_BLOCK_DLOPEN=libXinerama.so.1`
  to exercise the no-Xinerama fallback.  Repeat for `libXtst.so.6`.

- **On macOS**, use `DYLD_INSERT_LIBRARIES` with the same idea but
  intercepting `dlopen` (the dynamic linker uses the same entry point).
  Blocking `/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics`
  is too destructive (kills AppKit load too), so target smaller libraries
  like libobjc or provide a selective intercept that rejects only specific
  paths.

- **On Windows**, the load helpers catch exceptions from `LoadLibrary`; an
  intercept DLL exported via `Image File Execution Options` → `CorCLSID`
  would be overkill.  Simpler: delete the prebuilt `.node` binary after
  install to cover the no-backend-available path, but that's already
  covered by `lib/napi.ts`'s `tryLoad` exception arm on the NAPI side.

**Effort:** one small C file + one extra CI test invocation per target
library.  Recovers ~12 uncov lines (the `catch` arms plus the null-assignment
branches downstream).

### 2. Handle-allocation failures

The uncovered branches here are hit when a backing allocation fails:

- `hmem = GlobalAlloc(GMEM_MOVEABLE, 0);` returns 0 for zero-length input.
  Add a test `Clipboard.setText("")` explicitly — `winSetText` takes the
  `js2w` path which emits a 2-byte buffer (just the NUL terminator), but
  `GlobalAlloc(..., 0n)` would return 0 for literal empty input.  Today
  we never call it with length 0 because `js2w` always pads with a NUL.
  **Branch isn't actually reachable from outside** unless we change the
  API to allow a user-controlled length.  Recommend removing the `if
  (hmem === 0n) return false;` guard at `clipboard.ts:106` if the caller
  contract makes it dead — but only after confirming `GlobalAlloc` never
  returns 0 on a plausible small-but-nonzero size.  **Action: audit each
  such guard and delete if provably unreachable.**

- `CreateCompatibleBitmap(hdc, 0, 0)` returns null on GDI.  The existing
  `screen_grabScreen(0, 0, 0, 0)` API is guarded at the top by `w <= 0 ||
  h <= 0 return null`, so we can't push a 0 past that.  But
  `screen_grabScreen(0, 0, 100000, 100000)` might exhaust GDI handles
  on a headless runner — worth a try.  **Action:** add a single "grab
  too-large region" assertion to `test/screen.js` and verify it returns
  `null` without crashing.

- `CGBitmapContextCreate` returns null on invalid bitmap info.  All our
  call sites use a fixed `BITMAP_INFO_BGRA_PMA`, so this path is only
  hit for oversize allocations.  Same "grab too-large region" test
  approach as above.

**Effort:** small test additions plus one audit pass.  Recovers ~8
uncov lines; the audit may flag ~3 more as provably dead and delete them.

### 3. Kernel-call failures

These are the most interesting — they represent real failure modes a user
can trigger.  Strategies:

- **`OpenClipboard` returning 0** (`clipboard.ts:54`, 117).  Trigger by
  having a *second* test process hold the clipboard open concurrently.
  On Windows, spawn a PowerShell helper that calls
  `[System.Windows.Forms.Clipboard]::GetDataObject()` in a tight loop,
  then fire the mechatron test; one of the attempts should fail to open.
  Flaky by nature — prefer a targeted unit test that stubs `OpenClipboard`
  at the FFI layer via `jest.spyOn`-style monkey-patch on the loader's
  symbol table, rather than a timing-dependent process race.

- **`task_for_pid` denied** (`memory.ts` mac path).  Already naturally
  covered on macOS when tests run as root against a hardened-runtime
  binary.  The memory test targets `memory-child.c` (non-hardened), so
  this succeeds.  To hit the *failure* arm, add a single assertion that
  opens a known-hardened binary (e.g. `/usr/bin/sudo`) and verifies the
  `Memory` returns invalid.  **Effort: 4 lines in `test/memory.js`.**

- **`XGetWindowProperty` returning non-zero status** (`x11.ts:349`).
  Trigger by passing an invalid window handle to `getWindowProperty`.
  `window_getTitle(999999999)` already does this via `winIsValid`, but
  `winIsValid` returns false first, so the get-property path inside
  `getTitle` is never reached.  Add a direct test via the `Window`
  constructor that bypasses `isValid` — we'd need to export the internal
  helper or add a test-only import.  **Recommendation:** add a
  `MECHATRON_TESTING=1` env-guarded export of `getWindowProperty` and
  exercise it directly in a dedicated test file.

- **`XQueryTree` returning 0 on a bad window** (`window.ts:230`).
  Harder — requires passing a handle that was valid long enough to get
  past `winIsValid` but is destroyed by the time `XQueryTree` runs.
  TOCTOU by construction; unreachable in a single-threaded test.  Leave
  uncovered.

**Effort:** ~15 lines of test code plus one internal export.
Recovers ~20 uncov lines.

### 4. Object-validity guards (defensive)

These are the `if (!send) return false;` / `if (!nsImg || nsImg === 0n)
return null;` checks after helpers that can't plausibly fail in sequence
(e.g. `macFFI()` returning non-null then a cached `msgSendTyped` returning
null on the next line).  They exist because:

- `macFFI()` clears `_ffi` to null on dlopen failure, but once it returns
  non-null it stays non-null; the downstream check is redundant within a
  single call.
- `msgSendTyped` caches by signature; if the first call succeeded, the
  second with the same signature hits the cache.  The null check on the
  cached result can never fire.

**Recommendation: delete the redundant guards.**  Concretely:

- `lib/ffi/clipboard.ts:204, 220, 229-230, 421, 423, 428, 432, 446, 459-461,
  464, 473, 477, 479, 487, 501` — `msgSendTyped` null checks after the first
  successful call with the same signature in the same function.  Each such
  pair is redundant; keep the first, drop the rest.
- `lib/ffi/clipboard.ts:157, 161, 171-172, 174, 181` — `k.GlobalLock`
  second-null-check inside a `try` that already guarded it.

This is a dead-code audit, not a test addition.  Estimated ~20 lines
removable; the rest are load-bearing and should stay.

**Effort:** one audit pass, ~20 lines deleted.

## Execution order

1. **Audit pass first** (category 4).  Delete provably redundant guards.
   This is the cheapest win and also clarifies what "error handler" genuinely
   means in the remaining code.  Est. 1 hour.
2. **Kernel-failure tests** (category 3).  Add the hardened-binary
   `task_for_pid` assertion and the `MECHATRON_TESTING`-guarded
   `getWindowProperty` export + dedicated X11 failure test.  Est. 2 hours.
3. **Handle-allocation tests** (category 2).  Add oversize-region screen
   grabs; audit which `GlobalAlloc` guards are reachable.  Est. 1 hour.
4. **`dlopen` interception** (category 1).  Build the LD_PRELOAD/DYLD shim
   and add two extra CI invocations (libXinerama blocked, libXtst blocked).
   Est. 3 hours including CI wiring.

Target: bring the combined FFI coverage from ~95% (post-display-harness) to
≥98%.  The remaining ≤2% will be genuinely unreachable — TOCTOU races,
cache-hit-but-null-return impossibilities, and platform-specific constant
arms in switch statements whose enumerants are never exercised from the
public API (e.g. `BUTTON_X1` on Linux — `linux_xButton` returns null
because XTest has no X1/X2, but that line is now reached by the extended
mouse test).
