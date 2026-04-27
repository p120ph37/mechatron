/**
 * Helper to install/enable the Mechatron GNOME Shell extension.
 *
 * The extension lives in extensions/gnome-wm/ in the mechatron package.
 * Installation copies it to ~/.local/share/gnome-shell/extensions/ and
 * enables it via gnome-extensions CLI. A shell restart (Alt+F2 → "r" on
 * X11, or log out/in on Wayland) is required after first install.
 */

import { existsSync, mkdirSync, cpSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";

const EXT_UUID = "mechatron-wm@mechatronic.dev";

function getExtSourceDir(): string {
  return join(dirname(dirname(__dirname)), "extensions", "gnome-wm");
}

function getExtTargetDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return join(home, ".local", "share", "gnome-shell", "extensions", EXT_UUID);
}

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
  error?: string;
}

export function installExtension(): InstallResult {
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
  return { installed: true, enabled, needsRestart };
}
