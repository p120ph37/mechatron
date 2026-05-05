/**
 * Mechatron Shell Bridge — GNOME Shell Extension
 *
 * Exposes a privileged D-Bus surface for mechatron, complementing the
 * standard xdg-desktop-portal API. The portal grants a constrained,
 * permission-gated set of operations (with permission popups); this
 * extension grants a fuller, popup-free set of operations to apps that
 * present a valid bearer token. Currently exposes window management;
 * future features (e.g. screencap without portal popups) will land here
 * too as additional D-Bus interfaces on the same root object.
 *
 * All methods except Ping require a bearer token. Valid tokens are read
 * from /etc/mechatron/tokens (one per line, # comments). The path can
 * be overridden via MECHATRON_TOKENS_FILE in the env that launches
 * gnome-shell (used by CI to point at a tmpfile).
 *
 * Targets GNOME 45+ (ES module format).
 */

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

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

const INPUT_IFACE_XML = `
<node>
  <interface name="dev.mechatronic.Shell.Input">
    <method name="KeyboardKeysym">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="keysym"/>
      <arg type="b" direction="in" name="pressed"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="KeyboardKey">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="key"/>
      <arg type="b" direction="in" name="pressed"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="PointerButton">
      <arg type="s" direction="in" name="token"/>
      <arg type="i" direction="in" name="button"/>
      <arg type="b" direction="in" name="pressed"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="PointerMotionAbsolute">
      <arg type="s" direction="in" name="token"/>
      <arg type="d" direction="in" name="x"/>
      <arg type="d" direction="in" name="y"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="PointerMotion">
      <arg type="s" direction="in" name="token"/>
      <arg type="d" direction="in" name="dx"/>
      <arg type="d" direction="in" name="dy"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="PointerAxisDiscrete">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="axis"/>
      <arg type="i" direction="in" name="steps"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetPointerPos">
      <arg type="s" direction="in" name="token"/>
      <arg type="d" direction="out" name="x"/>
      <arg type="d" direction="out" name="y"/>
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
  } catch {
    return new Set();
  }
}

function requireAuth(token) {
  const allowed = loadTokens();
  if (allowed.size === 0) throw new Error("No tokens configured in " + TOKEN_FILE);
  if (!allowed.has(token)) throw new Error("Unauthorized: invalid token");
}

function inputTime() {
  const t = global.get_current_time();
  return t > 0 ? t : Math.floor(GLib.get_monotonic_time() / 1000);
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

export default class MechatronWMExtension extends Extension {
  _dbus = null;
  _dbusInput = null;
  _ownerId = 0;
  _virtualKeyboard = null;
  _virtualPointer = null;

  _ensureVirtualDevices() {
    if (!this._virtualKeyboard) {
      const seat = Clutter.get_default_backend().get_default_seat();
      this._virtualKeyboard = seat.create_virtual_device(
        Clutter.InputDeviceType.KEYBOARD_DEVICE,
      );
      this._virtualPointer = seat.create_virtual_device(
        Clutter.InputDeviceType.POINTER_DEVICE,
      );
    }
  }

  enable() {
    const nodeInfo = Gio.DBusNodeInfo.new_for_xml(IFACE_XML);
    const ifaceInfo = nodeInfo.interfaces[0];

    this._dbus = Gio.DBusExportedObject.wrapJSObject(ifaceInfo, {
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
        const time = global.get_current_time();
        w.activate(time);
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
    });

    this._dbus.export(Gio.DBus.session, OBJECT_PATH);

    const ext = this;
    const inputNodeInfo = Gio.DBusNodeInfo.new_for_xml(INPUT_IFACE_XML);
    const inputIfaceInfo = inputNodeInfo.interfaces[0];

    // Use register_object instead of wrapJSObject so we control when the
    // D-Bus reply is sent.  Input events dispatched through Clutter virtual
    // devices are processed asynchronously on the GLib main loop; deferring
    // the reply to the next idle callback ensures the event has been applied
    // before the caller sees the response (analogous to XSync after XWarpPointer).
    function deferReply(invocation, variant) {
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        invocation.return_value(variant);
        return GLib.SOURCE_REMOVE;
      });
    }
    const OK_TRUE = new GLib.Variant("(b)", [true]);
    this._dbusInputRegId = Gio.DBus.session.register_object(
      OBJECT_PATH,
      inputIfaceInfo,
      (conn, sender, path, iface, method, params, invocation) => {
        try {
          const args = params.deep_unpack();
          if (method === "GetPointerPos") {
            requireAuth(args[0]);
            const [x, y] = global.get_pointer();
            invocation.return_value(new GLib.Variant("(dd)", [x, y]));
            return;
          }
          const token = args[0];
          requireAuth(token);
          ext._ensureVirtualDevices();
          const time = inputTime();
          switch (method) {
            case "KeyboardKeysym": {
              const state = args[2] ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED;
              ext._virtualKeyboard.notify_keyval(time, args[1], state);
              break;
            }
            case "KeyboardKey": {
              const state = args[2] ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED;
              ext._virtualKeyboard.notify_key(time, args[1], state);
              break;
            }
            case "PointerButton": {
              const state = args[2] ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED;
              ext._virtualPointer.notify_button(time, args[1], state);
              break;
            }
            case "PointerMotionAbsolute":
              ext._virtualPointer.notify_absolute_motion(time, args[1], args[2]);
              break;
            case "PointerMotion":
              ext._virtualPointer.notify_relative_motion(time, args[1], args[2]);
              break;
            case "PointerAxisDiscrete": {
              const axis = args[1];
              const steps = args[2];
              const absSteps = Math.abs(steps);
              let direction;
              if (axis === 0) {
                direction = steps > 0
                  ? Clutter.ScrollDirection.DOWN
                  : Clutter.ScrollDirection.UP;
              } else {
                direction = steps > 0
                  ? Clutter.ScrollDirection.RIGHT
                  : Clutter.ScrollDirection.LEFT;
              }
              for (let i = 0; i < absSteps; i++) {
                ext._virtualPointer.notify_discrete_scroll(time, direction,
                  Clutter.ScrollFinishFlags.NONE);
              }
              break;
            }
            default:
              invocation.return_dbus_error(
                "org.freedesktop.DBus.Error.UnknownMethod", method);
              return;
          }
          deferReply(invocation, OK_TRUE);
        } catch (e) {
          invocation.return_dbus_error(
            "org.freedesktop.DBus.Error.Failed", String(e));
        }
      },
      null, null,
    );

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
    if (this._dbusInputRegId) {
      Gio.DBus.session.unregister_object(this._dbusInputRegId);
      this._dbusInputRegId = 0;
    }
    if (this._dbus) {
      this._dbus.unexport();
      this._dbus = null;
    }
    if (this._ownerId) {
      Gio.bus_unown_name(this._ownerId);
      this._ownerId = 0;
    }
    this._virtualKeyboard = null;
    this._virtualPointer = null;
  }
}
