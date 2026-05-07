/**
 * Subprocess-based ioctl bridge for the nolib backend.
 *
 * Provides ioctl access via perl, miniperl, or python — whichever is
 * available.  The mechanism opens a device file, executes a series of
 * ioctl calls (number + binary data), and optionally pipes stdin to
 * the device fd as a raw byte stream.
 */

import { spawnSync, spawn, type ChildProcess } from "child_process";

// ─── Interpreter probe ──────────────────────────────────────────────

type Interpreter = "perl" | "miniperl" | "python3" | "python";

let _probed: Interpreter | null | undefined;

// The interpreter probe stays synchronous: it is a one-time `--version`
// check that callers (notably `nolibUinputAvailable()` in uinput.ts) need
// to invoke at module load time to gate per-platform top-level throws in
// mouse-vt.ts / keyboard-vt.ts.  The actual ioctl work is async.
function probeInterpreter(): Interpreter | null {
  if (_probed !== undefined) return _probed;
  for (const cmd of ["perl", "miniperl", "python3", "python"] as const) {
    try {
      const r = spawnSync(cmd, ["--version"], { timeout: 2000, stdio: "ignore" });
      if (r.status === 0 || r.status === null) {
        _probed = cmd as Interpreter;
        return _probed;
      }
    } catch {}
  }
  _probed = null;
  return null;
}

/** Check whether the ioctl bridge has an available interpreter. */
export function ioctlBridgeAvailable(): boolean {
  return probeInterpreter() !== null;
}

// ─── Interpreter scripts ────────────────────────────────────────────

// Run setup ioctls, emit post-ioctl buffer as a hex line per call
// (`syswrite` bypasses PerlIO so data hits the pipe immediately), then
// tail stdin to the device fd.  `ioctlSync` closes stdin so the tail
// loop exits; `ioctlStream` keeps it open and discards stdout.
const PERL_SCRIPT =
  'open$f,"+<",shift or die$!;while(@ARGV){ioctl$f,shift,$_=pack"H*",shift or die$!;syswrite STDOUT,unpack("H*",$_)."\n" or die$!}syswrite$f,$_ or die$! while sysread STDIN,$_,1024';

const PYTHON_SCRIPT = [
  "import sys,os,fcntl",
  "f=open(sys.argv[1],'r+b',buffering=0)",
  "a=sys.argv[2:]",
  "while a:",
  " n=int(a.pop(0));d=bytearray.fromhex(a.pop(0));fcntl.ioctl(f,n,d);sys.stdout.buffer.write((d.hex()+'\\n').encode());sys.stdout.buffer.flush()",
  "while True:",
  " c=sys.stdin.buffer.read(1024)",
  " if not c:break",
  " os.write(f.fileno(),c)",
].join("\n");

function buildArgs(interp: Interpreter, device: string, ioctls: IoctlCall[]): string[] {
  const script = interp === "python3" || interp === "python" ? PYTHON_SCRIPT : PERL_SCRIPT;
  const args = ["-e", script, device];
  for (const call of ioctls) {
    args.push(String(call.request >>> 0));
    args.push(Buffer.from(call.data).toString("hex"));
  }
  return args;
}

// ─── Public API ─────────────────────────────────────────────────────

export interface IoctlCall {
  request: number;
  data: Buffer | Uint8Array;
}

export interface IoctlResult {
  outputs: Buffer[];
}

/**
 * Execute ioctls asynchronously (one-shot).  Opens the device, runs all
 * ioctl calls, then exits.  No stdin is piped.
 *
 * Returns the post-ioctl buffer contents (the kernel may have modified
 * them in place for _IOR / _IOWR requests).
 *
 * Naming retained for backward compatibility — the function is now async.
 */
export async function ioctlSync(device: string, ioctls: IoctlCall[]): Promise<IoctlResult | null> {
  const interp = probeInterpreter();
  if (!interp) return null;
  const args = buildArgs(interp, device, ioctls);
  return await new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(interp, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolve(null);
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutLen = 0;
    let settled = false;
    const settle = (result: IoctlResult | null) => {
      if (settled) return;
      settled = true;
      try { clearTimeout(timer); } catch {}
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      settle(null);
    }, 5000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      stdoutLen += chunk.length;
    });
    child.stderr?.on("data", () => { /* discard */ });
    child.on("error", () => settle(null));
    child.on("close", (code) => {
      if (code !== 0) {
        settle(null);
        return;
      }
      const stdout = Buffer.concat(stdoutChunks, stdoutLen).toString("utf8");
      const lines = stdout.split("\n").filter(Boolean);
      const outputs = lines.map(hex => Buffer.from(hex, "hex"));
      settle({ outputs });
    });

    if (child.stdin) {
      child.stdin.on("error", () => { /* ignore EPIPE */ });
      try { child.stdin.end(""); } catch {}
    }
  });
}

/**
 * Open an ioctl-enabled writable stream.  The child process runs setup
 * ioctls asynchronously, then enters a stdin read loop.  Any bytes
 * written to the returned stream before setup completes are held in the
 * kernel pipe buffer and processed in order once the child reaches its
 * read loop.  If setup fails, the child exits, `alive` flips to false,
 * and subsequent writes become no-ops.
 */
export interface IoctlStream {
  write(data: Buffer | Uint8Array): boolean;
  close(): void;
  alive: boolean;
}

export async function ioctlStream(device: string, ioctls: IoctlCall[]): Promise<IoctlStream | null> {
  const interp = probeInterpreter();
  if (!interp) return null;
  const args = buildArgs(interp, device, ioctls);
  let child: ChildProcess;
  try {
    child = spawn(interp, args, { stdio: ["pipe", "ignore", "ignore"] });
  } catch {
    return null;
  }

  let alive = true;
  child.on("exit", () => { alive = false; });
  child.stdin!.on("error", () => { alive = false; });

  return {
    get alive() { return alive; },
    write(data: Buffer | Uint8Array): boolean {
      if (!alive) return false;
      try {
        return child.stdin!.write(data);
      } catch {
        alive = false;
        return false;
      }
    },
    close() {
      if (!alive) return;
      try { child.stdin!.end(); } catch {}
      try { child.kill(); } catch {}
      alive = false;
    },
  };
}
