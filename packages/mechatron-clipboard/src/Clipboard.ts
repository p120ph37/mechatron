import { Image } from "mechatron-types";
import { getNative } from "./native";

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
    const result = getNative().clipboard_getImage();
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
    return getNative().clipboard_setImage(image.getWidth(), image.getHeight(), data);
  },

  getSequence(): number {
    return getNative().clipboard_getSequence();
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
