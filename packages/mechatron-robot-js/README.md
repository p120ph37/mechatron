# mechatron-robot-js

Drop-in replacement for [robot-js](https://github.com/Robot/robot-js), backed
by [mechatron](https://github.com/p120ph37/mechatron).

## Installation

```bash
npm install mechatron-robot-js
```

## Usage

Replace your existing `robot-js` require/import with `mechatron-robot-js`:

```js
// Before:
var robot = require("robot-js");

// After:
var robot = require("mechatron-robot-js");
```

All robot-js 2.2.0 APIs are supported — classes, methods, constants, and
calling conventions (including calling constructors without `new`).

## What's included

This package re-exports the full mechatron API, which provides complete parity
with the robot-js 2.2.0 documented surface:

- **Keyboard** — press, release, click, compile, getState
- **Mouse** — click, press, release, scroll, getPos, setPos, getState
- **Clipboard** — clear, getText/setText, getImage/setImage, getSequence
- **Screen** — synchronize, grabScreen, getMain, getList, getTotalBounds
- **Window** — full CRUD, getList, getActive, isAxEnabled
- **Process** — open, close, getModules, getWindows, getList, getCurrent
- **Memory** — read/write (typed + raw), find, getRegions, setAccess
- **Module** — getSegments, contains, comparison operators
- **Data types** — Point, Size, Bounds, Color, Range, Hash, Image, Timer

## npm alias

To use this as a transparent alias so existing code keeps
`require("robot-js")`:

```bash
npm install robot-js@npm:mechatron-robot-js
```

## License

MIT
