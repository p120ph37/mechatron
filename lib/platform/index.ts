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
 *   - **Skip the prompt**: call `setMechanism("screen", "drm")` when
 *     the process is already running with CAP_SYS_ADMIN to avoid the
 *     portal ScreenCast prompt entirely.
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

// Per-capability cache: probe results + currently selected mechanism.
const _probed: Partial<Record<PlatformCapability, MechanismInfo[]>> = {};
const _active: Partial<Record<PlatformCapability, string>> = {};

function envForCapability(capability: PlatformCapability): string[] {
  const envName =
    capability === "input"     ? "MECHATRON_INPUT_MECHANISM" :
    capability === "screen"    ? "MECHATRON_SCREEN_MECHANISM" :
                                 "MECHATRON_CLIPBOARD_MECHANISM";
  const v = process.env[envName];
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
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
  const envList = envForCapability(capability);

  // Forced preference via env var: try each listed mechanism in order.
  for (const wanted of envList) {
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
  // If the env var forced a specific non-available mechanism we still
  // respect the caller's intent: record it and let them observe the
  // failure through `getCapabilities`.
  if (envList.length > 0) {
    _active[capability] = envList[0];
    return envList[0];
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
 * Force a specific mechanism.  Throws if the requested name is unknown for
 * this capability.  Passing an unavailable mechanism is allowed (useful for
 * forcing a path that *should* work if permissions are fixed) — inspect
 * `getCapabilities(capability).mechanisms` to see the underlying state.
 */
export function setMechanism(capability: PlatformCapability, name: string): void {
  const infos = probeAll(capability);
  if (!infos.find(i => i.name === name) && name !== "none") {
    const known = infos.map(i => i.name).join(", ");
    throw new Error(
      `mechatron: unknown ${capability} mechanism "${name}" (known: ${known || "<none>"})`,
    );
  }
  _active[capability] = name;
}

/** Reset selection so the next call re-runs auto-detection. */
export function resetMechanism(capability: PlatformCapability): void {
  delete _active[capability];
  delete _probed[capability];
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
  setMechanism,
  resetMechanism,
  getCapabilities,
  saveScreenPermission,
  loadScreenPermission,
};
