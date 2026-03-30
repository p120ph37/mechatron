# mechatron

Node.js native addon for desktop automation — keyboard, mouse, screen capture, process/memory inspection, and window management.

Derived from [robot-js](https://github.com/nickvdp/robot-js) and the [Robot](https://github.com/nickvdp/robot) C++ library.

## Install

```sh
npm install mechatron
```

Prebuilt binaries are included for:
- Linux x64, arm64
- macOS arm64, x64
- Windows x64, ia32

## Build from source

Requires: C++ compiler, CMake, Node.js 18+

```sh
npm install
npm run build:dev   # cmake-js
# or
npx node-gyp rebuild  # node-gyp (fallback)
```

## Test

```sh
npm test            # types + timer (safe to run headless)
npm run test:ci     # types only (CI-safe, no GUI required)
```

## License

[MIT](LICENSE) — see LICENSE file for the original Robot library acknowledgement.
