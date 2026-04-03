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
npm install mechatron
```

## Usage

```js
var mechatron = require("mechatron");

// Keyboard
var kb = mechatron.Keyboard();
kb.click(mechatron.KEY_A);
console.log(mechatron.Keyboard.getState(mechatron.KEY_SHIFT));

// Mouse
var mouse = mechatron.Mouse();
mouse.click(mechatron.BUTTON_LEFT);
var pos = mechatron.Mouse.getPos();
mechatron.Mouse.setPos(100, 200);

// Clipboard
mechatron.Clipboard.setText("hello");
console.log(mechatron.Clipboard.getText());

// Screen
mechatron.Screen.synchronize();
var screens = mechatron.Screen.getList();
var img = mechatron.Image();
mechatron.Screen.grabScreen(img, 0, 0, 100, 100);

// Window
var windows = mechatron.Window.getList();
var active = mechatron.Window.getActive();

// Process
var procs = mechatron.Process.getList();
var curr = mechatron.Process.getCurrent();

// Memory
var mem = mechatron.Memory(curr);
var regions = mem.getRegions();
```

## Architecture

The native backend is implemented in Rust (`native-rs/`) using napi-rs.  The
TypeScript wrapper layer (`lib/`) provides the public API with full argument
validation, bundled to `dist/index.js`.

A legacy C++ backend (`src/`) is retained for comparison.  The Rust backend is
loaded by default; the C++ backend is used as a fallback if the Rust binary is
not available for the current platform.

## Build from Source

### Rust backend (default)

Requires: Rust toolchain, Node.js 18+

```sh
cd native-rs
npm run build   # or: cargo build --release
```

### C++ backend (fallback)

Requires: C++ compiler, CMake, Node.js 18+

```sh
npm install
npm run build:dev   # cmake-js
# or
npx node-gyp rebuild  # node-gyp fallback
```

## Test

```sh
# Safe headless tests (types + timer)
npm test

# Full CI test suite (requires desktop session / TCC grants on macOS)
sudo node test/test-ci.js all
```

## License

[MIT — Copyright (c) 2026 Aaron Meriwether](LICENSE)

See LICENSE file for full Robot acknowledgement.
