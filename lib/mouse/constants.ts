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

/** Map mechatron button constants to Linux evdev button codes (BTN_*). */
export function evdevButton(button: number): number | null {
  switch (button) {
    case BUTTON_LEFT:  return 0x110; // BTN_LEFT
    case BUTTON_MID:   return 0x112; // BTN_MIDDLE
    case BUTTON_RIGHT: return 0x111; // BTN_RIGHT
    case BUTTON_X1:    return 0x113; // BTN_SIDE
    case BUTTON_X2:    return 0x114; // BTN_EXTRA
    default: return null;
  }
}
