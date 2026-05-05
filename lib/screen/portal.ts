/**
 * xdg-desktop-portal + PipeWire screen-capture skeleton.
 *
 * Under Wayland the compositor does not expose raw framebuffer access —
 * the legitimate path is `org.freedesktop.portal.ScreenCast` over D-Bus,
 * which returns a PipeWire fd to consume frames from.  The full flow is
 * documented in PLAN.md §6f; recap:
 *
 *   1. Create a session: `org.freedesktop.portal.ScreenCast.CreateSession`.
 *   2. Select sources: `SelectSources(session, {types:MONITOR|WINDOW,
 *      persist_mode:2, restore_token?})`.  `persist_mode=2` asks the
 *      compositor to issue a token we can save for future processes.
 *   3. Start: `Start(session, parent_window)` — shows permission dialog
 *      on first use; returns `restore_token` + source descriptors.
 *   4. OpenPipeWireRemote(session) → fd.
 *   5. Consume frames from the PipeWire stream.
 *
 * Permission handles:
 *   - Saved via `Platform.saveScreenPermission(path)` — writes the
 *     portal-issued `restore_token` plus portal version to `path`.
 *   - Loaded via `Platform.loadScreenPermission(path)` — cached in
 *     the in-memory handle slot so the next CreateSession can pass
 *     it as `restore_token`, potentially skipping the prompt entirely.
 *
 * Elevated-privilege bypass: when the process has CAP_SYS_ADMIN /
 * effective uid 0, screen capture can go through the DRM scanout path
 * (see `./framebuffer.ts`) without ever touching the portal — useful
 * for systemd service automation that shouldn't require a user-session
 * approval.  The auto-select priority in `../platform/mechanisms.ts`
 * reflects this: `drm` is listed before `portal-pipewire` so that
 * the privileged path wins when it's available.
 *
 * This file is a *skeleton* — D-Bus plumbing and PipeWire consumption
 * are substantial work items (see PLAN.md §6f for the full sequence).
 * The probe + permission-handle I/O API ships here so app developers
 * can design their permission flows around it today.
 */

import { existsSync } from "fs";

/**
 * Cheap probe: do we have a session bus to talk to and is a Wayland
 * session running?  Full portal detection (does the bus actually
 * have `org.freedesktop.portal.Desktop` registered?  does that service
 * implement `ScreenCast`?) requires a D-Bus round-trip and lives in
 * the portal client once implemented.
 */
export function portalEnvLikelyPresent(): boolean {
  if (process.platform !== "linux") return false;
  const wayland = !!process.env.WAYLAND_DISPLAY
    || (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland";
  if (!wayland) return false;

  if (process.env.DBUS_SESSION_BUS_ADDRESS) return true;
  // logind puts the session bus socket at a well-known path when the
  // env var isn't inherited (e.g. systemd-run contexts).
  const uid = process.getuid?.();
  if (typeof uid === "number" && existsSync(`/run/user/${uid}/bus`)) return true;

  return false;
}

/** Shape of the persisted permission-handle file. */
export interface PortalPermissionHandle {
  /**
   * Token returned by the portal's `Start` result dict under
   * `restore_token`.  Opaque to us; the compositor uses it to look up
   * the prior approval.
   */
  restore_token: string;
  /**
   * `org.freedesktop.portal.ScreenCast` version at save time.  If the
   * compositor's version later changes in a backward-incompatible way
   * we can detect the mismatch and prompt rather than silently failing.
   */
  portal_version?: number;
  /**
   * Human-readable description used when creating the session, so
   * diagnostic output can explain *which* saved handle is being loaded.
   */
  description?: string;
}

/**
 * Stub: when the full portal client lands, this will:
 *   1. Open a session bus connection (minimal D-Bus client — we can
 *      avoid libdbus by speaking the protocol over the Unix socket
 *      directly; see `sd-bus`'s implementation for reference).
 *   2. Call CreateSession/SelectSources/Start as above.
 *   3. Cache the returned fd + token.
 *   4. Return the PipeWire node description so a separate PipeWire
 *      consumer can read frames.
 *
 * Until then: calling this from the screen dispatcher returns null,
 * which triggers the next-mechanism fallback (DRM or framebuffer for
 * sufficiently-privileged processes; otherwise failure).
 */
export function startPortalCapture(
  _restoreToken?: string,
): { ok: false; reason: string } | { ok: true; restoreToken: string; pipewireFd: number } {
  return {
    ok: false,
    reason: "portal-pipewire screen capture backend not yet implemented (PLAN.md §6f)",
  };
}
