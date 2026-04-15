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
  type QueryExtensionReply, type XError,
} from "./request";

export type { ServerInfo, XError, QueryExtensionReply };

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
    if (!endpoint) throw new Error(`invalid or missing \$DISPLAY: ${JSON.stringify(displayStr)}`);
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
      this.dispatchPacket(Buffer.from(pkt));   // copy so downstream owns it
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
    this.socket.write(buf);
  }

  /** Probe for an extension by name. */
  async queryExtension(name: string): Promise<QueryExtensionReply> {
    const reply = await this.sendRequest(encodeQueryExtension(name));
    return parseQueryExtensionReply(reply);
  }

  close(): void { this.tearDown(new Error("X11 connection closed by client")); }
}
