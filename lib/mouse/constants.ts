export const BUTTON_LEFT   = 0;
export const BUTTON_MID    = 1;
export const BUTTON_MIDDLE = 1;
export const BUTTON_RIGHT  = 2;
export const BUTTON_X1     = 3;
export const BUTTON_X2     = 4;

/** Map mechatron button constants to X11 button numbers. */
export function xButton(button: number): number | null {
  switch (button) {
    case BUTTON_LEFT:  return 1;
    case BUTTON_MID:   return 2;
    case BUTTON_RIGHT: return 3;
    case BUTTON_X1:    return 8;
    case BUTTON_X2:    return 9;
    default: return null;
  }
}
