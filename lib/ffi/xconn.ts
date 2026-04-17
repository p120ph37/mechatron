import { XConnection } from "../x11proto/conn";

let _conn: XConnection | null = null;
let _openPromise: Promise<XConnection | null> | null = null;
let _openReason: string | null = null;

export async function getXConnection(): Promise<XConnection | null> {
  if (_conn) return _conn;
  if (_openPromise) return _openPromise;
  if (process.platform !== "linux") return null;
  _openPromise = (async () => {
    try {
      const c = await XConnection.connect();
      await c.getKeyboardMapping();
      _conn = c;
      return c;
    } catch (e) {
      _openReason = (e as Error).message || String(e);
      return null;
    }
  })();
  return _openPromise;
}

export function getXConnectionSync(): XConnection | null { return _conn; }
export function xconnOpenReason(): string | null { return _openReason; }

export function closeXConnection(): void {
  if (_conn) { try { _conn.close(); } catch {} }
  _conn = null;
  _openPromise = null;
}

export function _resetXConnForTests(): void {
  closeXConnection();
  _openReason = null;
}

if (process.platform === "linux" && typeof process.on === "function") {
  process.on("exit", () => {
    if (_conn) { try { _conn.close(); } catch {} }
  });
}
