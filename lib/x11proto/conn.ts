/**
 * X11 wire-protocol client — socket lifecycle, handshake, and
 * request/reply dispatch.
 *
 * Kept separate from `lib/x11proto/wire.ts` (pure encoders) and
 * `lib/x11proto/request.ts` (pure request/reply codecs) so the byte
 * layer stays unit-testable without opening a socket.  This module is
 * the only one that depends on `node:net`.
 *
 * Sequence-number model: every X request (after the connection setup,
 * which is sequence 0) advances an implicit 16-bit counter starting at
 * 1 on the wire.  The server stamps every reply / error with that
 * counter.  Requests that expect a reply register a pending promise
 * keyed by their sequence; errors resolve the promise with a rejection
 * so the caller sees the server-side reason string.
 *
 * Events (bytes starting with code 2..34) aren't consumed by this
 * module — mechatron doesn't need asynchronous input notification from
 * the server; all we do is send synthesised input *to* it.  The reader
 * just drops events on the floor.
 */

import * as net from "net";
import {
  parseDisplay, loadXauthority, findXauthCookie,
  encodeConnectionSetup, parseConnectionSetupReply, connReplyTotalLength,
  type DisplayEndpoint, type ServerInfo,
} from "./wire";
import {
  parseError, packetTotalLength,
  encodeQueryExtension, parseQueryExtensionReply,
  encodeXTestFakeInput, encodeWarpPointer,
  encodeGetImage, parseGetImageReply, type GetImageReply,
  encodeRRQueryVersion, parseRRQueryVersionReply,
  encodeRRGetMonitors, parseRRGetMonitorsReply,
  type RRQueryVersionReply, type RRGetMonitorsReply, type MonitorInfo,
  XTEST_TYPE_KEY_PRESS, XTEST_TYPE_KEY_RELEASE,
  XTEST_TYPE_BUTTON_PRESS, XTEST_TYPE_BUTTON_RELEASE,
  XTEST_TYPE_MOTION_NOTIFY,
  type QueryExtensionReply, type XError,
} from "./request";

export type { ServerInfo, XError, QueryExtensionReply, GetImageReply,
  RRQueryVersionReply, RRGetMonitorsReply, MonitorInfo };

export class XProtoError extends Error {
  public readonly code: number;
  public readonly majorOpcode: number;
  public readonly minorOpcode: number;
  public readonly badValue: number;
  public readonly sequence: number;
  constructor(err: XError) {
    super(`X11 error ${err.code} (major=${err.majorOpcode}, minor=${err.minorOpcode}, seq=${err.sequence}, bad=${err.badValue})`);
    this.code = err.code;
    this.majorOpcode = err.majorOpcode;
    this.minorOpcode = err.minorOpcode;
    this.badValue = err.badValue;
    this.sequence = err.sequence;
  }
}

interface PendingReply {
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
}

export interface ConnectOptions {
  display?: string;
  xauthority?: string;
  connectTimeoutMs?: number;
}

export class XConnection {
  public info!: ServerInfo;
  public endpoint!: DisplayEndpoint;
  private socket!: net.Socket;
  private nextSequence = 1;   // conn-setup is seq 0; first request is seq 1
  private pending = new Map<number, PendingReply>();
  private rxBuf: Buffer = Buffer.alloc(0);
  private closed = false;
  private closeReason: Error | null = null;

  /**
   * Open a socket, send the connection setup, parse the reply, and
   * return a ready-to-use connection.  Throws on any failure — there's
   * no "partial" state to fall back to, and the mechanism probe in
   * `lib/platform/mechanisms.ts` is the right place to decide whether
   * to even attempt a connect.
   */
  static async connect(opts: ConnectOptions = {}): Promise<XConnection> {
    const displayStr = opts.display ?? process.env.DISPLAY ?? "";
    const endpoint = parseDisplay(displayStr);
    if (!endpoint) throw new Error(`invalid or missing $DISPLAY: ${JSON.stringify(displayStr)}`);
    const env = opts.xauthority ? { ...process.env, XAUTHORITY: opts.xauthority } : process.env;
    const cookie = findXauthCookie(loadXauthority(env), endpoint);

    const conn = new XConnection();
    conn.endpoint = endpoint;
    await conn.openSocket(opts.connectTimeoutMs ?? 5000);
    await conn.handshake(cookie?.name ?? "", cookie?.data ?? Buffer.alloc(0));
    return conn;
  }

  private openSocket(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ep = this.endpoint;
      const opts: net.NetConnectOpts =
        ep.kind === "unix"    ? { path: ep.path } :
        ep.kind === "tcp"     ? { host: ep.host, port: ep.port } :
        /* abstract */          { path: "\0" + ep.name };
      this.socket = net.createConnection(opts);
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Error("X11 connect timeout"));
      }, timeoutMs);
      this.socket.once("connect", () => { clearTimeout(timer); resolve(); });
      this.socket.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
  }

  private handshake(authName: string, authData: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      let total = -1;
      let acc = Buffer.alloc(0);
      const onData = (chunk: Buffer) => {
        acc = Buffer.concat([acc, chunk]);
        if (total < 0 && acc.length >= 8) {
          try { total = connReplyTotalLength(acc); }
          catch (e) { cleanup(); reject(e as Error); return; }
        }
        if (total > 0 && acc.length >= total) {
          this.socket.removeListener("data", onData);
          this.socket.removeListener("error", onErr);
          const reply = parseConnectionSetupReply(acc.subarray(0, total));
          if (reply.kind === "failed") {
            this.socket.destroy();
            reject(new Error(`X11 handshake failed: ${reply.reason}`));
            return;
          }
          if (reply.kind === "authenticate") {
            this.socket.destroy();
            reject(new Error(`X11 authenticate exchange not supported: ${reply.reason}`));
            return;
          }
          this.info = reply.info;
          // Leftover bytes beyond the handshake reply (unlikely, but the
          // server could batch an error for an as-yet-unsent request — no).
          const leftover = acc.subarray(total);
          if (leftover.length) this.rxBuf = leftover;
          this.installReaderLoop();
          resolve();
        }
      };
      const onErr = (e: Error) => { cleanup(); reject(e); };
      const cleanup = () => {
        this.socket.removeListener("data", onData);
        this.socket.removeListener("error", onErr);
      };
      this.socket.on("data", onData);
      this.socket.on("error", onErr);
      this.socket.write(encodeConnectionSetup(authName, authData));
    });
  }

  private installReaderLoop(): void {
    this.socket.on("data", (chunk: Buffer) => {
      this.rxBuf = this.rxBuf.length === 0 ? chunk : Buffer.concat([this.rxBuf, chunk]);
      this.drainRxBuf();
    });
    this.socket.on("error", (e) => this.tearDown(e));
    this.socket.on("close", () => this.tearDown(new Error("X11 connection closed")));
  }

  private drainRxBuf(): void {
    while (this.rxBuf.length >= 8) {
      let total: number;
      try { total = packetTotalLength(this.rxBuf); }
      catch { return; }
      if (this.rxBuf.length < total) return;
      const pkt = this.rxBuf.subarray(0, total);
      this.rxBuf = this.rxBuf.subarray(total);
      // `pkt` and the new `rxBuf` are disjoint views over the same
      // ArrayBuffer; future TCP chunks either replace rxBuf (when it
      // drains empty) or concat to it, so we never write back into
      // `pkt`'s range.  No defensive copy needed.
      this.dispatchPacket(pkt);
    }
  }

  private dispatchPacket(pkt: Buffer): void {
    const kind = pkt.readUInt8(0);
    if (kind === 1) {
      const seq = pkt.readUInt16LE(2);
      const pend = this.pending.get(seq);
      if (pend) { this.pending.delete(seq); pend.resolve(pkt); }
      // If no pending entry, the reply is for a request issued with
      // fire-and-forget semantics (e.g. warp/fake-input).  The server
      // never generates spontaneous replies, so it must be a late reply
      // to a dropped request; discarding it is safe.
      return;
    }
    if (kind === 0) {
      const err = parseError(pkt);
      const pend = this.pending.get(err.sequence);
      if (pend) { this.pending.delete(err.sequence); pend.reject(new XProtoError(err)); }
      // Unmatched errors (fire-and-forget requests that the server
      // rejected) surface as connection tear-down so callers don't
      // silently send garbage into a broken session.
      else { this.tearDown(new XProtoError(err)); }
      return;
    }
    // Events (kind 2..34) are not observed.
  }

  private tearDown(err: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.closeReason = err;
    for (const pend of this.pending.values()) pend.reject(err);
    this.pending.clear();
    try { this.socket.destroy(); } catch { /* ignore */ }
  }

  /**
   * Send a raw request buffer and wait for its reply.  The caller is
   * responsible for constructing the request (via `request.ts`
   * encoders); this method handles sequencing and reply correlation.
   */
  sendRequest(buf: Buffer): Promise<Buffer> {
    if (this.closed) return Promise.reject(this.closeReason || new Error("X11 connection closed"));
    const seq = this.nextSequence;
    this.nextSequence = (this.nextSequence + 1) & 0xFFFF;
    return new Promise((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      try { this.socket.write(buf); }
      catch (e) {
        this.pending.delete(seq);
        reject(e as Error);
      }
    });
  }

  /** Fire-and-forget variant: the server won't reply, and any error
   *  will tear the connection down instead of surfacing here. */
  sendRequestNoReply(buf: Buffer): void {
    if (this.closed) throw this.closeReason || new Error("X11 connection closed");
    this.nextSequence = (this.nextSequence + 1) & 0xFFFF;
    // A failed write means the connection is dead — tear down rather than
    // leave future reply-correlation off-by-one vs the server's view of
    // the sequence counter.
    try { this.socket.write(buf); }
    catch (e) { this.tearDown(e as Error); throw e; }
  }

  /** Probe for an extension by name. */
  async queryExtension(name: string): Promise<QueryExtensionReply> {
    const reply = await this.sendRequest(encodeQueryExtension(name));
    return parseQueryExtensionReply(reply);
  }

  // ── Extension probe cache ────────────────────────────────────────────────
  // Every X extension request needs the server-assigned major opcode.  We
  // cache the probe as a Promise: resolved → major opcode; rejected →
  // extension not present (subsequent callers see the same rejection).
  // Optional postNegotiate runs once after QueryExtension succeeds (RANDR
  // uses this for RRQueryVersion; some servers require it before
  // subsequent RANDR calls).
  private extProbes: Map<string, Promise<number>> = new Map();

  private ensureExtension(name: string, postNegotiate?: (major: number) => Promise<void>): Promise<number> {
    const cached = this.extProbes.get(name);
    if (cached) return cached;
    const probe = (async () => {
      const r = await this.queryExtension(name);
      if (!r.present) throw new Error(`${name} extension not present on server`);
      if (postNegotiate) await postNegotiate(r.majorOpcode);
      return r.majorOpcode;
    })();
    this.extProbes.set(name, probe);
    return probe;
  }

  // ── XTEST FakeInput ──────────────────────────────────────────────────────
  // Fire-and-forget: the server doesn't reply to FakeInput, and a malformed
  // request surfaces as a connection tearDown via the unmatched-error path.

  private async sendFakeInput(type: number, detail: number, delayMs: number,
                              rootX = 0, rootY = 0, root = 0): Promise<void> {
    const major = await this.ensureExtension("XTEST");
    this.sendRequestNoReply(encodeXTestFakeInput(major, {
      type, detail, delayMs, rootX, rootY, root,
    }));
  }

  /** Synthesise a key press (down). `keycode` is the X11 keycode (8..255). */
  fakeKeyPress(keycode: number, delayMs = 0): Promise<void> {
    return this.sendFakeInput(XTEST_TYPE_KEY_PRESS, keycode, delayMs);
  }

  /** Synthesise a key release (up). */
  fakeKeyRelease(keycode: number, delayMs = 0): Promise<void> {
    return this.sendFakeInput(XTEST_TYPE_KEY_RELEASE, keycode, delayMs);
  }

  /** Synthesise a pointer button press (1=left, 2=middle, 3=right, 4-7=wheel). */
  fakeButtonPress(button: number, delayMs = 0): Promise<void> {
    return this.sendFakeInput(XTEST_TYPE_BUTTON_PRESS, button, delayMs);
  }

  /** Synthesise a pointer button release. */
  fakeButtonRelease(button: number, delayMs = 0): Promise<void> {
    return this.sendFakeInput(XTEST_TYPE_BUTTON_RELEASE, button, delayMs);
  }

  /** Synthesise pointer motion (absolute by default; pass relative=true for delta). */
  fakeMotion(x: number, y: number, opts: { relative?: boolean; root?: number; delayMs?: number } = {}): Promise<void> {
    return this.sendFakeInput(XTEST_TYPE_MOTION_NOTIFY, opts.relative ? 1 : 0,
                              opts.delayMs ?? 0, x, y, opts.root ?? 0);
  }

  /**
   * Warp the pointer to absolute (x, y) on the given root window.
   * If `root` is omitted, uses the first screen's root window from the
   * connection-setup info.  Fire-and-forget.
   */
  warpPointer(x: number, y: number, root?: number): void {
    const dst = root ?? this.info.screens[0]?.root ?? 0;
    this.sendRequestNoReply(encodeWarpPointer({
      srcWindow: 0, dstWindow: dst, dstX: x, dstY: y,
    }));
  }

  /**
   * Capture a rectangle of pixels from a drawable.  For screen capture
   * pass the screen's root window id.  Defaults to ZPixmap format
   * (one row of bytes per row of pixels, padded to a 4-byte boundary).
   */
  async getImage(args: {
    drawable?: number;   // default root of screen 0
    x: number;
    y: number;
    width: number;
    height: number;
    format?: number;
    planeMask?: number;
  }): Promise<GetImageReply> {
    const drawable = args.drawable ?? this.info.screens[0]?.root ?? 0;
    const reply = await this.sendRequest(encodeGetImage({
      drawable, x: args.x, y: args.y, width: args.width, height: args.height,
      format: args.format, planeMask: args.planeMask,
    }));
    return parseGetImageReply(reply);
  }

  /** Enumerate connected monitors via RANDR 1.5 RRGetMonitors. */
  async getMonitors(opts: { window?: number; activeOnly?: boolean } = {}): Promise<RRGetMonitorsReply> {
    // RANDR needs RRQueryVersion negotiation after QueryExtension — some
    // servers refuse subsequent RANDR calls with BadAccess otherwise.
    const major = await this.ensureExtension("RANDR", async (m) => {
      parseRRQueryVersionReply(await this.sendRequest(encodeRRQueryVersion(m)));
    });
    const window = opts.window ?? this.info.screens[0]?.root ?? 0;
    const reply = await this.sendRequest(encodeRRGetMonitors(major, window, opts.activeOnly ?? true));
    return parseRRGetMonitorsReply(reply);
  }

  close(): void { this.tearDown(new Error("X11 connection closed by client")); }
}
