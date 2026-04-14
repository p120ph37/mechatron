import { Image } from "../types";
import { getNative } from "../napi";
import * as linuxCb from "./linux";
import { getMechanism } from "../platform";

// On Linux neither the napi nor ffi native backend has a real clipboard
// implementation — both ship stubs, because X11's selection protocol
// requires a persistent owner client.  Route Linux text operations
// through the subprocess-based bridge (`lib/clipboard/linux.ts`) which
// delegates to wl-clipboard / xclip / xsel depending on session type
// and what's installed.  Non-Linux platforms continue to use the native
// backend directly — NSPasteboard on macOS, Win32 clipboard on Windows.
const IS_LINUX = process.platform === "linux";

function linuxActive(): boolean {
  if (!IS_LINUX) return false;
  const m = getMechanism("clipboard");
  return m === "wl-clipboard" || m === "xclip" || m === "xsel";
}

export const Clipboard = {
  clear(): boolean {
    if (linuxActive()) return linuxCb.linux_clipboard_clear();
    return getNative("clipboard").clipboard_clear();
  },

  hasText(): boolean {
    if (linuxActive()) return linuxCb.linux_clipboard_hasText();
    return getNative("clipboard").clipboard_hasText();
  },

  getText(): string {
    if (linuxActive()) return linuxCb.linux_clipboard_getText();
    return getNative("clipboard").clipboard_getText();
  },

  setText(text: string): boolean {
    if (typeof text !== "string") throw new TypeError("Invalid arguments");
    if (linuxActive()) return linuxCb.linux_clipboard_setText(text);
    return getNative("clipboard").clipboard_setText(text);
  },

  hasImage(): boolean {
    if (IS_LINUX) return linuxCb.linux_clipboard_hasImage();
    return getNative("clipboard").clipboard_hasImage();
  },

  getImage(image: Image): boolean {
    const result = IS_LINUX
      ? linuxCb.linux_clipboard_getImage()
      : getNative("clipboard").clipboard_getImage();
    if (!result) return false;
    image.destroy();
    image.create(result.width, result.height);
    const data = image.getData();
    if (data) data.set(result.data);
    return true;
  },

  setImage(image: Image): boolean {
    const data = image.getData();
    if (!data) return false;
    if (IS_LINUX) {
      return linuxCb.linux_clipboard_setImage(image.getWidth(), image.getHeight(), data);
    }
    return getNative("clipboard").clipboard_setImage(image.getWidth(), image.getHeight(), data);
  },

  getSequence(): number {
    if (IS_LINUX) return linuxCb.linux_clipboard_getSequence();
    return getNative("clipboard").clipboard_getSequence();
  },

  // --- Promise-based variants for modern async callers ---
  async getTextAsync(): Promise<string> {
    return new Promise((resolve) => queueMicrotask(() => resolve(Clipboard.getText())));
  },
  async setTextAsync(text: string): Promise<boolean> {
    return new Promise((resolve) => queueMicrotask(() => resolve(Clipboard.setText(text))));
  },
  async getImageAsync(image: Image): Promise<boolean> {
    return new Promise((resolve) => queueMicrotask(() => resolve(Clipboard.getImage(image))));
  },
  async setImageAsync(image: Image): Promise<boolean> {
    return new Promise((resolve) => queueMicrotask(() => resolve(Clipboard.setImage(image))));
  },
};
