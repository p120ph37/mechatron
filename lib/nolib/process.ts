/**
 * nolib process backend — pure TypeScript, no native libraries.
 *
 * Linux: /proc filesystem for enumeration/introspection,
 * process.kill() for signal delivery.
 * Other platforms: not available.
 */

import { promises as fsp } from "fs";

const IS_LINUX = process.platform === "linux";

async function procExists(pid: number): Promise<boolean> {
  try {
    await fsp.access(`/proc/${pid}`);
    return true;
  } catch {
    return false;
  }
}

async function procReadFile(pid: number, file: string): Promise<string> {
  try {
    return await fsp.readFile(`/proc/${pid}/${file}`, "utf8");
  } catch {
    return "";
  }
}

async function procGetName(pid: number): Promise<string> {
  const cmdline = await procReadFile(pid, "cmdline");
  if (cmdline) {
    const arg0 = cmdline.split("\0")[0] || "";
    const slash = arg0.lastIndexOf("/");
    return slash >= 0 ? arg0.substring(slash + 1) : arg0;
  }
  const status = await procReadFile(pid, "status");
  const m = status.match(/^Name:\s*(.+)$/m);
  return m ? m[1] : "";
}

async function procGetPath(pid: number): Promise<string> {
  try {
    return await fsp.readlink(`/proc/${pid}/exe`);
  } catch {
    return "";
  }
}

async function procIsDebugged(pid: number): Promise<boolean> {
  const status = await procReadFile(pid, "status");
  const m = status.match(/^TracerPid:\s*(\d+)$/m);
  return m ? parseInt(m[1], 10) !== 0 : false;
}

export async function process_open(pid: number): Promise<boolean> {
  return procExists(pid);
}

export async function process_close(_pid: number): Promise<void> {}

export async function process_isValid(pid: number): Promise<boolean> {
  return pid > 0 && await procExists(pid);
}

export async function process_is64Bit(_pid: number): Promise<boolean> {
  return process.arch === "x64" || process.arch === "arm64";
}

export async function process_isDebugged(pid: number): Promise<boolean> {
  return procIsDebugged(pid);
}

export async function process_getHandle(pid: number): Promise<number> {
  return pid;
}

export async function process_getName(pid: number): Promise<string> {
  return procGetName(pid);
}

export async function process_getPath(pid: number): Promise<string> {
  return procGetPath(pid);
}

export async function process_exit(pid: number): Promise<void> {
  if (pid <= 0) return;
  try { process.kill(pid, "SIGTERM"); } catch {}
}

export async function process_kill(pid: number): Promise<void> {
  if (pid <= 0) return;
  try { process.kill(pid, "SIGKILL"); } catch {}
}

export async function process_hasExited(pid: number): Promise<boolean> {
  return !(await procExists(pid));
}

export async function process_getCurrent(): Promise<number> {
  return process.pid;
}

export async function process_isSys64Bit(): Promise<boolean> {
  return process.arch === "x64" || process.arch === "arm64";
}

export async function process_getList(regex?: string): Promise<number[]> {
  const pattern = regex ? new RegExp(regex) : null;
  const pids: number[] = [];
  try {
    const entries = await fsp.readdir("/proc");
    for (const e of entries) {
      const pid = parseInt(e, 10);
      if (isNaN(pid) || pid <= 0) continue;
      if (pattern) {
        const name = await procGetName(pid);
        if (!pattern.test(name)) continue;
      }
      pids.push(pid);
    }
  } catch {}
  return pids;
}

export async function process_getModules(pid: number, regex?: string): Promise<Array<{
  valid: boolean; name: string; path: string; base: bigint; size: bigint; pid: number;
}>> {
  const maps = await procReadFile(pid, "maps");
  if (!maps) return [];
  const pattern = regex ? new RegExp(regex) : null;
  const modules = new Map<string, { base: bigint; end: bigint }>();
  for (const line of maps.split("\n")) {
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const path = parts.slice(5).join(" ");
    if (!path || path.startsWith("[")) continue;
    const [startHex, endHex] = parts[0].split("-");
    const start = BigInt("0x" + startHex);
    const end = BigInt("0x" + endHex);
    const existing = modules.get(path);
    if (existing) {
      if (start < existing.base) existing.base = start;
      if (end > existing.end) existing.end = end;
    } else {
      modules.set(path, { base: start, end });
    }
  }
  const result: Array<{
    valid: boolean; name: string; path: string; base: bigint; size: bigint; pid: number;
  }> = [];
  for (const [p, { base, end }] of modules) {
    const slash = p.lastIndexOf("/");
    const name = slash >= 0 ? p.substring(slash + 1) : p;
    if (pattern && !pattern.test(name)) continue;
    result.push({ valid: true, name, path: p, base, size: end - base, pid });
  }
  return result;
}

export async function process_getSegments(pid: number, base: bigint): Promise<Array<{
  valid: boolean; base: bigint; size: bigint; name: string;
}>> {
  const maps = await procReadFile(pid, "maps");
  if (!maps) return [];
  const entries: Array<{ start: bigint; end: bigint; perms: string; path: string }> = [];
  const modBases = new Map<string, bigint>();
  for (const line of maps.split("\n")) {
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const path = parts.slice(5).join(" ");
    if (!path || path.startsWith("[")) continue;
    const [startHex, endHex] = parts[0].split("-");
    const start = BigInt("0x" + startHex);
    const end = BigInt("0x" + endHex);
    entries.push({ start, end, perms: parts[1], path });
    const existing = modBases.get(path);
    if (existing === undefined || start < existing) modBases.set(path, start);
  }
  let modulePath: string | null = null;
  for (const [p, b] of modBases) {
    if (b === base) { modulePath = p; break; }
  }
  if (!modulePath) return [];
  const segments: Array<{ valid: boolean; base: bigint; size: bigint; name: string }> = [];
  for (const e of entries) {
    if (e.path !== modulePath) continue;
    segments.push({ valid: true, base: e.start, size: e.end - e.start, name: e.perms });
  }
  return segments;
}

if (!IS_LINUX) {
  throw new Error("nolib/process: requires Linux");
}
