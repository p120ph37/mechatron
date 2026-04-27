/**
 * Mechatron Window Manager Bridge — GNOME Shell Extension
 *
 * Exposes a D-Bus interface for window management operations, giving
 * mechatron full window control on Wayland/GNOME without X11.
 *
 * Targets GNOME 45+ (ES module format).
 */

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const BUS_NAME = "dev.mechatronic.WindowManager";
const OBJECT_PATH = "/dev/mechatronic/WindowManager";

const IFACE_XML = `
<node>
  <interface name="dev.mechatronic.WindowManager">
    <method name="List">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="GetActive">
      <arg type="u" direction="out" name="id"/>
    </method>
    <method name="Activate">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="Close">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetTitle">
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="out" name="title"/>
    </method>
    <method name="SetTitle">
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="in" name="title"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetBounds">
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="SetBounds">
      <arg type="u" direction="in" name="id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="w"/>
      <arg type="i" direction="in" name="h"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetClient">
      <arg type="u" direction="in" name="id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="SetMinimized">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="in" name="minimized"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="SetMaximized">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="in" name="maximized"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="SetAbove">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="in" name="above"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="IsMinimized">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="minimized"/>
    </method>
    <method name="IsMaximized">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="maximized"/>
    </method>
    <method name="IsAbove">
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="above"/>
    </method>
    <method name="GetPID">
      <arg type="u" direction="in" name="id"/>
      <arg type="i" direction="out" name="pid"/>
    </method>
    <method name="Ping">
      <arg type="b" direction="out" name="ok"/>
    </method>
  </interface>
</node>
`;

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

export default class MechatronWMExtension extends Extension {
  _dbus = null;
  _ownerId = 0;

  enable() {
    const nodeInfo = Gio.DBusNodeInfo.new_for_xml(IFACE_XML);
    const ifaceInfo = nodeInfo.interfaces[0];

    this._dbus = Gio.DBusExportedObject.wrapJSObject(ifaceInfo, {
      List() {
        const windows = global.get_window_actors()
          .map(a => a.meta_window)
          .filter(w => w && !w.is_override_redirect())
          .map(windowToJson);
        return JSON.stringify(windows);
      },

      GetActive() {
        const focus = global.display.get_focus_window();
        return focus ? focus.get_stable_sequence() : 0;
      },

      Activate(id) {
        const w = findWindow(id);
        if (!w) return false;
        const time = global.get_current_time();
        w.activate(time);
        return true;
      },

      Close(id) {
        const w = findWindow(id);
        if (!w) return false;
        w.delete(global.get_current_time());
        return true;
      },

      GetTitle(id) {
        const w = findWindow(id);
        return w ? (w.get_title() || "") : "";
      },

      SetTitle(_id, _title) {
        return false;
      },

      GetBounds(id) {
        const w = findWindow(id);
        if (!w) return JSON.stringify({ x: 0, y: 0, w: 0, h: 0 });
        return rectJson(w.get_frame_rect());
      },

      SetBounds(id, x, y, w, h) {
        const win = findWindow(id);
        if (!win) return false;
        win.move_resize_frame(true, x, y, w, h);
        return true;
      },

      GetClient(id) {
        const w = findWindow(id);
        if (!w) return JSON.stringify({ x: 0, y: 0, w: 0, h: 0 });
        return rectJson(w.get_buffer_rect());
      },

      SetMinimized(id, minimized) {
        const w = findWindow(id);
        if (!w) return false;
        if (minimized) w.minimize();
        else w.unminimize(global.get_current_time());
        return true;
      },

      SetMaximized(id, maximized) {
        const w = findWindow(id);
        if (!w) return false;
        if (maximized) w.maximize(Meta.MaximizeFlags.BOTH);
        else w.unmaximize(Meta.MaximizeFlags.BOTH);
        return true;
      },

      SetAbove(id, above) {
        const w = findWindow(id);
        if (!w) return false;
        if (above) w.make_above();
        else w.unmake_above();
        return true;
      },

      IsMinimized(id) {
        const w = findWindow(id);
        return w ? w.minimized : false;
      },

      IsMaximized(id) {
        const w = findWindow(id);
        return w ? w.get_maximized() === Meta.MaximizeFlags.BOTH : false;
      },

      IsAbove(id) {
        const w = findWindow(id);
        return w ? w.is_above() : false;
      },

      GetPID(id) {
        const w = findWindow(id);
        return w ? w.get_pid() : 0;
      },

      Ping() {
        return true;
      },
    });

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
