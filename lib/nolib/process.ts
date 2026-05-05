/**
 * nolib process backend — pure TypeScript, no native libraries.
 *
 * Linux: /proc filesystem for enumeration/introspection,
 * process.kill() for signal delivery.
 * Other platforms: not available.
 */

import { readdirSync, readFileSync, readlinkSync, existsSync } from "fs";

const IS_LINUX = process.platform === "linux";

function procExists(pid: number): boolean {
  return existsSync(`/proc/${pid}`);
}

function procReadFile(pid: number, file: string): string {
  try {
    return readFileSync(`/proc/${pid}/${file}`, "utf8");
  } catch {
    return "";
  }
}

function procGetName(pid: number): string {
  const cmdline = procReadFile(pid, "cmdline");
  if (cmdline) {
    const arg0 = cmdline.split("\0")[0] || "";
    const slash = arg0.lastIndexOf("/");
    return slash >= 0 ? arg0.substring(slash + 1) : arg0;
  }
  const status = procReadFile(pid, "status");
  const m = status.match(/^Name:\s*(.+)$/m);
  return m ? m[1] : "";
}

function procGetPath(pid: number): string {
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return "";
  }
}

function procIsDebugged(pid: number): boolean {
  const status = procReadFile(pid, "status");
  const m = status.match(/^TracerPid:\s*(\d+)$/m);
  return m ? parseInt(m[1], 10) !== 0 : false;
}

export function process_open(pid: number): boolean {
  return procExists(pid);
}

export function process_close(_pid: number): void {}

export function process_isValid(pid: number): boolean {
  return pid > 0 && procExists(pid);
}

export function process_is64Bit(_pid: number): boolean {
  return process.arch === "x64" || process.arch === "arm64";
}

export function process_isDebugged(pid: number): boolean {
  return procIsDebugged(pid);
}

export function process_getHandle(pid: number): number {
  return pid;
}

export function process_getName(pid: number): string {
  return procGetName(pid);
}

export function process_getPath(pid: number): string {
  return procGetPath(pid);
}

export function process_exit(pid: number): void {
  if (pid <= 0) return;
  try { process.kill(pid, "SIGTERM"); } catch {}
}

export function process_kill(pid: number): void {
  if (pid <= 0) return;
  try { process.kill(pid, "SIGKILL"); } catch {}
}

export function process_hasExited(pid: number): boolean {
  return !procExists(pid);
}

export function process_getCurrent(): number {
  return process.pid;
}

export function process_isSys64Bit(): boolean {
  return process.arch === "x64" || process.arch === "arm64";
}

export function process_getList(regex?: string): number[] {
  const pattern = regex ? new RegExp(regex) : null;
  const pids: number[] = [];
  try {
    const entries = readdirSync("/proc");
    for (const e of entries) {
      const pid = parseInt(e, 10);
      if (isNaN(pid) || pid <= 0) continue;
      if (pattern) {
        const name = procGetName(pid);
        if (!pattern.test(name)) continue;
      }
      pids.push(pid);
    }
  } catch {}
  return pids;
}

export function process_getModules(_pid: number, _regex?: string): Array<{
  valid: boolean; name: string; path: string; base: number; size: number; pid: number;
}> {
  // /proc/pid/maps parsing for module info
  // This gives us loaded shared libraries with addresses
  return [];
}

export function process_getSegments(_pid: number, _base: number): Array<{
  valid: boolean; base: number; size: number; name: string;
}> {
  return [];
}

if (!IS_LINUX) {
  throw new Error("nolib/process: requires Linux");
}
