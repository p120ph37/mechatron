import { DBusConnection } from "../dbus/connection";

const RESPONSE_OK = 0;

export function waitForResponse(conn: DBusConnection, reqPath: string): Promise<Map<string, any>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("portal response timeout (30s)"));
    }, 30000);

    const unsub = conn.onSignal((msg) => {
      if (msg.path === reqPath && msg.member === "Response") {
        clearTimeout(timer);
        unsub();
        const code = msg.body[0] as number;
        const results = msg.body[1] as Map<string, any>;
        if (code !== RESPONSE_OK) {
          reject(new Error(`portal denied (response=${code})`));
        } else {
          resolve(results);
        }
      }
    });
  });
}

export function requestPath(conn: DBusConnection, token: string): string {
  const sender = conn.getUniqueName().replace(/^:/, "").replace(/\./g, "_");
  return `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
}
