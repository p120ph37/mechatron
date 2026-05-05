/**
 * `Platform` — runtime introspection and selection of the backing
 * mechanism for each multi-implementation capability (`input`, `screen`,
 * `clipboard`).
 *
 * Mechatron's Linux port in particular can pick between several
 * implementations for each capability: XTest vs uinput vs libei for
 * input; XRandR/XGetImage vs PipeWire portal vs /dev/dri vs /dev/fb0
 * for screen capture; wl-clipboard vs xclip vs xsel for clipboard.
 *
 * Most callers never need to touch this API — auto-detection picks the
 * best available mechanism.  The interesting use cases are:
 *
 *   - **Permission gating**: know in advance whether we'll require
 *     elevated privileges or a runtime prompt.
 *   - **Skip the prompt**: call `setMechanism("screen", "framebuffer")`
 *     on a TTY/headless system to avoid the portal ScreenCast prompt.
 *   - **Virtual-display support**: branch on `supportsOffScreen` to
 *     decide whether to warn that the selected screen mechanism can't
 *     see Xvfb / headless scanout targets.
 *   - **Diagnostics**: `listMechanisms` returns `{available, reason}`
 *     for every mechanism we know about, which is invaluable in bug
 *     reports from users with unusual setups.
 */

import {
  CapabilitySummary, MechanismInfo, PlatformCapability,
} from "./types";
import { CAPABILITY_MECHANISMS } from "./mechanisms";

export type { CapabilitySummary, MechanismInfo, PlatformCapability } from "./types";

// Per-capability cache: probe results, currently-active mechanism, and the
// caller-supplied preference list (from env var or setMechanism([...])).
// When a preference list is set we honour it strictly: auto-detection only
// considers those names, and runtime fallback inside a dispatcher (e.g.
// clipboard) is bounded to that same list.
const _probed: Partial<Record<PlatformCapability, MechanismInfo[]>> = {};
const _active: Partial<Record<PlatformCapability, string>> = {};
const _pinnedList: Partial<Record<PlatformCapability, string[]>> = {};

function envForCapability(capability: PlatformCapability): string[] {
  if (capability === "input") return [];
  const envName =
    capability === "screen"    ? "MECHATRON_SCREEN_MECHANISM" :
                                 "MECHATRON_CLIPBOARD_MECHANISM";
  const v = process.env[envName];
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

function pinnedList(capability: PlatformCapability): string[] {
  if (_pinnedList[capability]) return _pinnedList[capability]!;
  return envForCapability(capability);
}

function probeAll(capability: PlatformCapability): MechanismInfo[] {
  if (_probed[capability]) return _probed[capability]!;
  const probes = CAPABILITY_MECHANISMS[capability] || [];
  const infos = probes.map(p => {
    try {
      return p();
    } catch (e) {
      return {
        name: "unknown",
        description: "probe threw unexpectedly",
        available: false,
        requiresElevatedPrivileges: false,
        requiresUserApproval: false,
        supportsOffScreen: false,
        reason: String((e as Error)?.message || e),
      } satisfies MechanismInfo;
    }
  });
  _probed[capability] = infos;
  return infos;
}

function selectActive(capability: PlatformCapability): string | null {
  if (_active[capability]) return _active[capability]!;
  const infos = probeAll(capability);
  const preferred = pinnedList(capability);

  // Forced preference (env var or setMechanism([...])): try each listed
  // mechanism in order.
  for (const wanted of preferred) {
    if (wanted === "none") {
      _active[capability] = "none";
      return "none";
    }
    const m = infos.find(i => i.name === wanted);
    if (m && m.available) {
      _active[capability] = m.name;
      return m.name;
    }
  }
  // If the user pinned a specific non-available mechanism we still
  // respect the caller's intent: record it and let them observe the
  // failure through `getCapabilities`.
  if (preferred.length > 0) {
    _active[capability] = preferred[0];
    return preferred[0];
  }

  // Auto-select: first `available: true`.
  const picked = infos.find(i => i.available);
  _active[capability] = picked?.name || null as any;
  return picked?.name || null;
}

/** List every known mechanism for a capability, in priority order. */
export function listMechanisms(capability: PlatformCapability): MechanismInfo[] {
  return probeAll(capability).map(i => ({ ...i }));
}

/**
 * Identify which mechanism is currently in use for a capability.  Returns
 * `null` if no mechanism is available for this platform.
 */
export function getMechanism(capability: PlatformCapability): string | null {
  return selectActive(capability);
}

/**
 * Pin one or more mechanisms for a capability.
 *
 * Accepts either a single name (`"xclip"`) or a priority-ordered list
 * (`["wl-clipboard", "xclip"]`).  When multiple names are given, the
 * first *available* mechanism from the list is selected as active; if
 * none are available, the first named mechanism is recorded as active
 * so `getCapabilities()` can surface the failure.
 *
 * Runtime fallback (e.g. the Linux clipboard dispatcher's per-call
 * retry on exception) is bounded to the pinned list — fallback will
 * never escape into mechanisms the caller explicitly excluded.
 *
 * Passing `"none"` suppresses the capability entirely (useful in tests
 * to validate stub behaviour).  Unknown names throw.
 */
export function setMechanism(
  capability: PlatformCapability,
  nameOrList: string | string[],
): void {
  const infos = probeAll(capability);
  const list = (Array.isArray(nameOrList) ? nameOrList : [nameOrList])
    .map(s => s.trim()).filter(Boolean);
  if (list.length === 0) {
    throw new Error(`mechatron: setMechanism(${capability}) requires at least one name`);
  }
  const known = new Set(infos.map(i => i.name));
  for (const n of list) {
    if (n !== "none" && !known.has(n)) {
      const knownStr = [...known].join(", ");
      throw new Error(
        `mechatron: unknown ${capability} mechanism "${n}" (known: ${knownStr || "<none>"})`,
      );
    }
  }
  _pinnedList[capability] = list;
  delete _active[capability];   // re-select from the new list
}

/**
 * Return the caller-pinned preference list (from env or `setMechanism`),
 * or `null` if no override is in effect (auto-detection is running).
 */
export function getPreferredMechanisms(capability: PlatformCapability): string[] | null {
  const list = pinnedList(capability);
  return list.length > 0 ? list.slice() : null;
}

/** Reset selection so the next call re-runs auto-detection. */
export function resetMechanism(capability: PlatformCapability): void {
  delete _active[capability];
  delete _probed[capability];
  delete _pinnedList[capability];
}

/** Summary: active mechanism + every probed mechanism + capability flags. */
export function getCapabilities(capability: PlatformCapability): CapabilitySummary {
  const mechanisms = listMechanisms(capability);
  const active = selectActive(capability);
  const activeInfo = mechanisms.find(m => m.name === active);
  return {
    active,
    mechanisms,
    requiresElevatedPrivileges: !!activeInfo?.requiresElevatedPrivileges,
    requiresUserApproval: !!activeInfo?.requiresUserApproval,
    supportsOffScreen: !!activeInfo?.supportsOffScreen,
  };
}

// =============================================================================
// Permission handle management
// =============================================================================
// Some mechanisms (portal-pipewire, libei) allocate an opaque permission
// handle the first time the user approves capture / input.  Persisting
// that handle to disk lets the next process reuse it, so the end user
// doesn't see the approval dialog every time an automated tool runs.
//
// The handle is just a JSON blob managed by the mechanism that owns it;
// callers pass it opaquely.

import { promises as fs } from "fs";

/**
 * Save the current screen-capture permission handle (if any) to `path`.
 * No-op on platforms where capture doesn't use a revocable permission
 * handle (all of Windows/macOS, and the classic X11 path on Linux).
 *
 * See `PLAN.md` §6f for the full portal-based screen capture roadmap.
 */
export async function saveScreenPermission(path: string): Promise<boolean> {
  const handle = _getSavedScreenHandle();
  if (!handle) return false;
  await fs.writeFile(path, JSON.stringify(handle), { mode: 0o600 });
  return true;
}

/**
 * Load a previously-saved screen-capture permission handle from `path` and
 * cache it for use by the screen subsystem.  Silently ignores a missing
 * / unparseable file and returns false.
 */
export async function loadScreenPermission(path: string): Promise<boolean> {
  try {
    const data = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === "object") {
      _setSavedScreenHandle(parsed);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

// Internal permission-handle store — the pipewire portal backend will
// populate this once it lands (Phase 6f); the public save/load APIs are
// shipped now so app authors can design their permission flows around
// them without waiting for the backend.
let _savedScreenHandle: unknown = null;
export function _getSavedScreenHandle(): unknown { return _savedScreenHandle; }
export function _setSavedScreenHandle(v: unknown): void { _savedScreenHandle = v; }

// Convenience namespace for clients that prefer `Platform.getMechanism(...)`
// over direct named imports.
export const Platform = {
  listMechanisms,
  getMechanism,
  getPreferredMechanisms,
  setMechanism,
  resetMechanism,
  getCapabilities,
  saveScreenPermission,
  loadScreenPermission,
};
