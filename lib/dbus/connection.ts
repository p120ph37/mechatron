/**
 * D-Bus session bus connection — socket lifecycle, EXTERNAL auth,
 * method call/return dispatch, and signal subscription.
 *
 * Kept minimal: only supports EXTERNAL authentication (the standard
 * mechanism for same-user local connections) and little-endian wire
 * format.  No fd-passing or SASL negotiation.
 */

import * as net from "net";
import { existsSync } from "fs";
import {
  encodeMessage, decodeMessage, totalMessageLength,
  MSG_METHOD_CALL, MSG_METHOD_RETURN, MSG_ERROR, MSG_SIGNAL,
  FLAG_NO_REPLY_EXPECTED, FLAG_NO_AUTO_START,
  type Message,
} from "./wire";

export class DBusError extends Error {
  constructor(public readonly name: string, message: string) {
    super(`${name}: ${message}`);
  }
}

interface PendingCall {
  resolve: (msg: Message) => void;
  reject: (err: Error) => void;
}

type SignalHandler = (msg: Message) => void;

export interface MethodCallOptions {
  path: string;
  interface?: string;
  member: string;
  destination?: string;
  signature?: string;
  body?: any[];
  noReply?: boolean;
}

export class DBusConnection {
  private socket!: net.Socket;
  private serial = 0;
  private pending = new Map<number, PendingCall>();
  private signalHandlers: SignalHandler[] = [];
  private rxBuf: Buffer = Buffer.alloc(0);
  private closed = false;
  private uniqueName = "";

  static async connect(address?: string): Promise<DBusConnection> {
    const conn = new DBusConnection();
    const socketPath = resolveSessionBus(address);
    if (!socketPath) throw new Error("D-Bus: cannot locate session bus");
    await conn.openSocket(socketPath);
    await conn.authenticate();
    await conn.hello();
    return conn;
  }

  private openSocket(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ path });
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Error("D-Bus connect timeout"));
      }, 5000);
      this.socket.once("connect", () => { clearTimeout(timer); resolve(); });
      this.socket.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
  }

  private authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const uid = process.getuid?.() ?? 0;
      const hexUid = Buffer.from(String(uid), "utf8").toString("hex");

      this.socket.once("error", reject);
      let acc = "";
      const onData = (chunk: Buffer) => {
        acc += chunk.toString("utf8");
        if (acc.includes("\r\n")) {
          if (acc.startsWith("OK")) {
            this.socket.removeListener("data", onData);
            this.socket.removeListener("error", reject);
            this.socket.write("BEGIN\r\n");
            this.installReader();
            resolve();
          } else if (acc.startsWith("REJECTED")) {
            this.socket.removeListener("data", onData);
            this.socket.removeListener("error", reject);
            this.socket.destroy();
            reject(new Error("D-Bus EXTERNAL auth rejected"));
          }
        }
      };
      this.socket.on("data", onData);
      this.socket.write(`\0AUTH EXTERNAL ${hexUid}\r\n`);
    });
  }

  private installReader(): void {
    this.socket.on("data", (chunk: Buffer) => {
      if (this.rxBuf.length === 0) {
        this.rxBuf = chunk;
      } else {
        this.rxBuf = Buffer.concat([this.rxBuf, chunk]);
      }
      this.processMessages();
    });
    this.socket.on("close", () => {
      this.closed = true;
      for (const [, p] of this.pending) {
        p.reject(new Error("D-Bus connection closed"));
      }
      this.pending.clear();
    });
  }

  private processMessages(): void {
    while (true) {
      const total = totalMessageLength(this.rxBuf);
      if (total === null || this.rxBuf.length < total) break;

      const raw = this.rxBuf.subarray(0, total);
      this.rxBuf = this.rxBuf.subarray(total);

      const msg = decodeMessage(raw);
      if (!msg) continue;

      if (msg.type === MSG_METHOD_RETURN || msg.type === MSG_ERROR) {
        const p = this.pending.get(msg.replySerial!);
        if (p) {
          this.pending.delete(msg.replySerial!);
          if (msg.type === MSG_ERROR) {
            const errMsg = msg.body[0] ?? msg.errorName ?? "unknown error";
            p.reject(new DBusError(msg.errorName ?? "org.freedesktop.DBus.Error", String(errMsg)));
          } else {
            p.resolve(msg);
          }
        }
      } else if (msg.type === MSG_SIGNAL) {
        for (const h of this.signalHandlers) h(msg);
      }
    }
  }

  private async hello(): Promise<void> {
    const reply = await this.call({
      path: "/org/freedesktop/DBus",
      interface: "org.freedesktop.DBus",
      member: "Hello",
      destination: "org.freedesktop.DBus",
    });
    this.uniqueName = reply.body[0] as string;
  }

  call(opts: MethodCallOptions): Promise<Message> {
    if (this.closed) return Promise.reject(new Error("D-Bus connection closed"));
    const serial = ++this.serial;
    const msg: Message = {
      type: MSG_METHOD_CALL,
      flags: FLAG_NO_AUTO_START,
      serial,
      path: opts.path,
      interface: opts.interface,
      member: opts.member,
      destination: opts.destination,
      signature: opts.signature,
      body: opts.body ?? [],
    };
    if (opts.noReply) {
      msg.flags |= FLAG_NO_REPLY_EXPECTED;
      this.socket.write(encodeMessage(msg));
      return Promise.resolve({ type: MSG_METHOD_RETURN, flags: 0, serial: 0, body: [] });
    }
    return new Promise((resolve, reject) => {
      this.pending.set(serial, { resolve, reject });
      this.socket.write(encodeMessage(msg));
    });
  }

  onSignal(handler: SignalHandler): () => void {
    this.signalHandlers.push(handler);
    return () => {
      const idx = this.signalHandlers.indexOf(handler);
      if (idx >= 0) this.signalHandlers.splice(idx, 1);
    };
  }

  getUniqueName(): string {
    return this.uniqueName;
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.socket.destroy();
    }
  }
}

// ─── Session bus address resolution ────────────────────────────────

function resolveSessionBus(address?: string): string | null {
  const raw = address ?? process.env.DBUS_SESSION_BUS_ADDRESS ?? "";

  // Parse "unix:path=/run/user/1000/bus" or "unix:abstract=/tmp/dbus-xxx"
  if (raw) {
    for (const part of raw.split(";")) {
      const trimmed = part.trim();
      if (!trimmed.startsWith("unix:")) continue;
      const params = new Map<string, string>();
      for (const kv of trimmed.slice(5).split(",")) {
        const eq = kv.indexOf("=");
        if (eq > 0) params.set(kv.slice(0, eq), kv.slice(eq + 1));
      }
      if (params.has("path")) return params.get("path")!;
      if (params.has("abstract")) return "\0" + params.get("abstract")!;
    }
  }

  // Fallback: logind well-known path
  const uid = process.getuid?.();
  if (typeof uid === "number") {
    const fallback = `/run/user/${uid}/bus`;
    if (existsSync(fallback)) return fallback;
  }

  return null;
}
