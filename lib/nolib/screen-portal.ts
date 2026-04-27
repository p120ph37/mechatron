/**
 * nolib[portal] screen backend — Screenshot + DisplayConfig D-Bus.
 *
 * Capture via xdg-desktop-portal Screenshot interface (returns a full-
 * monitor PNG that we crop to the requested rect); monitor enumeration
 * via Mutter's org.gnome.Mutter.DisplayConfig.GetCurrentState.
 */

import { remoteDesktopAvailable } from "../portal/remote-desktop";
import { portalScreenshot, portalGetMonitors } from "../portal/screenshot";

if (!remoteDesktopAvailable()) {
  throw new Error("nolib/screen[portal]: requires Wayland session + D-Bus session bus");
}

interface RawRect { x: number; y: number; w: number; h: number; }
interface ScreenInfo { bounds: RawRect; usable: RawRect; }

export async function screen_synchronize(): Promise<ScreenInfo[] | null> {
  const monitors = await portalGetMonitors();
  if (!monitors) return null;
  return monitors.map(m => ({ bounds: m.bounds, usable: m.usable }));
}

export async function screen_grabScreen(
  x: number, y: number, w: number, h: number, _windowHandle?: number,
): Promise<Uint32Array | null> {
  const shot = await portalScreenshot();
  if (!shot) return null;

  const srcW = shot.width;
  const srcH = shot.height;
  const clampX = Math.max(0, Math.min(x, srcW));
  const clampY = Math.max(0, Math.min(y, srcH));
  const clampW = Math.min(w, srcW - clampX);
  const clampH = Math.min(h, srcH - clampY);
  if (clampW <= 0 || clampH <= 0) return null;

  if (clampX === 0 && clampY === 0 && clampW === srcW && clampH === srcH) {
    return shot;
  }

  const cropped = new Uint32Array(clampW * clampH);
  for (let row = 0; row < clampH; row++) {
    const srcOff = (clampY + row) * srcW + clampX;
    cropped.set(shot.subarray(srcOff, srcOff + clampW), row * clampW);
  }
  return cropped;
}
