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

const { Clutter, Gio, GLib, Meta, Shell, St } = imports.gi;

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
    <method name="IsDecorated">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="id"/>
      <arg type="b" direction="out" name="decorated"/>
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

const SCREEN_IFACE_XML = `
<node>
  <interface name="dev.mechatronic.Shell.Screen">
    <method name="Synchronize">
      <arg type="s" direction="in" name="token"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="GrabScreen">
      <arg type="s" direction="in" name="token"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="w"/>
      <arg type="i" direction="in" name="h"/>
      <arg type="ay" direction="out" name="png"/>
    </method>
  </interface>
</node>
`;

const CLIPBOARD_IFACE_XML = `
<node>
  <interface name="dev.mechatronic.Shell.Clipboard">
    <method name="Clear">
      <arg type="s" direction="in" name="token"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="HasText">
      <arg type="s" direction="in" name="token"/>
      <arg type="b" direction="out" name="hasText"/>
    </method>
    <method name="GetText">
      <arg type="s" direction="in" name="token"/>
      <arg type="s" direction="out" name="text"/>
    </method>
    <method name="SetText">
      <arg type="s" direction="in" name="token"/>
      <arg type="s" direction="in" name="text"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="HasImage">
      <arg type="s" direction="in" name="token"/>
      <arg type="b" direction="out" name="hasImage"/>
    </method>
    <method name="GetImage">
      <arg type="s" direction="in" name="token"/>
      <arg type="ay" direction="out" name="png"/>
    </method>
    <method name="SetImage">
      <arg type="s" direction="in" name="token"/>
      <arg type="ay" direction="in" name="png"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="GetSequence">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="out" name="seq"/>
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
    <method name="GetButtonState">
      <arg type="s" direction="in" name="token"/>
      <arg type="i" direction="in" name="button"/>
      <arg type="b" direction="out" name="pressed"/>
    </method>
    <method name="GetKeyState">
      <arg type="s" direction="in" name="token"/>
      <arg type="u" direction="in" name="keysym"/>
      <arg type="b" direction="out" name="pressed"/>
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

const KEYSYM_MOD_MASK = new Map([
  [0xFFE1, 1],    // Shift_L   → SHIFT_MASK
  [0xFFE2, 1],    // Shift_R   → SHIFT_MASK
  [0xFFE3, 4],    // Control_L → CONTROL_MASK
  [0xFFE4, 4],    // Control_R → CONTROL_MASK
  [0xFFE5, 2],    // Caps_Lock → LOCK_MASK
  [0xFFE9, 8],    // Alt_L     → MOD1_MASK
  [0xFFEA, 8],    // Alt_R     → MOD1_MASK
  [0xFFEB, 64],   // Super_L   → MOD4_MASK
  [0xFFEC, 64],   // Super_R   → MOD4_MASK
  [0xFF7F, 16],   // Num_Lock  → MOD2_MASK
]);

// Mutter's native maskmap swaps BUTTON2/BUTTON3 masks (X11 legacy):
//   Clutter button 2 (mid)   → BUTTON3_MASK (1024)
//   Clutter button 3 (right) → BUTTON2_MASK (512)
const BUTTON_MOD_MASKS = [256, 1024, 512, 2048, 4096];

// Mechatron button constant → Clutter button number.
const MECHATRON_TO_CLUTTER = [1, 2, 3, 8, 9];

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
  IsDecorated(token, id) {
    requireAuth(token);
    const w = findWindow(id);
    return w ? w.decorated : true;
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
    this._dbusInput = null;
    this._dbusInputRegId = 0;
    this._dbusClipboardRegId = 0;
    this._dbusScreenRegId = 0;
    this._ownerId = 0;
    this._virtualKeyboard = null;
    this._virtualPointer = null;
    this._pressedKeys = new Set();
    this._pressedButtons = new Set();
    this._clipSeq = 0;
  }

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
    this._dbus = Gio.DBusExportedObject.wrapJSObject(ifaceInfo, handlers);
    this._dbus.export(Gio.DBus.session, OBJECT_PATH);

    const ext = this;
    const inputNodeInfo = Gio.DBusNodeInfo.new_for_xml(INPUT_IFACE_XML);
    const inputIfaceInfo = inputNodeInfo.interfaces[0];

    // Use register_object instead of wrapJSObject so we control when the
    // D-Bus reply is sent.  Input events dispatched through Clutter virtual
    // devices are processed asynchronously on the GLib main loop; deferring
    // the reply via idle_add ensures the event has been applied before the
    // caller sees the response (analogous to XSync after XWarpPointer).
    function deferReply(invocation, variant) {
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        invocation.return_value(variant);
        return GLib.SOURCE_REMOVE;
      });
    }
    // For PointerMotionAbsolute we wait for the actual motion event to flow
    // through the stage before replying.  notify_absolute_motion enqueues an
    // event in Clutter's input queue that is dispatched asynchronously from
    // the GLib main loop; the reply must be deferred until the event has
    // been processed (and global.get_pointer() reflects the new position).
    // Using captured-event with a coordinate match avoids polling.  A 500ms
    // safety timeout prevents indefinite waits if the event is dropped (e.g.
    // when the warp coordinates are clamped to monitor bounds).
    function deferReplyAfterMotion(invocation, targetX, targetY) {
      const stage = global.stage;
      let handlerId = 0;
      let timeoutId = 0;
      const finish = () => {
        if (handlerId) { stage.disconnect(handlerId); handlerId = 0; }
        if (timeoutId) { GLib.source_remove(timeoutId); timeoutId = 0; }
        invocation.return_value(OK_TRUE);
      };
      handlerId = stage.connect("captured-event", (_s, event) => {
        if (event.type() === Clutter.EventType.MOTION) {
          const [x, y] = event.get_coords();
          if (Math.round(x) === Math.round(targetX) &&
              Math.round(y) === Math.round(targetY)) {
            finish();
          }
        }
        return Clutter.EVENT_PROPAGATE;
      });
      timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        timeoutId = 0;
        finish();
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
          if (method === "GetButtonState") {
            requireAuth(args[0]);
            const button = args[1];
            const [, , mods] = global.get_pointer();
            const mask = button >= 0 && button < BUTTON_MOD_MASKS.length ? BUTTON_MOD_MASKS[button] : 0;
            const clutterBtn = button >= 0 && button < MECHATRON_TO_CLUTTER.length ? MECHATRON_TO_CLUTTER[button] : -1;
            const pressed = (mods & mask) !== 0 || ext._pressedButtons.has(clutterBtn);
            invocation.return_value(new GLib.Variant("(b)", [pressed]));
            return;
          }
          if (method === "GetKeyState") {
            requireAuth(args[0]);
            const keysym = args[1];
            const modMask = KEYSYM_MOD_MASK.get(keysym);
            if (modMask !== undefined) {
              const [, , mods] = global.get_pointer();
              invocation.return_value(new GLib.Variant("(b)", [(mods & modMask) !== 0]));
            } else {
              invocation.return_value(new GLib.Variant("(b)", [ext._pressedKeys.has(keysym)]));
            }
            return;
          }
          const token = args[0];
          requireAuth(token);
          ext._ensureVirtualDevices();
          const time = inputTime();
          switch (method) {
            case "KeyboardKeysym": {
              const pressed = !!args[2];
              const state = pressed ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED;
              if (pressed) ext._pressedKeys.add(args[1]);
              else ext._pressedKeys.delete(args[1]);
              ext._virtualKeyboard.notify_keyval(time, args[1], state);
              break;
            }
            case "KeyboardKey": {
              const state = args[2] ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED;
              ext._virtualKeyboard.notify_key(time, args[1], state);
              break;
            }
            case "PointerButton": {
              const pressed = !!args[2];
              const state = pressed ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED;
              if (pressed) ext._pressedButtons.add(args[1]);
              else ext._pressedButtons.delete(args[1]);
              ext._virtualPointer.notify_button(time, args[1], state);
              break;
            }
            case "PointerMotionAbsolute":
              ext._virtualPointer.notify_absolute_motion(time, args[1], args[2]);
              deferReplyAfterMotion(invocation, args[1], args[2]);
              return;
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

    const clipboardNodeInfo = Gio.DBusNodeInfo.new_for_xml(CLIPBOARD_IFACE_XML);
    const clipboardIfaceInfo = clipboardNodeInfo.interfaces[0];

    const clipboard = St.Clipboard.get_default();
    const TEXT_MIMES = ["text/plain;charset=utf-8", "text/plain", "UTF8_STRING", "STRING"];
    const IMAGE_MIME = "image/png";

    function hasMime(mimes, want) {
      if (!mimes) return false;
      for (const m of mimes) {
        for (const w of want) if (m === w) return true;
      }
      return false;
    }

    this._dbusClipboardRegId = Gio.DBus.session.register_object(
      OBJECT_PATH,
      clipboardIfaceInfo,
      (conn, sender, path, iface, method, params, invocation) => {
        try {
          const args = params.deep_unpack();
          requireAuth(args[0]);

          switch (method) {
            case "Clear":
              clipboard.set_text(St.ClipboardType.CLIPBOARD, "");
              ext._clipSeq++;
              invocation.return_value(new GLib.Variant("(b)", [true]));
              return;

            case "HasText": {
              const mimes = clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
              invocation.return_value(new GLib.Variant("(b)", [hasMime(mimes, TEXT_MIMES)]));
              return;
            }

            case "GetText":
              clipboard.get_text(St.ClipboardType.CLIPBOARD, (_cb, text) => {
                invocation.return_value(new GLib.Variant("(s)", [text || ""]));
              });
              return;

            case "SetText":
              clipboard.set_text(St.ClipboardType.CLIPBOARD, args[1] || "");
              ext._clipSeq++;
              invocation.return_value(new GLib.Variant("(b)", [true]));
              return;

            case "HasImage": {
              const mimes = clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
              invocation.return_value(new GLib.Variant("(b)", [hasMime(mimes, [IMAGE_MIME])]));
              return;
            }

            case "GetImage":
              clipboard.get_content(St.ClipboardType.CLIPBOARD, IMAGE_MIME, (_cb, bytes) => {
                const data = (bytes && bytes.get_data) ? bytes.get_data() : new Uint8Array(0);
                invocation.return_value(new GLib.Variant("(ay)", [data]));
              });
              return;

            case "SetImage": {
              const png = args[1];
              const buf = png instanceof Uint8Array ? png : new Uint8Array(png);
              const bytes = GLib.Bytes.new(buf);
              clipboard.set_content(St.ClipboardType.CLIPBOARD, IMAGE_MIME, bytes);
              ext._clipSeq++;
              invocation.return_value(new GLib.Variant("(b)", [true]));
              return;
            }

            case "GetSequence":
              invocation.return_value(new GLib.Variant("(u)", [ext._clipSeq >>> 0]));
              return;

            default:
              invocation.return_dbus_error(
                "org.freedesktop.DBus.Error.UnknownMethod", method);
          }
        } catch (e) {
          invocation.return_dbus_error(
            "org.freedesktop.DBus.Error.Failed", String(e));
        }
      },
      null, null,
    );

    const screenNodeInfo = Gio.DBusNodeInfo.new_for_xml(SCREEN_IFACE_XML);
    const screenIfaceInfo = screenNodeInfo.interfaces[0];

    let _screenshot = null;
    function getScreenshot() {
      if (!_screenshot) _screenshot = new Shell.Screenshot();
      return _screenshot;
    }

    this._dbusScreenRegId = Gio.DBus.session.register_object(
      OBJECT_PATH,
      screenIfaceInfo,
      (conn, sender, path, iface, method, params, invocation) => {
        try {
          const args = params.deep_unpack();
          requireAuth(args[0]);

          switch (method) {
            case "Synchronize": {
              const monitors = [];
              const display = global.display;
              const n = display.get_n_monitors();
              const ws = global.workspace_manager.get_workspace_by_index(0);
              for (let i = 0; i < n; i++) {
                const g = display.get_monitor_geometry(i);
                const wa = ws ? ws.get_work_area_for_monitor(i) : g;
                monitors.push({
                  bounds: { x: g.x, y: g.y, w: g.width, h: g.height },
                  usable: { x: wa.x, y: wa.y, w: wa.width, h: wa.height },
                });
              }
              invocation.return_value(new GLib.Variant("(s)", [JSON.stringify(monitors)]));
              return;
            }

            case "GrabScreen": {
              const x = args[1], y = args[2], w = args[3], h = args[4];
              if (w <= 0 || h <= 0) {
                invocation.return_value(new GLib.Variant("(ay)", [new Uint8Array(0)]));
                return;
              }
              const screenshot = getScreenshot();
              const stream = Gio.MemoryOutputStream.new_resizable();
              screenshot.screenshot_area(x, y, w, h, stream, (_obj, _result) => {
                try {
                  stream.close(null);
                  const bytes = stream.steal_as_bytes();
                  const data = bytes.get_data() || new Uint8Array(0);
                  invocation.return_value(new GLib.Variant("(ay)", [data]));
                } catch (e) {
                  invocation.return_dbus_error(
                    "org.freedesktop.DBus.Error.Failed", String(e));
                }
              });
              return;
            }

            default:
              invocation.return_dbus_error(
                "org.freedesktop.DBus.Error.UnknownMethod", method);
          }
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
    if (this._dbusScreenRegId) {
      Gio.DBus.session.unregister_object(this._dbusScreenRegId);
      this._dbusScreenRegId = 0;
    }
    if (this._dbusClipboardRegId) {
      Gio.DBus.session.unregister_object(this._dbusClipboardRegId);
      this._dbusClipboardRegId = 0;
    }
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
    this._pressedKeys.clear();
    this._pressedButtons.clear();
  }
}
