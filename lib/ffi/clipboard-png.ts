/**
 * Shared ARGB ↔ PNG conversion helpers for clipboard workers.
 *
 * Both clipboard-worker.ts (X11) and clipboard-portal-worker.ts (Wayland)
 * need identical pixel-format conversion for image clipboard operations.
 * The internal pixel format is ARGB (packed u32: 0xAARRGGBB), matching
 * the format used by napi clipboard modules.
 */

export function argbToPng(width: number, height: number, data: Uint32Array): Uint8Array | null {
  try {
    // @ts-ignore — pngjs is an optional dependency
    const { PNG } = require("pngjs");
    const png = new PNG({ width, height });
    for (let i = 0; i < width * height; i++) {
      const px = data[i];
      png.data[i * 4]     = (px >> 16) & 0xFF;
      png.data[i * 4 + 1] = (px >> 8) & 0xFF;
      png.data[i * 4 + 2] = px & 0xFF;
      png.data[i * 4 + 3] = (px >> 24) & 0xFF;
    }
    return PNG.sync.write(png);
  } catch {
    return null;
  }
}

export function pngToArgb(pngData: Uint8Array | Buffer): { width: number; height: number; data: Uint32Array } | null {
  try {
    // @ts-ignore
    const { PNG } = require("pngjs");
    const png = PNG.sync.read(Buffer.from(pngData));
    const pixels = new Uint32Array(png.width * png.height);
    for (let i = 0; i < pixels.length; i++) {
      const r = png.data[i * 4];
      const g = png.data[i * 4 + 1];
      const b = png.data[i * 4 + 2];
      const a = png.data[i * 4 + 3];
      pixels[i] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    }
    return { width: png.width, height: png.height, data: pixels };
  } catch {
    return null;
  }
}
