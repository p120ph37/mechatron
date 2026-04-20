import { Image } from "../types";
import { getNative } from "../backend";
import * as linuxCb from "./linux";
import { getMechanism } from "../platform";

const IS_LINUX = process.platform === "linux";

function linuxActive(): boolean {
  if (!IS_LINUX) return false;
  const m = getMechanism("clipboard");
  return m === "wl-clipboard" || m === "xclip" || m === "xsel";
}

export const Clipboard = {
  async clear(): Promise<boolean> {
    if (linuxActive()) return linuxCb.linux_clipboard_clear();
    return getNative("clipboard").clipboard_clear();
  },

  async hasText(): Promise<boolean> {
    if (linuxActive()) return linuxCb.linux_clipboard_hasText();
    return getNative("clipboard").clipboard_hasText();
  },

  async getText(): Promise<string> {
    if (linuxActive()) return linuxCb.linux_clipboard_getText();
    return getNative("clipboard").clipboard_getText();
  },

  async setText(text: string): Promise<boolean> {
    if (typeof text !== "string") throw new TypeError("Invalid arguments");
    if (linuxActive()) return linuxCb.linux_clipboard_setText(text);
    return getNative("clipboard").clipboard_setText(text);
  },

  async hasImage(): Promise<boolean> {
    if (IS_LINUX) return linuxCb.linux_clipboard_hasImage();
    return getNative("clipboard").clipboard_hasImage();
  },

  async getImage(image: Image): Promise<boolean> {
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

  async setImage(image: Image): Promise<boolean> {
    const data = image.getData();
    if (!data) return false;
    if (IS_LINUX) {
      return linuxCb.linux_clipboard_setImage(image.getWidth(), image.getHeight(), data);
    }
    return getNative("clipboard").clipboard_setImage(image.getWidth(), image.getHeight(), data);
  },

  async getSequence(): Promise<number> {
    if (IS_LINUX) return linuxCb.linux_clipboard_getSequence();
    return getNative("clipboard").clipboard_getSequence();
  },
};
