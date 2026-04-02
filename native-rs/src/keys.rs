// Platform-specific key constants
#[cfg(target_os = "linux")]
mod platform {
    use std::collections::HashMap;
    use std::sync::LazyLock;

    // Linux X11 keysym values
    pub const KEY_SPACE: u32       = 0x0020;
    pub const KEY_ESCAPE: u32      = 0xFF1B;
    pub const KEY_TAB: u32         = 0xFF09;
    pub const KEY_ALT: u32         = 0xFFE9;
    pub const KEY_LALT: u32        = 0xFFE9;
    pub const KEY_RALT: u32        = 0xFFEA;
    pub const KEY_CONTROL: u32     = 0xFFE3;
    pub const KEY_LCONTROL: u32    = 0xFFE3;
    pub const KEY_RCONTROL: u32    = 0xFFE4;
    pub const KEY_SHIFT: u32       = 0xFFE1;
    pub const KEY_LSHIFT: u32      = 0xFFE1;
    pub const KEY_RSHIFT: u32      = 0xFFE2;
    pub const KEY_SYSTEM: u32      = 0xFFEB;
    pub const KEY_LSYSTEM: u32     = 0xFFEB;
    pub const KEY_RSYSTEM: u32     = 0xFFEC;
    pub const KEY_F1: u32          = 0xFFBE;
    pub const KEY_F2: u32          = 0xFFBF;
    pub const KEY_F3: u32          = 0xFFC0;
    pub const KEY_F4: u32          = 0xFFC1;
    pub const KEY_F5: u32          = 0xFFC2;
    pub const KEY_F6: u32          = 0xFFC3;
    pub const KEY_F7: u32          = 0xFFC4;
    pub const KEY_F8: u32          = 0xFFC5;
    pub const KEY_F9: u32          = 0xFFC6;
    pub const KEY_F10: u32         = 0xFFC7;
    pub const KEY_F11: u32         = 0xFFC8;
    pub const KEY_F12: u32         = 0xFFC9;
    pub const KEY_0: u32           = 0x0030;
    pub const KEY_1: u32           = 0x0031;
    pub const KEY_2: u32           = 0x0032;
    pub const KEY_3: u32           = 0x0033;
    pub const KEY_4: u32           = 0x0034;
    pub const KEY_5: u32           = 0x0035;
    pub const KEY_6: u32           = 0x0036;
    pub const KEY_7: u32           = 0x0037;
    pub const KEY_8: u32           = 0x0038;
    pub const KEY_9: u32           = 0x0039;
    pub const KEY_A: u32           = 0x0061;
    pub const KEY_B: u32           = 0x0062;
    pub const KEY_C: u32           = 0x0063;
    pub const KEY_D: u32           = 0x0064;
    pub const KEY_E: u32           = 0x0065;
    pub const KEY_F_KEY: u32       = 0x0066;
    pub const KEY_G: u32           = 0x0067;
    pub const KEY_H: u32           = 0x0068;
    pub const KEY_I: u32           = 0x0069;
    pub const KEY_J: u32           = 0x006A;
    pub const KEY_K: u32           = 0x006B;
    pub const KEY_L: u32           = 0x006C;
    pub const KEY_M: u32           = 0x006D;
    pub const KEY_N: u32           = 0x006E;
    pub const KEY_O: u32           = 0x006F;
    pub const KEY_P: u32           = 0x0070;
    pub const KEY_Q: u32           = 0x0071;
    pub const KEY_R: u32           = 0x0072;
    pub const KEY_S: u32           = 0x0073;
    pub const KEY_T: u32           = 0x0074;
    pub const KEY_U: u32           = 0x0075;
    pub const KEY_V: u32           = 0x0076;
    pub const KEY_W: u32           = 0x0077;
    pub const KEY_X: u32           = 0x0078;
    pub const KEY_Y: u32           = 0x0079;
    pub const KEY_Z: u32           = 0x007A;
    pub const KEY_GRAVE: u32       = 0x0060;
    pub const KEY_MINUS: u32       = 0x002D;
    pub const KEY_EQUAL: u32       = 0x003D;
    pub const KEY_BACKSPACE: u32   = 0xFF08;
    pub const KEY_LBRACKET: u32    = 0x005B;
    pub const KEY_RBRACKET: u32    = 0x005D;
    pub const KEY_BACKSLASH: u32   = 0x005C;
    pub const KEY_SEMICOLON: u32   = 0x003B;
    pub const KEY_QUOTE: u32       = 0x0027;
    pub const KEY_RETURN: u32      = 0xFF0D;
    pub const KEY_COMMA: u32       = 0x002C;
    pub const KEY_PERIOD: u32      = 0x002E;
    pub const KEY_SLASH: u32       = 0x002F;
    pub const KEY_LEFT: u32        = 0xFF51;
    pub const KEY_UP: u32          = 0xFF52;
    pub const KEY_RIGHT: u32       = 0xFF53;
    pub const KEY_DOWN: u32        = 0xFF54;
    pub const KEY_PRINT: u32       = 0xFF61;
    pub const KEY_PAUSE: u32       = 0xFF13;
    pub const KEY_INSERT: u32      = 0xFF63;
    pub const KEY_DELETE: u32      = 0xFFFF;
    pub const KEY_HOME: u32        = 0xFF50;
    pub const KEY_END: u32         = 0xFF57;
    pub const KEY_PAGE_UP: u32     = 0xFF55;
    pub const KEY_PAGE_DOWN: u32   = 0xFF56;
    pub const KEY_ADD: u32         = 0xFFAB;
    pub const KEY_SUBTRACT: u32    = 0xFFAD;
    pub const KEY_MULTIPLY: u32    = 0xFFAA;
    pub const KEY_DIVIDE: u32      = 0xFFAF;
    pub const KEY_DECIMAL: u32     = 0xFFAE;
    pub const KEY_ENTER: u32       = 0xFF8D;
    pub const KEY_NUM0: u32        = 0xFFB0;
    pub const KEY_NUM1: u32        = 0xFFB1;
    pub const KEY_NUM2: u32        = 0xFFB2;
    pub const KEY_NUM3: u32        = 0xFFB3;
    pub const KEY_NUM4: u32        = 0xFFB4;
    pub const KEY_NUM5: u32        = 0xFFB5;
    pub const KEY_NUM6: u32        = 0xFFB6;
    pub const KEY_NUM7: u32        = 0xFFB7;
    pub const KEY_NUM8: u32        = 0xFFB8;
    pub const KEY_NUM9: u32        = 0xFFB9;
    pub const KEY_CAPS_LOCK: u32   = 0xFFE5;
    pub const KEY_SCROLL_LOCK: u32 = 0xFF14;
    pub const KEY_NUM_LOCK: u32    = 0xFF7F;

    // All unique key values for getState iteration (skip aliases like KEY_ALT==KEY_LALT)
    pub static ALL_KEYS: &[u32] = &[
        KEY_SPACE, KEY_ESCAPE, KEY_TAB,
        KEY_ALT, KEY_RALT, KEY_CONTROL, KEY_RCONTROL,
        KEY_SHIFT, KEY_RSHIFT, KEY_SYSTEM, KEY_RSYSTEM,
        KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6,
        KEY_F7, KEY_F8, KEY_F9, KEY_F10, KEY_F11, KEY_F12,
        KEY_0, KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9,
        KEY_A, KEY_B, KEY_C, KEY_D, KEY_E, KEY_F_KEY, KEY_G,
        KEY_H, KEY_I, KEY_J, KEY_K, KEY_L, KEY_M, KEY_N,
        KEY_O, KEY_P, KEY_Q, KEY_R, KEY_S, KEY_T, KEY_U,
        KEY_V, KEY_W, KEY_X, KEY_Y, KEY_Z,
        KEY_GRAVE, KEY_MINUS, KEY_EQUAL, KEY_BACKSPACE,
        KEY_LBRACKET, KEY_RBRACKET, KEY_BACKSLASH,
        KEY_SEMICOLON, KEY_QUOTE, KEY_RETURN,
        KEY_COMMA, KEY_PERIOD, KEY_SLASH,
        KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN,
        KEY_PRINT, KEY_PAUSE, KEY_INSERT, KEY_DELETE,
        KEY_HOME, KEY_END, KEY_PAGE_UP, KEY_PAGE_DOWN,
        KEY_ADD, KEY_SUBTRACT, KEY_MULTIPLY, KEY_DIVIDE, KEY_DECIMAL, KEY_ENTER,
        KEY_NUM0, KEY_NUM1, KEY_NUM2, KEY_NUM3, KEY_NUM4,
        KEY_NUM5, KEY_NUM6, KEY_NUM7, KEY_NUM8, KEY_NUM9,
        KEY_CAPS_LOCK, KEY_SCROLL_LOCK, KEY_NUM_LOCK,
    ];

    // Key name -> keycode mapping for Keyboard::Compile
    pub static KEY_NAMES: LazyLock<HashMap<&'static str, u32>> = LazyLock::new(|| {
        let mut m = HashMap::new();
        m.insert(" ", KEY_SPACE);
        m.insert("SPACE", KEY_SPACE);
        m.insert("SPC", KEY_SPACE);
        m.insert("ESCAPE", KEY_ESCAPE);
        m.insert("ESC", KEY_ESCAPE);

        m.insert("TAB", KEY_TAB);
        m.insert("ALT", KEY_ALT);
        m.insert("LALT", KEY_LALT);
        m.insert("RALT", KEY_RALT);
        m.insert("CONTROL", KEY_CONTROL);
        m.insert("LCONTROL", KEY_LCONTROL);
        m.insert("RCONTROL", KEY_RCONTROL);
        m.insert("CTRL", KEY_CONTROL);
        m.insert("LCTRL", KEY_LCONTROL);
        m.insert("RCTRL", KEY_RCONTROL);
        m.insert("SHIFT", KEY_SHIFT);
        m.insert("LSHIFT", KEY_LSHIFT);
        m.insert("RSHIFT", KEY_RSHIFT);
        m.insert("SYSTEM", KEY_SYSTEM);
        m.insert("LSYSTEM", KEY_LSYSTEM);
        m.insert("RSYSTEM", KEY_RSYSTEM);

        m.insert("F1", KEY_F1);
        m.insert("F2", KEY_F2);
        m.insert("F3", KEY_F3);
        m.insert("F4", KEY_F4);
        m.insert("F5", KEY_F5);
        m.insert("F6", KEY_F6);
        m.insert("F7", KEY_F7);
        m.insert("F8", KEY_F8);
        m.insert("F9", KEY_F9);
        m.insert("F10", KEY_F10);
        m.insert("F11", KEY_F11);
        m.insert("F12", KEY_F12);

        m.insert("0", KEY_0);
        m.insert("1", KEY_1);
        m.insert("2", KEY_2);
        m.insert("3", KEY_3);
        m.insert("4", KEY_4);
        m.insert("5", KEY_5);
        m.insert("6", KEY_6);
        m.insert("7", KEY_7);
        m.insert("8", KEY_8);
        m.insert("9", KEY_9);

        for (name, val) in [
            ("A", KEY_A), ("B", KEY_B), ("C", KEY_C), ("D", KEY_D),
            ("E", KEY_E), ("F", KEY_F_KEY), ("G", KEY_G), ("H", KEY_H),
            ("I", KEY_I), ("J", KEY_J), ("K", KEY_K), ("L", KEY_L),
            ("M", KEY_M), ("N", KEY_N), ("O", KEY_O), ("P", KEY_P),
            ("Q", KEY_Q), ("R", KEY_R), ("S", KEY_S), ("T", KEY_T),
            ("U", KEY_U), ("V", KEY_V), ("W", KEY_W), ("X", KEY_X),
            ("Y", KEY_Y), ("Z", KEY_Z),
        ] {
            m.insert(name, val);
        }

        // Punctuation - single char and named
        m.insert("`", KEY_GRAVE);
        m.insert("-", KEY_MINUS);
        m.insert("=", KEY_EQUAL);
        m.insert("<", KEY_BACKSPACE);
        m.insert("[", KEY_LBRACKET);
        m.insert("]", KEY_RBRACKET);
        m.insert("\\", KEY_BACKSLASH);
        m.insert(";", KEY_SEMICOLON);
        m.insert("'", KEY_QUOTE);
        m.insert("~", KEY_RETURN);
        m.insert(",", KEY_COMMA);
        m.insert(".", KEY_PERIOD);
        m.insert("/", KEY_SLASH);

        m.insert("GRAVE", KEY_GRAVE);
        m.insert("MINUS", KEY_MINUS);
        m.insert("EQUAL", KEY_EQUAL);
        m.insert("BACKSPACE", KEY_BACKSPACE);
        m.insert("BS", KEY_BACKSPACE);
        m.insert("LBRACKET", KEY_LBRACKET);
        m.insert("RBRACKET", KEY_RBRACKET);
        m.insert("BACKSLASH", KEY_BACKSLASH);
        m.insert("SEMICOLON", KEY_SEMICOLON);
        m.insert("QUOTE", KEY_QUOTE);
        m.insert("RETURN", KEY_RETURN);
        m.insert("COMMA", KEY_COMMA);
        m.insert("PERIOD", KEY_PERIOD);
        m.insert("SLASH", KEY_SLASH);

        m.insert("LEFT", KEY_LEFT);
        m.insert("UP", KEY_UP);
        m.insert("RIGHT", KEY_RIGHT);
        m.insert("DOWN", KEY_DOWN);

        m.insert("PRINT", KEY_PRINT);
        m.insert("PAUSE", KEY_PAUSE);
        m.insert("BREAK", KEY_PAUSE);
        m.insert("INSERT", KEY_INSERT);
        m.insert("INS", KEY_INSERT);
        m.insert("DELETE", KEY_DELETE);
        m.insert("DEL", KEY_DELETE);
        m.insert("HOME", KEY_HOME);
        m.insert("END", KEY_END);
        m.insert("PAGEUP", KEY_PAGE_UP);
        m.insert("PGUP", KEY_PAGE_UP);
        m.insert("PAGEDOWN", KEY_PAGE_DOWN);
        m.insert("PGDN", KEY_PAGE_DOWN);

        m.insert("NUM+", KEY_ADD);
        m.insert("NUM-", KEY_SUBTRACT);
        m.insert("NUM*", KEY_MULTIPLY);
        m.insert("NUM/", KEY_DIVIDE);
        m.insert("NUM.", KEY_DECIMAL);
        m.insert("NUM~", KEY_ENTER);

        m.insert("ADD", KEY_ADD);
        m.insert("SUBTRACT", KEY_SUBTRACT);
        m.insert("MULTIPLY", KEY_MULTIPLY);
        m.insert("DIVIDE", KEY_DIVIDE);
        m.insert("DECIMAL", KEY_DECIMAL);
        m.insert("ENTER", KEY_ENTER);

        m.insert("NUM0", KEY_NUM0);
        m.insert("NUM1", KEY_NUM1);
        m.insert("NUM2", KEY_NUM2);
        m.insert("NUM3", KEY_NUM3);
        m.insert("NUM4", KEY_NUM4);
        m.insert("NUM5", KEY_NUM5);
        m.insert("NUM6", KEY_NUM6);
        m.insert("NUM7", KEY_NUM7);
        m.insert("NUM8", KEY_NUM8);
        m.insert("NUM9", KEY_NUM9);

        m.insert("CAPSLOCK", KEY_CAPS_LOCK);
        m.insert("SCROLLLOCK", KEY_SCROLL_LOCK);
        m.insert("NUMLOCK", KEY_NUM_LOCK);

        m
    });
}

#[cfg(target_os = "macos")]
mod platform {
    use std::collections::HashMap;
    use std::sync::LazyLock;

    // macOS kVK_ virtual keycodes
    pub const KEY_SPACE: u32       = 0x31;
    pub const KEY_ESCAPE: u32      = 0x35;
    pub const KEY_TAB: u32         = 0x30;
    pub const KEY_ALT: u32         = 0x3A;
    pub const KEY_LALT: u32        = 0x3A;
    pub const KEY_RALT: u32        = 0x3D;
    pub const KEY_CONTROL: u32     = 0x3B;
    pub const KEY_LCONTROL: u32    = 0x3B;
    pub const KEY_RCONTROL: u32    = 0x3E;
    pub const KEY_SHIFT: u32       = 0x38;
    pub const KEY_LSHIFT: u32      = 0x38;
    pub const KEY_RSHIFT: u32      = 0x3C;
    pub const KEY_SYSTEM: u32      = 0x37;
    pub const KEY_LSYSTEM: u32     = 0x37;
    pub const KEY_RSYSTEM: u32     = 0x36;
    pub const KEY_F1: u32          = 0x7A;
    pub const KEY_F2: u32          = 0x78;
    pub const KEY_F3: u32          = 0x63;
    pub const KEY_F4: u32          = 0x76;
    pub const KEY_F5: u32          = 0x60;
    pub const KEY_F6: u32          = 0x61;
    pub const KEY_F7: u32          = 0x62;
    pub const KEY_F8: u32          = 0x64;
    pub const KEY_F9: u32          = 0x65;
    pub const KEY_F10: u32         = 0x6D;
    pub const KEY_F11: u32         = 0x67;
    pub const KEY_F12: u32         = 0x6F;
    pub const KEY_0: u32           = 0x1D;
    pub const KEY_1: u32           = 0x12;
    pub const KEY_2: u32           = 0x13;
    pub const KEY_3: u32           = 0x14;
    pub const KEY_4: u32           = 0x15;
    pub const KEY_5: u32           = 0x17;
    pub const KEY_6: u32           = 0x16;
    pub const KEY_7: u32           = 0x1A;
    pub const KEY_8: u32           = 0x1C;
    pub const KEY_9: u32           = 0x19;
    pub const KEY_A: u32           = 0x00;
    pub const KEY_B: u32           = 0x0B;
    pub const KEY_C: u32           = 0x08;
    pub const KEY_D: u32           = 0x02;
    pub const KEY_E: u32           = 0x0E;
    pub const KEY_F_KEY: u32       = 0x03;
    pub const KEY_G: u32           = 0x05;
    pub const KEY_H: u32           = 0x04;
    pub const KEY_I: u32           = 0x22;
    pub const KEY_J: u32           = 0x26;
    pub const KEY_K: u32           = 0x28;
    pub const KEY_L: u32           = 0x25;
    pub const KEY_M: u32           = 0x2E;
    pub const KEY_N: u32           = 0x2D;
    pub const KEY_O: u32           = 0x1F;
    pub const KEY_P: u32           = 0x23;
    pub const KEY_Q: u32           = 0x0C;
    pub const KEY_R: u32           = 0x0F;
    pub const KEY_S: u32           = 0x01;
    pub const KEY_T: u32           = 0x11;
    pub const KEY_U: u32           = 0x20;
    pub const KEY_V: u32           = 0x09;
    pub const KEY_W: u32           = 0x0D;
    pub const KEY_X: u32           = 0x07;
    pub const KEY_Y: u32           = 0x10;
    pub const KEY_Z: u32           = 0x06;
    pub const KEY_GRAVE: u32       = 0x32;
    pub const KEY_MINUS: u32       = 0x1B;
    pub const KEY_EQUAL: u32       = 0x18;
    pub const KEY_BACKSPACE: u32   = 0x33;
    pub const KEY_LBRACKET: u32    = 0x21;
    pub const KEY_RBRACKET: u32    = 0x1E;
    pub const KEY_BACKSLASH: u32   = 0x2A;
    pub const KEY_SEMICOLON: u32   = 0x29;
    pub const KEY_QUOTE: u32       = 0x27;
    pub const KEY_RETURN: u32      = 0x24;
    pub const KEY_COMMA: u32       = 0x2B;
    pub const KEY_PERIOD: u32      = 0x2F;
    pub const KEY_SLASH: u32       = 0x2C;
    pub const KEY_LEFT: u32        = 0x7B;
    pub const KEY_UP: u32          = 0x7E;
    pub const KEY_RIGHT: u32       = 0x7C;
    pub const KEY_DOWN: u32        = 0x7D;
    pub const KEY_PRINT: u32       = 0x69;
    pub const KEY_PAUSE: u32       = 0x71;
    pub const KEY_INSERT: u32      = 0x72;
    pub const KEY_DELETE: u32      = 0x75;
    pub const KEY_HOME: u32        = 0x73;
    pub const KEY_END: u32         = 0x77;
    pub const KEY_PAGE_UP: u32     = 0x74;
    pub const KEY_PAGE_DOWN: u32   = 0x79;
    pub const KEY_ADD: u32         = 0x45;
    pub const KEY_SUBTRACT: u32    = 0x4E;
    pub const KEY_MULTIPLY: u32    = 0x43;
    pub const KEY_DIVIDE: u32      = 0x4B;
    pub const KEY_DECIMAL: u32     = 0x41;
    pub const KEY_ENTER: u32       = 0x4C;
    pub const KEY_NUM0: u32        = 0x52;
    pub const KEY_NUM1: u32        = 0x53;
    pub const KEY_NUM2: u32        = 0x54;
    pub const KEY_NUM3: u32        = 0x55;
    pub const KEY_NUM4: u32        = 0x56;
    pub const KEY_NUM5: u32        = 0x57;
    pub const KEY_NUM6: u32        = 0x58;
    pub const KEY_NUM7: u32        = 0x59;
    pub const KEY_NUM8: u32        = 0x5B;
    pub const KEY_NUM9: u32        = 0x5C;
    pub const KEY_CAPS_LOCK: u32   = 0x39;
    pub const KEY_SCROLL_LOCK: u32 = 0x6B;
    pub const KEY_NUM_LOCK: u32    = 0x47;

    // All unique key values for getState iteration (skip aliases like KEY_ALT==KEY_LALT)
    pub static ALL_KEYS: &[u32] = &[
        KEY_SPACE, KEY_ESCAPE, KEY_TAB,
        KEY_ALT, KEY_RALT, KEY_CONTROL, KEY_RCONTROL,
        KEY_SHIFT, KEY_RSHIFT, KEY_SYSTEM, KEY_RSYSTEM,
        KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6,
        KEY_F7, KEY_F8, KEY_F9, KEY_F10, KEY_F11, KEY_F12,
        KEY_0, KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9,
        KEY_A, KEY_B, KEY_C, KEY_D, KEY_E, KEY_F_KEY, KEY_G,
        KEY_H, KEY_I, KEY_J, KEY_K, KEY_L, KEY_M, KEY_N,
        KEY_O, KEY_P, KEY_Q, KEY_R, KEY_S, KEY_T, KEY_U,
        KEY_V, KEY_W, KEY_X, KEY_Y, KEY_Z,
        KEY_GRAVE, KEY_MINUS, KEY_EQUAL, KEY_BACKSPACE,
        KEY_LBRACKET, KEY_RBRACKET, KEY_BACKSLASH,
        KEY_SEMICOLON, KEY_QUOTE, KEY_RETURN,
        KEY_COMMA, KEY_PERIOD, KEY_SLASH,
        KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN,
        KEY_PRINT, KEY_PAUSE, KEY_INSERT, KEY_DELETE,
        KEY_HOME, KEY_END, KEY_PAGE_UP, KEY_PAGE_DOWN,
        KEY_ADD, KEY_SUBTRACT, KEY_MULTIPLY, KEY_DIVIDE, KEY_DECIMAL, KEY_ENTER,
        KEY_NUM0, KEY_NUM1, KEY_NUM2, KEY_NUM3, KEY_NUM4,
        KEY_NUM5, KEY_NUM6, KEY_NUM7, KEY_NUM8, KEY_NUM9,
        KEY_CAPS_LOCK, KEY_SCROLL_LOCK, KEY_NUM_LOCK,
    ];

    // Key name -> keycode mapping for Keyboard::Compile
    pub static KEY_NAMES: LazyLock<HashMap<&'static str, u32>> = LazyLock::new(|| {
        let mut m = HashMap::new();
        m.insert(" ", KEY_SPACE);
        m.insert("SPACE", KEY_SPACE);
        m.insert("SPC", KEY_SPACE);
        m.insert("ESCAPE", KEY_ESCAPE);
        m.insert("ESC", KEY_ESCAPE);

        m.insert("TAB", KEY_TAB);
        m.insert("ALT", KEY_ALT);
        m.insert("LALT", KEY_LALT);
        m.insert("RALT", KEY_RALT);
        m.insert("CONTROL", KEY_CONTROL);
        m.insert("LCONTROL", KEY_LCONTROL);
        m.insert("RCONTROL", KEY_RCONTROL);
        m.insert("CTRL", KEY_CONTROL);
        m.insert("LCTRL", KEY_LCONTROL);
        m.insert("RCTRL", KEY_RCONTROL);
        m.insert("SHIFT", KEY_SHIFT);
        m.insert("LSHIFT", KEY_LSHIFT);
        m.insert("RSHIFT", KEY_RSHIFT);
        m.insert("SYSTEM", KEY_SYSTEM);
        m.insert("LSYSTEM", KEY_LSYSTEM);
        m.insert("RSYSTEM", KEY_RSYSTEM);

        m.insert("F1", KEY_F1);
        m.insert("F2", KEY_F2);
        m.insert("F3", KEY_F3);
        m.insert("F4", KEY_F4);
        m.insert("F5", KEY_F5);
        m.insert("F6", KEY_F6);
        m.insert("F7", KEY_F7);
        m.insert("F8", KEY_F8);
        m.insert("F9", KEY_F9);
        m.insert("F10", KEY_F10);
        m.insert("F11", KEY_F11);
        m.insert("F12", KEY_F12);

        m.insert("0", KEY_0);
        m.insert("1", KEY_1);
        m.insert("2", KEY_2);
        m.insert("3", KEY_3);
        m.insert("4", KEY_4);
        m.insert("5", KEY_5);
        m.insert("6", KEY_6);
        m.insert("7", KEY_7);
        m.insert("8", KEY_8);
        m.insert("9", KEY_9);

        for (name, val) in [
            ("A", KEY_A), ("B", KEY_B), ("C", KEY_C), ("D", KEY_D),
            ("E", KEY_E), ("F", KEY_F_KEY), ("G", KEY_G), ("H", KEY_H),
            ("I", KEY_I), ("J", KEY_J), ("K", KEY_K), ("L", KEY_L),
            ("M", KEY_M), ("N", KEY_N), ("O", KEY_O), ("P", KEY_P),
            ("Q", KEY_Q), ("R", KEY_R), ("S", KEY_S), ("T", KEY_T),
            ("U", KEY_U), ("V", KEY_V), ("W", KEY_W), ("X", KEY_X),
            ("Y", KEY_Y), ("Z", KEY_Z),
        ] {
            m.insert(name, val);
        }

        // Punctuation - single char and named
        m.insert("`", KEY_GRAVE);
        m.insert("-", KEY_MINUS);
        m.insert("=", KEY_EQUAL);
        m.insert("<", KEY_BACKSPACE);
        m.insert("[", KEY_LBRACKET);
        m.insert("]", KEY_RBRACKET);
        m.insert("\\", KEY_BACKSLASH);
        m.insert(";", KEY_SEMICOLON);
        m.insert("'", KEY_QUOTE);
        m.insert("~", KEY_RETURN);
        m.insert(",", KEY_COMMA);
        m.insert(".", KEY_PERIOD);
        m.insert("/", KEY_SLASH);

        m.insert("GRAVE", KEY_GRAVE);
        m.insert("MINUS", KEY_MINUS);
        m.insert("EQUAL", KEY_EQUAL);
        m.insert("BACKSPACE", KEY_BACKSPACE);
        m.insert("BS", KEY_BACKSPACE);
        m.insert("LBRACKET", KEY_LBRACKET);
        m.insert("RBRACKET", KEY_RBRACKET);
        m.insert("BACKSLASH", KEY_BACKSLASH);
        m.insert("SEMICOLON", KEY_SEMICOLON);
        m.insert("QUOTE", KEY_QUOTE);
        m.insert("RETURN", KEY_RETURN);
        m.insert("COMMA", KEY_COMMA);
        m.insert("PERIOD", KEY_PERIOD);
        m.insert("SLASH", KEY_SLASH);

        m.insert("LEFT", KEY_LEFT);
        m.insert("UP", KEY_UP);
        m.insert("RIGHT", KEY_RIGHT);
        m.insert("DOWN", KEY_DOWN);

        m.insert("PRINT", KEY_PRINT);
        m.insert("PAUSE", KEY_PAUSE);
        m.insert("BREAK", KEY_PAUSE);
        m.insert("INSERT", KEY_INSERT);
        m.insert("INS", KEY_INSERT);
        m.insert("DELETE", KEY_DELETE);
        m.insert("DEL", KEY_DELETE);
        m.insert("HOME", KEY_HOME);
        m.insert("END", KEY_END);
        m.insert("PAGEUP", KEY_PAGE_UP);
        m.insert("PGUP", KEY_PAGE_UP);
        m.insert("PAGEDOWN", KEY_PAGE_DOWN);
        m.insert("PGDN", KEY_PAGE_DOWN);

        m.insert("NUM+", KEY_ADD);
        m.insert("NUM-", KEY_SUBTRACT);
        m.insert("NUM*", KEY_MULTIPLY);
        m.insert("NUM/", KEY_DIVIDE);
        m.insert("NUM.", KEY_DECIMAL);
        m.insert("NUM~", KEY_ENTER);

        m.insert("ADD", KEY_ADD);
        m.insert("SUBTRACT", KEY_SUBTRACT);
        m.insert("MULTIPLY", KEY_MULTIPLY);
        m.insert("DIVIDE", KEY_DIVIDE);
        m.insert("DECIMAL", KEY_DECIMAL);
        m.insert("ENTER", KEY_ENTER);

        m.insert("NUM0", KEY_NUM0);
        m.insert("NUM1", KEY_NUM1);
        m.insert("NUM2", KEY_NUM2);
        m.insert("NUM3", KEY_NUM3);
        m.insert("NUM4", KEY_NUM4);
        m.insert("NUM5", KEY_NUM5);
        m.insert("NUM6", KEY_NUM6);
        m.insert("NUM7", KEY_NUM7);
        m.insert("NUM8", KEY_NUM8);
        m.insert("NUM9", KEY_NUM9);

        m.insert("CAPSLOCK", KEY_CAPS_LOCK);
        m.insert("SCROLLLOCK", KEY_SCROLL_LOCK);
        m.insert("NUMLOCK", KEY_NUM_LOCK);

        m
    });
}

#[cfg(target_os = "windows")]
mod platform {
    use std::collections::HashMap;
    use std::sync::LazyLock;

    // Windows VK_ virtual key codes
    pub const KEY_SPACE: u32       = 0x20;
    pub const KEY_ESCAPE: u32      = 0x1B;
    pub const KEY_TAB: u32         = 0x09;
    pub const KEY_ALT: u32         = 0x12;
    pub const KEY_LALT: u32        = 0xA4;
    pub const KEY_RALT: u32        = 0xA5;
    pub const KEY_CONTROL: u32     = 0x11;
    pub const KEY_LCONTROL: u32    = 0xA2;
    pub const KEY_RCONTROL: u32    = 0xA3;
    pub const KEY_SHIFT: u32       = 0x10;
    pub const KEY_LSHIFT: u32      = 0xA0;
    pub const KEY_RSHIFT: u32      = 0xA1;
    pub const KEY_SYSTEM: u32      = 0x5B;
    pub const KEY_LSYSTEM: u32     = 0x5B;
    pub const KEY_RSYSTEM: u32     = 0x5C;
    pub const KEY_F1: u32          = 0x70;
    pub const KEY_F2: u32          = 0x71;
    pub const KEY_F3: u32          = 0x72;
    pub const KEY_F4: u32          = 0x73;
    pub const KEY_F5: u32          = 0x74;
    pub const KEY_F6: u32          = 0x75;
    pub const KEY_F7: u32          = 0x76;
    pub const KEY_F8: u32          = 0x77;
    pub const KEY_F9: u32          = 0x78;
    pub const KEY_F10: u32         = 0x79;
    pub const KEY_F11: u32         = 0x7A;
    pub const KEY_F12: u32         = 0x7B;
    pub const KEY_0: u32           = 0x30;
    pub const KEY_1: u32           = 0x31;
    pub const KEY_2: u32           = 0x32;
    pub const KEY_3: u32           = 0x33;
    pub const KEY_4: u32           = 0x34;
    pub const KEY_5: u32           = 0x35;
    pub const KEY_6: u32           = 0x36;
    pub const KEY_7: u32           = 0x37;
    pub const KEY_8: u32           = 0x38;
    pub const KEY_9: u32           = 0x39;
    pub const KEY_A: u32           = 0x41;
    pub const KEY_B: u32           = 0x42;
    pub const KEY_C: u32           = 0x43;
    pub const KEY_D: u32           = 0x44;
    pub const KEY_E: u32           = 0x45;
    pub const KEY_F_KEY: u32       = 0x46;
    pub const KEY_G: u32           = 0x47;
    pub const KEY_H: u32           = 0x48;
    pub const KEY_I: u32           = 0x49;
    pub const KEY_J: u32           = 0x4A;
    pub const KEY_K: u32           = 0x4B;
    pub const KEY_L: u32           = 0x4C;
    pub const KEY_M: u32           = 0x4D;
    pub const KEY_N: u32           = 0x4E;
    pub const KEY_O: u32           = 0x4F;
    pub const KEY_P: u32           = 0x50;
    pub const KEY_Q: u32           = 0x51;
    pub const KEY_R: u32           = 0x52;
    pub const KEY_S: u32           = 0x53;
    pub const KEY_T: u32           = 0x54;
    pub const KEY_U: u32           = 0x55;
    pub const KEY_V: u32           = 0x56;
    pub const KEY_W: u32           = 0x57;
    pub const KEY_X: u32           = 0x58;
    pub const KEY_Y: u32           = 0x59;
    pub const KEY_Z: u32           = 0x5A;
    pub const KEY_GRAVE: u32       = 0xC0;
    pub const KEY_MINUS: u32       = 0xBD;
    pub const KEY_EQUAL: u32       = 0xBB;
    pub const KEY_BACKSPACE: u32   = 0x08;
    pub const KEY_LBRACKET: u32    = 0xDB;
    pub const KEY_RBRACKET: u32    = 0xDD;
    pub const KEY_BACKSLASH: u32   = 0xDC;
    pub const KEY_SEMICOLON: u32   = 0xBA;
    pub const KEY_QUOTE: u32       = 0xDE;
    pub const KEY_RETURN: u32      = 0x0D;
    pub const KEY_COMMA: u32       = 0xBC;
    pub const KEY_PERIOD: u32      = 0xBE;
    pub const KEY_SLASH: u32       = 0xBF;
    pub const KEY_LEFT: u32        = 0x25;
    pub const KEY_UP: u32          = 0x26;
    pub const KEY_RIGHT: u32       = 0x27;
    pub const KEY_DOWN: u32        = 0x28;
    pub const KEY_PRINT: u32       = 0x2C;
    pub const KEY_PAUSE: u32       = 0x13;
    pub const KEY_INSERT: u32      = 0x2D;
    pub const KEY_DELETE: u32      = 0x2E;
    pub const KEY_HOME: u32        = 0x24;
    pub const KEY_END: u32         = 0x23;
    pub const KEY_PAGE_UP: u32     = 0x21;
    pub const KEY_PAGE_DOWN: u32   = 0x22;
    pub const KEY_ADD: u32         = 0x6B;
    pub const KEY_SUBTRACT: u32    = 0x6D;
    pub const KEY_MULTIPLY: u32    = 0x6A;
    pub const KEY_DIVIDE: u32      = 0x6F;
    pub const KEY_DECIMAL: u32     = 0x6E;
    pub const KEY_ENTER: u32       = 0x0D;
    pub const KEY_NUM0: u32        = 0x60;
    pub const KEY_NUM1: u32        = 0x61;
    pub const KEY_NUM2: u32        = 0x62;
    pub const KEY_NUM3: u32        = 0x63;
    pub const KEY_NUM4: u32        = 0x64;
    pub const KEY_NUM5: u32        = 0x65;
    pub const KEY_NUM6: u32        = 0x66;
    pub const KEY_NUM7: u32        = 0x67;
    pub const KEY_NUM8: u32        = 0x68;
    pub const KEY_NUM9: u32        = 0x69;
    pub const KEY_CAPS_LOCK: u32   = 0x14;
    pub const KEY_SCROLL_LOCK: u32 = 0x91;
    pub const KEY_NUM_LOCK: u32    = 0x90;

    // All unique key values for getState iteration (skip aliases like KEY_SYSTEM==KEY_LSYSTEM)
    pub static ALL_KEYS: &[u32] = &[
        KEY_SPACE, KEY_ESCAPE, KEY_TAB,
        KEY_ALT, KEY_LALT, KEY_RALT, KEY_CONTROL, KEY_LCONTROL, KEY_RCONTROL,
        KEY_SHIFT, KEY_LSHIFT, KEY_RSHIFT, KEY_SYSTEM, KEY_RSYSTEM,
        KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6,
        KEY_F7, KEY_F8, KEY_F9, KEY_F10, KEY_F11, KEY_F12,
        KEY_0, KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9,
        KEY_A, KEY_B, KEY_C, KEY_D, KEY_E, KEY_F_KEY, KEY_G,
        KEY_H, KEY_I, KEY_J, KEY_K, KEY_L, KEY_M, KEY_N,
        KEY_O, KEY_P, KEY_Q, KEY_R, KEY_S, KEY_T, KEY_U,
        KEY_V, KEY_W, KEY_X, KEY_Y, KEY_Z,
        KEY_GRAVE, KEY_MINUS, KEY_EQUAL, KEY_BACKSPACE,
        KEY_LBRACKET, KEY_RBRACKET, KEY_BACKSLASH,
        KEY_SEMICOLON, KEY_QUOTE, KEY_RETURN,
        KEY_COMMA, KEY_PERIOD, KEY_SLASH,
        KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN,
        KEY_PRINT, KEY_PAUSE, KEY_INSERT, KEY_DELETE,
        KEY_HOME, KEY_END, KEY_PAGE_UP, KEY_PAGE_DOWN,
        KEY_ADD, KEY_SUBTRACT, KEY_MULTIPLY, KEY_DIVIDE, KEY_DECIMAL, KEY_ENTER,
        KEY_NUM0, KEY_NUM1, KEY_NUM2, KEY_NUM3, KEY_NUM4,
        KEY_NUM5, KEY_NUM6, KEY_NUM7, KEY_NUM8, KEY_NUM9,
        KEY_CAPS_LOCK, KEY_SCROLL_LOCK, KEY_NUM_LOCK,
    ];

    // Key name -> keycode mapping for Keyboard::Compile
    pub static KEY_NAMES: LazyLock<HashMap<&'static str, u32>> = LazyLock::new(|| {
        let mut m = HashMap::new();
        m.insert(" ", KEY_SPACE);
        m.insert("SPACE", KEY_SPACE);
        m.insert("SPC", KEY_SPACE);
        m.insert("ESCAPE", KEY_ESCAPE);
        m.insert("ESC", KEY_ESCAPE);

        m.insert("TAB", KEY_TAB);
        m.insert("ALT", KEY_ALT);
        m.insert("LALT", KEY_LALT);
        m.insert("RALT", KEY_RALT);
        m.insert("CONTROL", KEY_CONTROL);
        m.insert("LCONTROL", KEY_LCONTROL);
        m.insert("RCONTROL", KEY_RCONTROL);
        m.insert("CTRL", KEY_CONTROL);
        m.insert("LCTRL", KEY_LCONTROL);
        m.insert("RCTRL", KEY_RCONTROL);
        m.insert("SHIFT", KEY_SHIFT);
        m.insert("LSHIFT", KEY_LSHIFT);
        m.insert("RSHIFT", KEY_RSHIFT);
        m.insert("SYSTEM", KEY_SYSTEM);
        m.insert("LSYSTEM", KEY_LSYSTEM);
        m.insert("RSYSTEM", KEY_RSYSTEM);

        m.insert("F1", KEY_F1);
        m.insert("F2", KEY_F2);
        m.insert("F3", KEY_F3);
        m.insert("F4", KEY_F4);
        m.insert("F5", KEY_F5);
        m.insert("F6", KEY_F6);
        m.insert("F7", KEY_F7);
        m.insert("F8", KEY_F8);
        m.insert("F9", KEY_F9);
        m.insert("F10", KEY_F10);
        m.insert("F11", KEY_F11);
        m.insert("F12", KEY_F12);

        m.insert("0", KEY_0);
        m.insert("1", KEY_1);
        m.insert("2", KEY_2);
        m.insert("3", KEY_3);
        m.insert("4", KEY_4);
        m.insert("5", KEY_5);
        m.insert("6", KEY_6);
        m.insert("7", KEY_7);
        m.insert("8", KEY_8);
        m.insert("9", KEY_9);

        for (name, val) in [
            ("A", KEY_A), ("B", KEY_B), ("C", KEY_C), ("D", KEY_D),
            ("E", KEY_E), ("F", KEY_F_KEY), ("G", KEY_G), ("H", KEY_H),
            ("I", KEY_I), ("J", KEY_J), ("K", KEY_K), ("L", KEY_L),
            ("M", KEY_M), ("N", KEY_N), ("O", KEY_O), ("P", KEY_P),
            ("Q", KEY_Q), ("R", KEY_R), ("S", KEY_S), ("T", KEY_T),
            ("U", KEY_U), ("V", KEY_V), ("W", KEY_W), ("X", KEY_X),
            ("Y", KEY_Y), ("Z", KEY_Z),
        ] {
            m.insert(name, val);
        }

        // Punctuation - single char and named
        m.insert("`", KEY_GRAVE);
        m.insert("-", KEY_MINUS);
        m.insert("=", KEY_EQUAL);
        m.insert("<", KEY_BACKSPACE);
        m.insert("[", KEY_LBRACKET);
        m.insert("]", KEY_RBRACKET);
        m.insert("\\", KEY_BACKSLASH);
        m.insert(";", KEY_SEMICOLON);
        m.insert("'", KEY_QUOTE);
        m.insert("~", KEY_RETURN);
        m.insert(",", KEY_COMMA);
        m.insert(".", KEY_PERIOD);
        m.insert("/", KEY_SLASH);

        m.insert("GRAVE", KEY_GRAVE);
        m.insert("MINUS", KEY_MINUS);
        m.insert("EQUAL", KEY_EQUAL);
        m.insert("BACKSPACE", KEY_BACKSPACE);
        m.insert("BS", KEY_BACKSPACE);
        m.insert("LBRACKET", KEY_LBRACKET);
        m.insert("RBRACKET", KEY_RBRACKET);
        m.insert("BACKSLASH", KEY_BACKSLASH);
        m.insert("SEMICOLON", KEY_SEMICOLON);
        m.insert("QUOTE", KEY_QUOTE);
        m.insert("RETURN", KEY_RETURN);
        m.insert("COMMA", KEY_COMMA);
        m.insert("PERIOD", KEY_PERIOD);
        m.insert("SLASH", KEY_SLASH);

        m.insert("LEFT", KEY_LEFT);
        m.insert("UP", KEY_UP);
        m.insert("RIGHT", KEY_RIGHT);
        m.insert("DOWN", KEY_DOWN);

        m.insert("PRINT", KEY_PRINT);
        m.insert("PAUSE", KEY_PAUSE);
        m.insert("BREAK", KEY_PAUSE);
        m.insert("INSERT", KEY_INSERT);
        m.insert("INS", KEY_INSERT);
        m.insert("DELETE", KEY_DELETE);
        m.insert("DEL", KEY_DELETE);
        m.insert("HOME", KEY_HOME);
        m.insert("END", KEY_END);
        m.insert("PAGEUP", KEY_PAGE_UP);
        m.insert("PGUP", KEY_PAGE_UP);
        m.insert("PAGEDOWN", KEY_PAGE_DOWN);
        m.insert("PGDN", KEY_PAGE_DOWN);

        m.insert("NUM+", KEY_ADD);
        m.insert("NUM-", KEY_SUBTRACT);
        m.insert("NUM*", KEY_MULTIPLY);
        m.insert("NUM/", KEY_DIVIDE);
        m.insert("NUM.", KEY_DECIMAL);
        m.insert("NUM~", KEY_ENTER);

        m.insert("ADD", KEY_ADD);
        m.insert("SUBTRACT", KEY_SUBTRACT);
        m.insert("MULTIPLY", KEY_MULTIPLY);
        m.insert("DIVIDE", KEY_DIVIDE);
        m.insert("DECIMAL", KEY_DECIMAL);
        m.insert("ENTER", KEY_ENTER);

        m.insert("NUM0", KEY_NUM0);
        m.insert("NUM1", KEY_NUM1);
        m.insert("NUM2", KEY_NUM2);
        m.insert("NUM3", KEY_NUM3);
        m.insert("NUM4", KEY_NUM4);
        m.insert("NUM5", KEY_NUM5);
        m.insert("NUM6", KEY_NUM6);
        m.insert("NUM7", KEY_NUM7);
        m.insert("NUM8", KEY_NUM8);
        m.insert("NUM9", KEY_NUM9);

        m.insert("CAPSLOCK", KEY_CAPS_LOCK);
        m.insert("SCROLLLOCK", KEY_SCROLL_LOCK);
        m.insert("NUMLOCK", KEY_NUM_LOCK);

        m
    });
}

pub use platform::*;
