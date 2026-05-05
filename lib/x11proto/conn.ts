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
  encodeGetKeyboardMapping, parseGetKeyboardMappingReply,
  type GetKeyboardMappingReply,
  encodeRRQueryVersion, parseRRQueryVersionReply,
  encodeRRGetMonitors, parseRRGetMonitorsReply,
  type RRQueryVersionReply, type RRGetMonitorsReply, type MonitorInfo,
  XTEST_TYPE_KEY_PRESS, XTEST_TYPE_KEY_RELEASE,
  XTEST_TYPE_BUTTON_PRESS, XTEST_TYPE_BUTTON_RELEASE,
  XTEST_TYPE_MOTION_NOTIFY,
  type QueryExtensionReply, type XError,
  // New opcodes
  encodeGetWindowAttributes, parseGetWindowAttributesReply, type GetWindowAttributesReply,
  encodeDestroyWindow, encodeMapWindow, encodeUnmapWindow,
  encodeConfigureWindow, type ConfigureWindowArgs,
  encodeGetGeometry, parseGetGeometryReply, type GetGeometryReply,
  encodeQueryTree, parseQueryTreeReply, type QueryTreeReply,
  encodeInternAtom, parseInternAtomReply,
  encodeGetAtomName, parseGetAtomNameReply,
  encodeChangeProperty, type ChangePropertyArgs,
  encodeGetProperty, parseGetPropertyReply, type GetPropertyReply, type GetPropertyArgs,
  encodeSendEvent, type SendEventArgs,
  encodeQueryPointer, parseQueryPointerReply, type QueryPointerReply,
  encodeTranslateCoordinates, parseTranslateCoordinatesReply, type TranslateCoordinatesReply,
  encodeQueryKeymap, parseQueryKeymapReply, type QueryKeymapReply,
  encodeCreateWindow,
  encodeDeleteProperty,
  encodeSetSelectionOwner,
  encodeGetSelectionOwner, parseGetSelectionOwnerReply,
  encodeConvertSelection,
  parseSelectionRequestEvent, parseSelectionNotifyEvent,
  EVENT_SELECTION_REQUEST, EVENT_SELECTION_NOTIFY,
  type SelectionRequestEvent, type SelectionNotifyEvent,
} from "./request";

export type { ServerInfo, XError, QueryExtensionReply, GetImageReply,
  GetKeyboardMappingReply,
  RRQueryVersionReply, RRGetMonitorsReply, MonitorInfo,
  GetWindowAttributesReply, GetGeometryReply, QueryTreeReply,
  GetPropertyReply, QueryPointerReply, TranslateCoordinatesReply,
  QueryKeymapReply, ConfigureWindowArgs, ChangePropertyArgs,
  SendEventArgs, GetPropertyArgs,
  SelectionRequestEvent, SelectionNotifyEvent };

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
  // Reader state: a queue of raw TCP chunks with a running byte total.
  // Packets are extracted lazily — a small packet sitting entirely inside
  // the first chunk is returned as a zero-copy subarray; a packet spanning
  // multiple chunks allocates exactly one fresh Buffer of the packet's
  // size.  Avoids the O(n²) `Buffer.concat(rxBuf, chunk)` pattern for
  // large multi-chunk replies (GetImage on a high-res drawable can run
  // to tens of megabytes).
  private rxChunks: Buffer[] = [];
  private rxTotal = 0;
  private closed = false;
  private closeReason: Error | null = null;
  private _eventHandlers = new Map<number, Array<(event: Buffer) => void>>();
  private _nextResourceId = 1;

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
          // server could batch an error for an as-yet-unsent request).
          const leftover = acc.subarray(total);
          if (leftover.length) {
            this.rxChunks.push(leftover);
            this.rxTotal = leftover.length;
          }
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
      this.rxChunks.push(chunk);
      this.rxTotal += chunk.length;
      this.drainRxBuf();
    });
    this.socket.on("error", (e) => this.tearDown(e));
    this.socket.on("close", () => this.tearDown(new Error("X11 connection closed")));
  }

  /**
   * Read the next `n` bytes without consuming them.  Fast path when the
   * first chunk already holds enough; slow path concatenates just enough
   * chunks to cover `n`.  Caller must have verified `rxTotal >= n`.
   */
  private peekRx(n: number): Buffer {
    const first = this.rxChunks[0];
    if (first.length >= n) return first.subarray(0, n);
    const parts: Buffer[] = [];
    let collected = 0;
    for (const c of this.rxChunks) {
      parts.push(c);
      collected += c.length;
      if (collected >= n) break;
    }
    return Buffer.concat(parts, collected).subarray(0, n);
  }

  /**
   * Consume exactly `n` bytes from the head of the queue, returning them
   * as a single Buffer.  Fast path (packet entirely inside first chunk)
   * returns a zero-copy subarray; slow path allocates one fresh Buffer
   * of size `n`.  Caller must have verified `rxTotal >= n`.
   */
  private consumeRx(n: number): Buffer {
    const first = this.rxChunks[0];
    if (first.length >= n) {
      const pkt = first.subarray(0, n);
      if (first.length === n) this.rxChunks.shift();
      else this.rxChunks[0] = first.subarray(n);
      this.rxTotal -= n;
      return pkt;
    }
    const parts: Buffer[] = [];
    let need = n;
    while (need > 0) {
      const c = this.rxChunks[0];
      if (c.length <= need) {
        parts.push(c);
        need -= c.length;
        this.rxChunks.shift();
      } else {
        parts.push(c.subarray(0, need));
        this.rxChunks[0] = c.subarray(need);
        need = 0;
      }
    }
    this.rxTotal -= n;
    return Buffer.concat(parts, n);
  }

  private drainRxBuf(): void {
    while (this.rxTotal >= 8) {
      let total: number;
      try { total = packetTotalLength(this.peekRx(8)); }
      catch { return; }
      if (this.rxTotal < total) return;
      this.dispatchPacket(this.consumeRx(total));
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
    // Dispatch events to registered handlers.
    const eventType = kind & 0x7f; // mask off "sent-event" bit
    const handlers = this._eventHandlers.get(eventType);
    if (handlers) {
      for (let i = 0; i < handlers.length; i++) handlers[i](pkt);
    }
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

  // ── Keyboard mapping ─────────────────────────────────────────────────────
  // X servers report the keyboard layout as a (count x keysymsPerKeycode)
  // grid of CARD32 keysyms, indexed by (keycode - minKeycode).  We fetch it
  // once and cache it for keysym→keycode lookup (the inverse direction
  // libX11's XKeysymToKeycode performs) — no need to track MappingNotify
  // events because mechatron never observes remap after startup.
  private keyMapping: GetKeyboardMappingReply | null = null;
  private keysymIndex: Map<number, number> | null = null;

  /**
   * Fetch (or return cached) keyboard mapping covering
   * [minKeycode, maxKeycode].  Builds an inverse keysym→keycode index
   * alongside the cache so subsequent `keysymToKeycode` is O(1).
   */
  async getKeyboardMapping(): Promise<GetKeyboardMappingReply> {
    if (this.keyMapping) return this.keyMapping;
    const first = this.info.minKeycode;
    const count = this.info.maxKeycode - this.info.minKeycode + 1;
    const reply = await this.sendRequest(encodeGetKeyboardMapping(first, count));
    const km = parseGetKeyboardMappingReply(reply);
    // Build the inverse index: scan the first 4 slots of every row (group 1
    // unshifted/shifted, group 2 u/s) and record the first keycode for each
    // keysym, matching libX11's XKeysymToKeycode behaviour.
    const index = new Map<number, number>();
    const { keysyms, keysymsPerKeycode } = km;
    const groupWidth = Math.min(4, keysymsPerKeycode);
    const rows = (keysyms.length / keysymsPerKeycode) | 0;
    for (let row = 0; row < rows; row++) {
      const base = row * keysymsPerKeycode;
      for (let j = 0; j < groupWidth; j++) {
        const ks = keysyms[base + j];
        if (ks !== 0 && !index.has(ks)) index.set(ks, first + row);
      }
    }
    this.keyMapping = km;
    this.keysymIndex = index;
    return km;
  }

  /**
   * Resolve an X11 keysym to a keycode using the cached inverse index.
   * Returns 0 when no keycode maps to the keysym or the mapping hasn't
   * been fetched — callers drop the key event in that case, matching
   * libX11's XKeysymToKeycode.
   */
  keysymToKeycode(keysym: number): number {
    return this.keysymIndex?.get(keysym) ?? 0;
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

  // ── Core protocol helpers ─────────────────────────────────────────────────

  async getWindowAttributes(window: number): Promise<GetWindowAttributesReply> {
    const reply = await this.sendRequest(encodeGetWindowAttributes(window));
    return parseGetWindowAttributesReply(reply);
  }

  destroyWindow(window: number): void {
    this.sendRequestNoReply(encodeDestroyWindow(window));
  }

  mapWindow(window: number): void {
    this.sendRequestNoReply(encodeMapWindow(window));
  }

  unmapWindow(window: number): void {
    this.sendRequestNoReply(encodeUnmapWindow(window));
  }

  configureWindow(args: ConfigureWindowArgs): void {
    this.sendRequestNoReply(encodeConfigureWindow(args));
  }

  async getGeometry(drawable: number): Promise<GetGeometryReply> {
    const reply = await this.sendRequest(encodeGetGeometry(drawable));
    return parseGetGeometryReply(reply);
  }

  async queryTree(window: number): Promise<QueryTreeReply> {
    const reply = await this.sendRequest(encodeQueryTree(window));
    return parseQueryTreeReply(reply);
  }

  // ── Atom resolution (cached) ────────────────────────────────────────────
  // X11 atoms are stable for the lifetime of a connection.  We cache the
  // InternAtom promise so concurrent callers share a single round-trip.
  private atomCache = new Map<string, Promise<number>>();

  internAtom(name: string, onlyIfExists = false): Promise<number> {
    const key = `${name}\0${onlyIfExists ? 1 : 0}`;
    const cached = this.atomCache.get(key);
    if (cached) return cached;
    const p = this.sendRequest(encodeInternAtom(name, onlyIfExists))
      .then(r => parseInternAtomReply(r).atom);
    this.atomCache.set(key, p);
    return p;
  }

  async getAtomName(atom: number): Promise<string> {
    const reply = await this.sendRequest(encodeGetAtomName(atom));
    return parseGetAtomNameReply(reply).name;
  }

  changeProperty(args: ChangePropertyArgs): void {
    this.sendRequestNoReply(encodeChangeProperty(args));
  }

  async getProperty(args: GetPropertyArgs): Promise<GetPropertyReply> {
    const reply = await this.sendRequest(encodeGetProperty(args));
    return parseGetPropertyReply(reply);
  }

  sendEvent(args: SendEventArgs): void {
    this.sendRequestNoReply(encodeSendEvent(args));
  }

  async queryPointer(window?: number): Promise<QueryPointerReply> {
    const win = window ?? this.info.screens[0]?.root ?? 0;
    const reply = await this.sendRequest(encodeQueryPointer(win));
    return parseQueryPointerReply(reply);
  }

  async translateCoordinates(
    srcWindow: number, dstWindow: number, srcX: number, srcY: number,
  ): Promise<TranslateCoordinatesReply> {
    const reply = await this.sendRequest(
      encodeTranslateCoordinates(srcWindow, dstWindow, srcX, srcY));
    return parseTranslateCoordinatesReply(reply);
  }

  async queryKeymap(): Promise<QueryKeymapReply> {
    const reply = await this.sendRequest(encodeQueryKeymap());
    return parseQueryKeymapReply(reply);
  }

  // ── Event handling ────────────────────────────────────────────────────
  // Selection-based clipboard requires observing SelectionNotify (31) and
  // SelectionRequest (30) events from the server.

  onEvent(type: number, callback: (event: Buffer) => void): () => void {
    let list = this._eventHandlers.get(type);
    if (!list) { list = []; this._eventHandlers.set(type, list); }
    list.push(callback);
    return () => {
      const idx = list!.indexOf(callback);
      if (idx >= 0) list!.splice(idx, 1);
    };
  }

  waitForEvent(type: number, predicate?: (event: Buffer) => boolean, timeoutMs = 3000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timeout waiting for X11 event type ${type}`));
      }, timeoutMs);
      const off = this.onEvent(type, (event) => {
        if (predicate && !predicate(event)) return;
        clearTimeout(timer);
        off();
        resolve(event);
      });
    });
  }

  // ── Resource ID allocation ────────────────────────────────────────────

  allocId(): number {
    const id = this.info.resourceIdBase | (this._nextResourceId & this.info.resourceIdMask);
    this._nextResourceId++;
    return id;
  }

  // ── Selection protocol ────────────────────────────────────────────────

  createWindow(parent: number, x = 0, y = 0, width = 1, height = 1): number {
    const wid = this.allocId();
    this.sendRequestNoReply(encodeCreateWindow(wid, parent, x, y, width, height));
    return wid;
  }

  deleteProperty(window: number, property: number): void {
    this.sendRequestNoReply(encodeDeleteProperty(window, property));
  }

  setSelectionOwner(owner: number, selection: number, timestamp = 0): void {
    this.sendRequestNoReply(encodeSetSelectionOwner(owner, selection, timestamp));
  }

  async getSelectionOwner(selection: number): Promise<number> {
    const reply = await this.sendRequest(encodeGetSelectionOwner(selection));
    return parseGetSelectionOwnerReply(reply).owner;
  }

  convertSelection(requestor: number, selection: number, target: number, property: number, timestamp = 0): void {
    this.sendRequestNoReply(encodeConvertSelection(requestor, selection, target, property, timestamp));
  }

  close(): void { this.tearDown(new Error("X11 connection closed by client")); }
}
