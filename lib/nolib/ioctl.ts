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
 * Execute ioctls synchronously (one-shot).  Opens the device, runs all
 * ioctl calls, then exits.  No stdin is piped.
 *
 * Returns the post-ioctl buffer contents (the kernel may have modified
 * them in place for _IOR / _IOWR requests).
 */
export function ioctlSync(device: string, ioctls: IoctlCall[]): IoctlResult | null {
  const interp = probeInterpreter();
  if (!interp) return null;
  const args = buildArgs(interp, device, ioctls);
  const r = spawnSync(interp, args, {
    timeout: 5000,
    stdio: ["pipe", "pipe", "pipe"],
    input: "",
  });
  if (r.status !== 0) return null;
  const stdout = r.stdout?.toString("utf8") || "";
  const lines = stdout.split("\n").filter(Boolean);
  const outputs = lines.map(hex => Buffer.from(hex, "hex"));
  return { outputs };
}

/**
 * Open an ioctl-enabled writable stream.  Runs the setup ioctls, then
 * returns a handle that pipes writes to the device fd.
 *
 * The returned object exposes:
 *   - `outputs`: the post-ioctl buffer contents from setup
 *   - `write(data)`: send raw bytes to the device fd (via child stdin)
 *   - `close()`: tear down the child process (closes the device fd)
 *   - `alive`: whether the child is still running
 */
export interface IoctlStream {
  outputs: Buffer[];
  write(data: Buffer | Uint8Array): boolean;
  close(): void;
  alive: boolean;
}

export function ioctlStream(device: string, ioctls: IoctlCall[]): IoctlStream | null {
  const interp = probeInterpreter();
  if (!interp) return null;
  const args = buildArgs(interp, device, ioctls);
  let child: ChildProcess;
  try {
    child = spawn(interp, args, { stdio: ["pipe", "pipe", "ignore"] });
  } catch {
    return null;
  }

  let alive = true;
  child.on("exit", () => { alive = false; });

  // Read setup ioctl results from stdout synchronously.
  // The child writes one hex line per ioctl, then blocks on stdin.
  const outputBufs: Buffer[] = [];
  const expected = ioctls.length;
  let stdoutBuf = "";

  const stdout = child.stdout!;
  stdout.setEncoding("utf8");

  // Collect initial ioctl output lines.  Since the child flushes after
  // each line and then blocks on sysread(STDIN), all lines arrive before
  // we write anything.  Use a synchronous spin for simplicity (the setup
  // phase is <1ms on real hardware).
  const deadline = Date.now() + 5000;
  while (outputBufs.length < expected && alive && Date.now() < deadline) {
    const chunk = stdout.read();
    if (chunk) {
      stdoutBuf += chunk;
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        outputBufs.push(Buffer.from(stdoutBuf.slice(0, nl), "hex"));
        stdoutBuf = stdoutBuf.slice(nl + 1);
      }
    }
  }

  if (!alive || outputBufs.length < expected) {
    try { child.kill(); } catch {}
    return null;
  }

  return {
    outputs: outputBufs,
    get alive() { return alive; },
    write(data: Buffer | Uint8Array): boolean {
      if (!alive) return false;
      return child.stdin!.write(data);
    },
    close() {
      if (!alive) return;
      try { child.stdin!.end(); } catch {}
      try { child.kill(); } catch {}
      alive = false;
    },
  };
}
