/**
 * Registry of known mechanisms for each platform capability, along with a
 * cheap `probe()` for each so auto-selection can pick the first available
 * one without paying for its full initialisation.
 *
 * Probes must be:
 *   - Cheap (fs.stat, env var read, optional lightweight syscall).
 *   - Non-throwing (any failure → `available: false` with a `reason`).
 *   - Pure (probe results are cached per-process by the dispatcher).
 *
 * Actual use of a mechanism is separate from probing — the mechanism is
 * only instantiated once `getMechanism(capability)` is resolved and a
 * caller invokes something through it.  This keeps `Platform.listMechanisms`
 * cheap and side-effect-free.
 */

import { existsSync, accessSync, constants as fsConstants } from "fs";
import { execFileSync } from "child_process";
import { MechanismInfo, PlatformCapability } from "./types";
import { parseDisplay } from "../x11proto/wire";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

function sessionType(): string {
  // XDG_SESSION_TYPE is the standard indicator; WAYLAND_DISPLAY covers
  // compositors that launch from a TTY without logind.
  const s = (process.env.XDG_SESSION_TYPE || "").toLowerCase();
  if (s) return s;
  if (process.env.WAYLAND_DISPLAY) return "wayland";
  if (process.env.DISPLAY) return "x11";
  return "tty";
}

function hasDisplay(): boolean {
  return !!process.env.DISPLAY;
}

function hasWayland(): boolean {
  return !!process.env.WAYLAND_DISPLAY || sessionType() === "wayland";
}

function canExec(cmd: string): boolean {
  // Tool detection: `command -v` is the portable "which" check.
  try {
    execFileSync("/bin/sh", ["-c", `command -v ${cmd}`], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function isReadable(path: string): boolean {
  try {
    accessSync(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isWritable(path: string): boolean {
  try {
    accessSync(path, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Input mechanisms (keyboard + mouse)
// =============================================================================

function probeXtest(): MechanismInfo {
  if (!IS_LINUX) {
    return {
      name: "xtest", description: "X11 XTest extension (libXtst)",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: false, supportsOffScreen: true,
      reason: "not Linux",
    };
  }
  const available = hasDisplay();
  return {
    name: "xtest",
    description: "X11 XTest extension (libXtst) — synthetic events via X server",
    available,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    // XTest can target a Xvfb / Xephyr root without a real monitor.
    supportsOffScreen: true,
    reason: available ? undefined : "no $DISPLAY set",
  };
}

function probeUinput(): MechanismInfo {
  if (!IS_LINUX) {
    return {
      name: "uinput", description: "Linux uinput virtual input device",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: false, supportsOffScreen: true,
      reason: "not Linux",
    };
  }
  const devExists = existsSync("/dev/uinput");
  if (!devExists) {
    return {
      name: "uinput", description: "Linux uinput virtual input device",
      available: false, requiresElevatedPrivileges: true,
      requiresUserApproval: false, supportsOffScreen: true,
      reason: "/dev/uinput not present (kernel uinput module unloaded?)",
    };
  }
  const writable = isWritable("/dev/uinput");
  return {
    name: "uinput",
    description:
      "Linux uinput virtual input device — works under X11, Wayland, and headless sessions",
    available: writable,
    // Non-root access requires a udev rule (`KERNEL=="uinput", GROUP="input"`).
    requiresElevatedPrivileges: !writable,
    requiresUserApproval: false,
    supportsOffScreen: true,
    reason: writable ? undefined : "/dev/uinput not writable (need CAP_SYS_ADMIN or udev rule)",
  };
}

function probeXproto(): MechanismInfo {
  // Pure-TS X11 wire protocol via lib/x11proto (no libX11/libXtst
  // dependency).  Available whenever the $DISPLAY endpoint is reachable;
  // we reuse parseDisplay() so bracketed IPv6 / unix: prefixed / display.screen
  // forms are all handled identically to the real connect path.  TCP
  // endpoints can't be cheaply probed without opening a connection, so
  // we accept them at face value when $DISPLAY is set — the connect
  // attempt fails loudly later if the server isn't actually listening.
  if (!hasDisplay()) {
    return {
      name: "xproto",
      description: "Direct X11 wire protocol (lib/x11proto, no libX11/libXtst)",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: false, supportsOffScreen: true,
      reason: "no $DISPLAY set",
    };
  }
  const endpoint = parseDisplay(process.env.DISPLAY || "");
  let available = true;
  let reason: string | undefined;
  if (!endpoint) {
    available = false;
    reason = `invalid $DISPLAY: ${JSON.stringify(process.env.DISPLAY)}`;
  } else if (endpoint.kind === "unix" && !existsSync(endpoint.path)) {
    available = false;
    reason = `${endpoint.path} not present`;
  }
  return {
    name: "xproto",
    description: "Direct X11 wire protocol (lib/x11proto, no libX11/libXtst)",
    available,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: true,
    reason,
  };
}

function probeLibei(): MechanismInfo {
  if (!IS_LINUX) {
    return {
      name: "libei", description: "xdg-desktop-portal RemoteDesktop (libei)",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: true, supportsOffScreen: false,
      reason: "not Linux",
    };
  }
  // Proper libei detection needs a live D-Bus connection; the planned 6g
  // implementation will check `org.freedesktop.portal.RemoteDesktop`.
  return {
    name: "libei",
    description: "xdg-desktop-portal RemoteDesktop (libei) — Wayland-native input",
    available: false,   // planned; see PLAN.md §6g
    requiresElevatedPrivileges: false,
    requiresUserApproval: true,
    supportsOffScreen: false,
    reason: "libei portal backend not yet implemented (Phase 6g)",
  };
}

function probeSendInput(): MechanismInfo {
  return {
    name: "sendinput",
    description: "Win32 SendInput",
    available: IS_WIN,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: IS_WIN ? undefined : "not Windows",
  };
}

function probeCGEvent(): MechanismInfo {
  return {
    name: "cgevent",
    description: "macOS CGEvent (Quartz)",
    available: IS_MAC,
    requiresElevatedPrivileges: false,
    // macOS prompts for Accessibility/Input Monitoring on first use; we
    // don't categorise that as a "mechanism's own" prompt.
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: IS_MAC ? undefined : "not macOS",
  };
}

// =============================================================================
// Screen mechanisms
// =============================================================================

function probeXrandr(): MechanismInfo {
  if (!IS_LINUX) {
    return {
      name: "xrandr", description: "X11 XRandR + XGetImage",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: false, supportsOffScreen: true,
      reason: "not Linux",
    };
  }
  const available = hasDisplay();
  return {
    name: "xrandr",
    description: "X11 XRandR + XGetImage — classic X11 screen capture",
    available,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: true,
    reason: available ? undefined : "no $DISPLAY set",
  };
}

function probePortalPipewire(): MechanismInfo {
  if (!IS_LINUX) {
    return {
      name: "portal-pipewire", description: "xdg-desktop-portal ScreenCast (PipeWire)",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: true, supportsOffScreen: false,
      reason: "not Linux",
    };
  }
  // Probe: is there a session bus and a running portal?  A full detect
  // requires dbus-daemon introspection, but for a cheap probe we just
  // check the common environment indicators.
  const hasBus =
    !!process.env.DBUS_SESSION_BUS_ADDRESS || isReadable("/run/user/" + (process.getuid?.() ?? 0) + "/bus");
  const wayland = hasWayland();
  return {
    name: "portal-pipewire",
    description:
      "xdg-desktop-portal ScreenCast + PipeWire — Wayland-native screen capture",
    // Scaffolded but not yet functional (see PLAN.md §6f).
    available: false,
    requiresElevatedPrivileges: false,
    requiresUserApproval: true,
    supportsOffScreen: false,
    reason: hasBus && wayland
      ? "portal screen capture backend not yet implemented (Phase 6f)"
      : "no session bus / not a Wayland session",
  };
}

function probeDrm(): MechanismInfo {
  if (!IS_LINUX) {
    return {
      name: "drm", description: "DRM/KMS dumb-buffer scanout",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: false, supportsOffScreen: true,
      reason: "not Linux",
    };
  }
  const card = "/dev/dri/card0";
  const exists = existsSync(card);
  const readable = exists && isReadable(card);
  return {
    name: "drm",
    description: "DRM/KMS scanout via /dev/dri/card0 — no display server needed",
    available: readable,
    requiresElevatedPrivileges: exists && !readable,
    requiresUserApproval: false,
    supportsOffScreen: true,
    reason: !exists
      ? "/dev/dri/card0 not present"
      : readable ? undefined : "/dev/dri/card0 not readable (need `video` group)",
  };
}

function probeFramebuffer(): MechanismInfo {
  if (!IS_LINUX) {
    return {
      name: "framebuffer", description: "Legacy /dev/fb0 framebuffer",
      available: false, requiresElevatedPrivileges: false,
      requiresUserApproval: false, supportsOffScreen: false,
      reason: "not Linux",
    };
  }
  const exists = existsSync("/dev/fb0");
  const readable = exists && isReadable("/dev/fb0");
  return {
    name: "framebuffer",
    description: "Legacy /dev/fb0 framebuffer capture — mostly headless / TTY only",
    available: readable,
    requiresElevatedPrivileges: exists && !readable,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: !exists
      ? "/dev/fb0 not present (modern systems use DRM)"
      : readable ? undefined : "/dev/fb0 not readable (need `video` group)",
  };
}

function probeGdi(): MechanismInfo {
  return {
    name: "gdi",
    description: "Win32 GDI (GetDC + BitBlt + GetDIBits)",
    available: IS_WIN,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: IS_WIN ? undefined : "not Windows",
  };
}

function probeCoreGraphics(): MechanismInfo {
  return {
    name: "coregraphics",
    description: "macOS CoreGraphics CGWindowListCreateImage",
    available: IS_MAC,
    requiresElevatedPrivileges: false,
    // macOS does show a Screen Recording TCC prompt but it's a system-wide
    // per-binary grant, not a per-capture prompt — we don't classify it as
    // a mechanism-specific "requiresUserApproval".
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: IS_MAC ? undefined : "not macOS",
  };
}

// =============================================================================
// Clipboard mechanisms
// =============================================================================

/**
 * GNOME/Mutter does not implement the `wlr-data-control` Wayland
 * protocol that wl-clipboard relies on; `wl-copy` will run and even
 * exit 0 there, but the content never actually reaches any other
 * client's paste buffer.  GNOME-Wayland almost always has XWayland
 * running, so xclip/xsel (via `$DISPLAY`) work — we therefore mark
 * wl-clipboard as unavailable on GNOME so auto-selection falls
 * through to xclip/xsel transparently.  A user who knows their
 * setup can still force it via `MECHATRON_CLIPBOARD_MECHANISM`.
 */
function isGnome(): boolean {
  const xdg = (process.env.XDG_CURRENT_DESKTOP || "").toUpperCase();
  if (/\bGNOME\b/.test(xdg)) return true;
  if (process.env.GNOME_SHELL_SESSION_MODE) return true;
  if (process.env.GNOME_DESKTOP_SESSION_ID) return true;
  return false;
}

function probeWlClipboard(): MechanismInfo {
  const hasCopy = IS_LINUX && canExec("wl-copy");
  const hasPaste = IS_LINUX && canExec("wl-paste");
  const gnome = isGnome();
  const available = hasCopy && hasPaste && hasWayland() && !gnome;
  return {
    name: "wl-clipboard",
    description: "wl-clipboard (wl-copy/wl-paste) — Wayland clipboard bridge via wlr-data-control",
    available,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: !IS_LINUX ? "not Linux"
      : !hasCopy || !hasPaste ? "wl-copy / wl-paste not installed"
      : !hasWayland() ? "not a Wayland session"
      : gnome ? "GNOME/Mutter doesn't implement wlr-data-control (use xclip/xsel via XWayland)"
      : undefined,
  };
}

function probeXclip(): MechanismInfo {
  const has = IS_LINUX && canExec("xclip");
  const display = hasDisplay();
  return {
    name: "xclip",
    description: "xclip subprocess — classic X11 clipboard bridge",
    available: has && display,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: !IS_LINUX ? "not Linux"
      : !has ? "xclip not installed"
      : !display ? "no $DISPLAY set"
      : undefined,
  };
}

function probeXsel(): MechanismInfo {
  const has = IS_LINUX && canExec("xsel");
  const display = hasDisplay();
  return {
    name: "xsel",
    description: "xsel subprocess — classic X11 clipboard bridge",
    available: has && display,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: !IS_LINUX ? "not Linux"
      : !has ? "xsel not installed"
      : !display ? "no $DISPLAY set"
      : undefined,
  };
}

function probeWin32Clipboard(): MechanismInfo {
  return {
    name: "win32",
    description: "Win32 OpenClipboard/GetClipboardData",
    available: IS_WIN,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: IS_WIN ? undefined : "not Windows",
  };
}

function probeNSPasteboard(): MechanismInfo {
  return {
    name: "nspasteboard",
    description: "macOS NSPasteboard",
    available: IS_MAC,
    requiresElevatedPrivileges: false,
    requiresUserApproval: false,
    supportsOffScreen: false,
    reason: IS_MAC ? undefined : "not macOS",
  };
}

// =============================================================================
// Priority-ordered mechanism tables per capability
// =============================================================================

/**
 * Each capability has an ordered list of mechanism probe functions.  The
 * first mechanism reporting `available: true` wins under auto-detection.
 *
 * Entries for other platforms are included so `listMechanisms` is a
 * complete inventory rather than a platform-filtered view — callers
 * asking "what mechanisms exist for screen capture on Linux?" get a
 * useful answer even when this process happens to be running on macOS.
 */
export const CAPABILITY_MECHANISMS: Record<PlatformCapability, Array<() => MechanismInfo>> = {
  input: IS_LINUX
    ? [probeXtest, probeUinput, probeXproto, probeLibei]
    : IS_WIN ? [probeSendInput, probeXproto]
    : IS_MAC ? [probeCGEvent, probeXproto]
    : [probeXtest, probeUinput, probeXproto, probeLibei, probeSendInput, probeCGEvent],
  screen: IS_LINUX
    ? [probeXrandr, probePortalPipewire, probeDrm, probeFramebuffer]
    : IS_WIN ? [probeGdi]
    : IS_MAC ? [probeCoreGraphics]
    : [probeXrandr, probePortalPipewire, probeDrm, probeFramebuffer, probeGdi, probeCoreGraphics],
  clipboard: IS_LINUX
    ? [probeWlClipboard, probeXclip, probeXsel]
    : IS_WIN ? [probeWin32Clipboard]
    : IS_MAC ? [probeNSPasteboard]
    : [probeWlClipboard, probeXclip, probeXsel, probeWin32Clipboard, probeNSPasteboard],
};
