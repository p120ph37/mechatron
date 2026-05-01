/**
 * Mechatron Shell Bridge — GNOME Shell Extension (Legacy format)
 *
 * GNOME 42-44 variant: uses imports.gi + function init() format.
 * GNOME 45+ uses extension.js (ES module format) instead.
 * See extension.js header for full documentation.
 *
 * Targets GNOME 42-44.
 */

"use strict";

const { Gio, GLib, Meta, Shell } = imports.gi;

const BUS_NAME = "dev.mechatronic.Shell";
const OBJECT_PATH = "/dev/mechatronic/Shell";
const TOKEN_FILE = GLib.getenv("MECHATRON_TOKENS_FILE") || "/etc/mechatron/tokens";

const IFACE_XML = `
<node>
  <interface name="dev.mechatronic.Shell.Window">
    <method name="List">
      <arg type="s" direction="in" name="token"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="GetActive">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="out" name="id"/>
    </method>
    <method name="Activate">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="Close">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetTitle">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="out" name="title"/>
    </method>
    <method name="SetTitle">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="in" name="title"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetBounds">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="SetBounds">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="w"/>
      <arg type="i" direction="in" name="h"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetClient">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="SetMinimized">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="in" name="minimized"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="SetMaximized">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="in" name="maximized"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="SetAbove">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="in" name="above"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="IsMinimized">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="minimized"/>
    </method>
    <method name="IsMaximized">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="maximized"/>
    </method>
    <method name="IsAbove">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="above"/>
    </method>
    <method name="GetPID">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="i" direction="out" name="pid"/>
    </method>
    <method name="Ping">
      <arg type="b" direction="out" name="ok"/>
    </method>
  </interface>
</node>
`;

function loadTokens() {
  try {
    const [ok, contents] = GLib.file_get_contents(TOKEN_FILE);
    if (!ok || !contents) return new Set();
    const text = new TextDecoder().decode(contents);
    const tokens = new Set();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) tokens.add(trimmed);
    }
    return tokens;
  } catch (e) {
    return new Set();
  }
}

function requireAuth(token) {
  const allowed = loadTokens();
  if (allowed.size === 0) throw new Error("No tokens configured in " + TOKEN_FILE);
  if (!allowed.has(token)) throw new Error("Unauthorized: invalid token");
}

function findWindow(id) {
  for (const actor of global.get_window_actors()) {
    const w = actor.meta_window;
    if (w && w.get_stable_sequence() === id) return w;
  }
  return null;
}

function windowToJson(w) {
  const frame = w.get_frame_rect();
  const buf = w.get_buffer_rect();
  return {
    id: w.get_stable_sequence(),
    title: w.get_title() || "",
    pid: w.get_pid(),
    wmClass: w.get_wm_class() || "",
    bounds: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
    client: { x: buf.x, y: buf.y, w: buf.width, h: buf.height },
    minimized: w.minimized,
    maximized: w.get_maximized() === Meta.MaximizeFlags.BOTH,
    above: w.is_above(),
    valid: !w.is_override_redirect(),
  };
}

function rectJson(rect) {
  return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
}

const handlers = {
  List(token) {
    requireAuth(token);
    const windows = global.get_window_actors()
      .map(a => a.meta_window)
      .filter(w => w && !w.is_override_redirect())
      .map(windowToJson);
    return JSON.stringify(windows);
  },
  GetActive(token) {
    requireAuth(token);
    const focus = global.display.get_focus_window();
    return focus ? focus.get_stable_sequence() : 0;
  },
  Activate(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    if (!w) return false;
    w.activate(global.get_current_time());
    return true;
  },
  Close(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    if (!w) return false;
    w.delete(global.get_current_time());
    return true;
  },
  GetTitle(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    return w ? (w.get_title() || "") : "";
  },
  SetTitle(token, _id, _title) {
    requireAuth(token);
    return false;
  },
  GetBounds(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    if (!w) return JSON.stringify({ x: 0, y: 0, w: 0, h: 0 });
    return rectJson(w.get_frame_rect());
  },
  SetBounds(token, id, x, y, w, h) {
    requireAuth(token);
    const win = findWindow(id);
    if (!win) return false;
    win.move_resize_frame(true, x, y, w, h);
    return true;
  },
  GetClient(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    if (!w) return JSON.stringify({ x: 0, y: 0, w: 0, h: 0 });
    return rectJson(w.get_buffer_rect());
  },
  SetMinimized(token, id, minimized) {
    requireAuth(token);
    const w = findWindow(id);
    if (!w) return false;
    if (minimized) w.minimize();
    else w.unminimize(global.get_current_time());
    return true;
  },
  SetMaximized(token, id, maximized) {
    requireAuth(token);
    const w = findWindow(id);
    if (!w) return false;
    if (maximized) w.maximize(Meta.MaximizeFlags.BOTH);
    else w.unmaximize(Meta.MaximizeFlags.BOTH);
    return true;
  },
  SetAbove(token, id, above) {
    requireAuth(token);
    const w = findWindow(id);
    if (!w) return false;
    if (above) w.make_above();
    else w.unmake_above();
    return true;
  },
  IsMinimized(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    return w ? w.minimized : false;
  },
  IsMaximized(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    return w ? w.get_maximized() === Meta.MaximizeFlags.BOTH : false;
  },
  IsAbove(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    return w ? w.is_above() : false;
  },
  GetPID(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    return w ? w.get_pid() : 0;
  },
  Ping() {
    return true;
  },
};

function init() {
  return new MechatronWMExtension();
}

class MechatronWMExtension {
  constructor() {
    this._dbus = null;
    this._ownerId = 0;
  }

  enable() {
    const nodeInfo = Gio.DBusNodeInfo.new_for_xml(IFACE_XML);
    const ifaceInfo = nodeInfo.interfaces[0];
    this._dbus = Gio.DBusExportedObject.wrapJSObject(ifaceInfo, handlers);
    this._dbus.export(Gio.DBus.session, OBJECT_PATH);
    this._ownerId = Gio.bus_own_name(
      Gio.BusType.SESSION,
      BUS_NAME,
      Gio.BusNameOwnerFlags.NONE,
      null,
      null,
      null,
    );
  }

  disable() {
    if (this._dbus) {
      this._dbus.unexport();
      this._dbus = null;
    }
    if (this._ownerId) {
      Gio.bus_unown_name(this._ownerId);
      this._ownerId = 0;
    }
  }
}
