/**
 * Helper to install/enable the Mechatron GNOME Shell extension and
 * manage bearer tokens for D-Bus authorization.
 *
 * The extension lives in extensions/gnome-wm/ in the mechatron package.
 * Installation copies it to ~/.local/share/gnome-shell/extensions/ and
 * enables it via gnome-extensions CLI. A shell restart (Alt+F2 → "r" on
 * X11, or log out/in on Wayland) is required after first install.
 *
 * Token management:
 *   - Tokens are UUIDs stored one-per-line in /etc/mechatron-wm/tokens
 *   - The extension validates every D-Bus call (except Ping) against this file
 *   - provisionToken() generates a UUID, appends it, and returns it
 *   - Writing to /etc requires appropriate permissions (root or group write)
 */

import { existsSync, mkdirSync, cpSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { execSync } from "child_process";
import { join, dirname } from "path";

const EXT_UUID = "mechatron-wm@mechatronic.dev";

export const TOKENS_FILE = "/etc/mechatron-wm/tokens";

function getExtSourceDir(): string {
  return join(dirname(dirname(__dirname)), "extensions", "gnome-wm");
}

function getExtTargetDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return join(home, ".local", "share", "gnome-shell", "extensions", EXT_UUID);
}

// ── Extension lifecycle ─────────────────────────────────────────────

export function isExtensionInstalled(): boolean {
  return existsSync(join(getExtTargetDir(), "metadata.json"));
}

export function isExtensionEnabled(): boolean {
  try {
    const out = execSync("gnome-extensions list --enabled", { encoding: "utf8", timeout: 5000 });
    return out.split("\n").some(line => line.trim() === EXT_UUID);
  } catch {
    return false;
  }
}

export interface InstallResult {
  installed: boolean;
  enabled: boolean;
  needsRestart: boolean;
  token?: string;
  error?: string;
}

export function installExtension(opts?: { provisionToken?: boolean }): InstallResult {
  const src = getExtSourceDir();
  if (!existsSync(join(src, "metadata.json"))) {
    return { installed: false, enabled: false, needsRestart: false, error: "Extension source not found" };
  }

  const target = getExtTargetDir();
  const wasInstalled = existsSync(join(target, "metadata.json"));

  try {
    mkdirSync(target, { recursive: true });
    cpSync(src, target, { recursive: true });
  } catch (e: any) {
    return { installed: false, enabled: false, needsRestart: false, error: `Copy failed: ${e.message}` };
  }

  let enabled = false;
  try {
    execSync(`gnome-extensions enable ${EXT_UUID}`, { encoding: "utf8", timeout: 5000 });
    enabled = true;
  } catch {
    enabled = isExtensionEnabled();
  }

  const needsRestart = !wasInstalled;
  const result: InstallResult = { installed: true, enabled, needsRestart };

  if (opts?.provisionToken !== false) {
    try {
      result.token = provisionToken();
    } catch (e: any) {
      result.error = `Extension installed but token provisioning failed: ${e.message}`;
    }
  }

  return result;
}

// ── Token management ────────────────────────────────────────────────

function uuidv4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function generateToken(): string {
  return uuidv4();
}

export function getInstalledTokens(): string[] {
  try {
    const text = readFileSync(TOKENS_FILE, "utf8");
    return text.split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));
  } catch {
    return [];
  }
}

export function installToken(token: string): void {
  const dir = dirname(TOKENS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
  if (!existsSync(TOKENS_FILE)) {
    writeFileSync(TOKENS_FILE, "# Mechatron WM extension — authorized app tokens (one UUID per line)\n", { mode: 0o600 });
  }
  appendFileSync(TOKENS_FILE, token + "\n");
}

export function revokeToken(token: string): boolean {
  try {
    const text = readFileSync(TOKENS_FILE, "utf8");
    const lines = text.split("\n");
    const filtered = lines.filter(line => line.trim() !== token);
    if (filtered.length === lines.length) return false;
    writeFileSync(TOKENS_FILE, filtered.join("\n"));
    return true;
  } catch {
    return false;
  }
}

export function provisionToken(): string {
  const token = generateToken();
  installToken(token);
  return token;
}
