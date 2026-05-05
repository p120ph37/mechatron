import { Image } from "../types";
import { getNative } from "../backend";

export const Clipboard = {
  async clear(): Promise<boolean> {
    return getNative("clipboard").clipboard_clear();
  },

  async hasText(): Promise<boolean> {
    return getNative("clipboard").clipboard_hasText();
  },

  async getText(): Promise<string> {
    return getNative("clipboard").clipboard_getText();
  },

  async setText(text: string): Promise<boolean> {
    if (typeof text !== "string") throw new TypeError("Invalid arguments");
    return getNative("clipboard").clipboard_setText(text);
  },

  async hasImage(): Promise<boolean> {
    return getNative("clipboard").clipboard_hasImage();
  },

  async getImage(image: Image): Promise<boolean> {
    const result = getNative("clipboard").clipboard_getImage();
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
    return getNative("clipboard").clipboard_setImage(image.getWidth(), image.getHeight(), data);
  },

  async getSequence(): Promise<number> {
    return getNative("clipboard").clipboard_getSequence();
  },
};
