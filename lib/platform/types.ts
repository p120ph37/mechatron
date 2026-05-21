/**
 * Platform mechanism introspection types — see docs in `./index.ts` for
 * the public entry point.
 */

/**
 * Logical subsystem that can be backed by more than one implementation
 * mechanism.  Mirrors the existing subsystem naming but is scoped to the
 * Platform module so TypeScript compilation doesn't create a cycle with
 * `lib/napi.ts`'s `Subsystem` type.
 */
export type PlatformCapability = "input" | "screen" | "clipboard";

export interface MechanismInfo {
  /** Short machine-readable name, e.g. "xtest", "uinput", "wl-clipboard". */
  name: string;
  /** Human-readable one-line description. */
  description: string;
  /** Whether this mechanism is usable in the current environment. */
  available: boolean;
  /** Does the process need root / `CAP_SYS_ADMIN` / udev rules? */
  requiresElevatedPrivileges: boolean;
  /** Will the user be prompted interactively (e.g. xdg-desktop-portal)? */
  requiresUserApproval: boolean;
  /**
   * Can this mechanism see pixels / synthesise input to off-screen virtual
   * displays (X virtual roots, KMS scanouts without a monitor, etc.)?
   */
  supportsOffScreen: boolean;
  /** If `available=false`, a short reason suitable for error messages. */
  reason?: string;
}

export interface CapabilitySummary {
  /** The mechanism currently in use (possibly auto-selected). */
  active: string | null;
  /** All mechanisms we know how to probe for, in priority order. */
  mechanisms: MechanismInfo[];
  /** Whether the active mechanism requires elevated privileges. */
  requiresElevatedPrivileges: boolean;
  /** Whether the active mechanism will trigger a runtime permission prompt. */
  requiresUserApproval: boolean;
  /** Whether the active mechanism can capture off-screen / virtual displays. */
  supportsOffScreen: boolean;
}
