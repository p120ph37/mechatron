# @mechatronic/ffi-memory

Native FFI shared library for the mechatron memory subsystem.

This package contains only prebuilt platform shared libraries
(`.so` / `.dll` / `.dylib`) intended to be loaded via Bun's
`bun:ffi` interface.  It has no JavaScript of its own — all API
surface is provided by the `mechatron` package.

For Node.js / NAPI consumers see [`@mechatronic/napi-memory`](https://www.npmjs.com/package/@mechatronic/napi-memory).

See the [mechatron README](https://github.com/p120ph37/mechatron#readme) for
usage, platform support, and documentation.
