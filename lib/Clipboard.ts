import { Image } from "./Image";
import type { NativeBackend } from "./native";

function getNative(): NativeBackend {
  const { getNativeBackend } = require("./native");
  return getNativeBackend();
}

export const Clipboard = {
  clear(): boolean {
    return getNative().clipboard_clear();
  },

  hasText(): boolean {
    return getNative().clipboard_hasText();
  },

  getText(): string {
    return getNative().clipboard_getText();
  },

  setText(text: string): boolean {
    if (typeof text !== "string") throw new TypeError("Invalid arguments");
    return getNative().clipboard_setText(text);
  },

  hasImage(): boolean {
    return getNative().clipboard_hasImage();
  },

  getImage(image: Image): boolean {
    image.destroy();
    const result = getNative().clipboard_getImage();
    if (!result) return false;
    image.create(result.width, result.height);
    const data = image.getData();
    if (data) data.set(result.data);
    return true;
  },

  setImage(image: Image): boolean {
    const data = image.getData();
    if (!data) return false;
    return getNative().clipboard_setImage(image.getWidth(), image.getHeight(), data);
  },

  getSequence(): number {
    return getNative().clipboard_getSequence();
  },
};
