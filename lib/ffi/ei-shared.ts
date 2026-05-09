/**
 * Singleton EI worker dispatcher shared by keyboard-portal and
 * mouse-portal.  Both subsystems route through a single libei
 * session to avoid creating duplicate RemoteDesktop portal sessions.
 */

import { createDispatcher, type Dispatcher } from "./_dispatch";

let _d: Dispatcher | null = null;

export function getEiDispatcher(): Dispatcher {
  if (!_d) _d = createDispatcher(require.resolve("./ei-worker"));
  return _d;
}
