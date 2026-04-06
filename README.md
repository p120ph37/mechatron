# mechatron

Node.js native addon for desktop automation — keyboard, mouse, screen capture,
clipboard, process/memory inspection, and window management.

Derived from [robot-js](https://github.com/Robot/robot-js) and the
[Robot](https://github.com/Robot/robot) C++ library, with the native layer
rewritten in Rust via [napi-rs](https://napi.rs/).

## Platforms

Prebuilt binaries are included for:

| OS | Architectures |
|----|--------------|
| Linux | x64, arm64 |
| macOS | arm64, x64 |
| Windows | x64, ia32 |

## Install

```sh
npm install mechatron          # all subsystems (meta-package)
npm install mechatron-keyboard # only keyboard — smaller install, no AV triggers
```

### Packages

| Package | Description |
|---------|-------------|
| `mechatron` | Meta-package — re-exports all subsystems |
| `mechatron-types` | Shared data types (Point, Size, Bounds, Color, Range, Hash, Image, Timer) |
| `mechatron-keyboard` | Keyboard simulation and state |
| `mechatron-mouse` | Mouse simulation and state |
| `mechatron-clipboard` | Clipboard read/write (text + image) |
| `mechatron-screen` | Screen enumeration and capture |
| `mechatron-window` | Window enumeration and management |
| `mechatron-process` | Process enumeration and inspection |
| `mechatron-memory` | Process memory read/write/search |
| `mechatron-robot-js` | Drop-in robot-js 2.2.0 replacement (legacy API surface) |

## Usage

```js
const {
  Keyboard, KEYS, Mouse, BUTTON_LEFT,
  Clipboard, Screen, Image, Window, Process, Memory,
} = require("mechatron");

// Keyboard
const kb = new Keyboard();
kb.click(KEYS.KEY_A);
console.log(Keyboard.getState(KEYS.KEY_SHIFT));

// Mouse
const mouse = new Mouse();
mouse.click(BUTTON_LEFT);
const pos = Mouse.getPos();
Mouse.setPos(100, 200);

// Clipboard
Clipboard.setText("hello");
console.log(Clipboard.getText());
const text = await Clipboard.getTextAsync();   // async variant

// Screen
Screen.synchronize();
const screens = Screen.getList();
const img = new Image();
Screen.grabScreen(img, 0, 0, 100, 100);
await Screen.grabScreenAsync(img, 0, 0, 100, 100);  // async variant

// Window
const windows = Window.getList();
const active = Window.getActive();

// Process
const procs = Process.getList();
const curr = Process.getCurrent();
const mods = curr.getModules();
const modsAsync = await curr.getModulesAsync();  // async variant

// Memory
const mem = new Memory(curr);
const regions = mem.getRegions();
```

### robot-js migration

Existing robot-js applications can switch with zero code changes:

```sh
npm install robot-js@npm:mechatron-robot-js
```

Or depend on `mechatron-robot-js` directly — it provides the full robot-js
2.2.0 surface (`callableClass` constructors, `KEY_*` globals, `sleep`/`clock`,
`Module.Segment`, etc.) backed by the modern mechatron native layer.

## Architecture

The codebase is an npm workspace of nine packages.  The native backend is a
Cargo workspace of seven per-subsystem `cdylib` crates (`native-rs/`) built
with napi-rs, each exposing minimal FFI — platform syscall wrappers with no
business logic.  The TypeScript layer in each `packages/mechatron-*/` package
owns all API logic: argument validation, key constants, keyboard compile, and
state iteration.  `tsc --build` compiles all packages via project references.

## Build from Source

Requires: Rust toolchain, Node.js 18+

```sh
cd native-rs && cargo build --release  # build all native crates
npx tsc --build                        # compile TypeScript
```

## Test

```sh
# Safe headless tests (types + timer)
npm test

# Full CI test suite (requires desktop session / TCC grants on macOS)
sudo node test/test-ci.js all

# robot-js conformance suite (320 API surface checks)
node packages/mechatron-robot-js/test/conformance.js
```

## License

[MIT — Copyright (c) 2026 Aaron Meriwether](LICENSE)

See LICENSE file for full Robot acknowledgement.
