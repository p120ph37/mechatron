{
  "configurations": {
    "Debug": { "defines": ["DEBUG"] },
    "Release": { "defines": ["NDEBUG"] },
  },
  "defines": [
    "NAPI_VERSION=8",
  ],
  "targets": [
    {
      "target_name": "robot",
      "sources": [
        "src/robot/Bounds.cc",
        "src/robot/Clipboard.cc",
        "src/robot/Color.cc",
        "src/robot/Hash.cc",
        "src/robot/Image.cc",
        "src/robot/Keyboard.cc",
        "src/robot/Memory.cc",
        "src/robot/Module.cc",
        "src/robot/Mouse.cc",
        "src/robot/Point.cc",
        "src/robot/Process.cc",
        "src/robot/Range.cc",
        "src/robot/Screen.cc",
        "src/robot/Size.cc",
        "src/robot/Timer.cc",
        "src/robot/Window.cc",

        "src/native/init.cc",
        "src/native/keyboard.cc",
        "src/native/mouse.cc",
        "src/native/clipboard.cc",
        "src/native/screen.cc",
        "src/native/window.cc",
        "src/native/process.cc",
        "src/native/memory.cc",
      ],
      "include_dirs": [
        "src/",
        "src/robot/",
        "src/native/",
        "<!@(node -p \"require('node-addon-api').include\")",
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        [ "OS == 'linux'", {
          "libraries": ["-lrt", "-lX11", "-lXtst", "-lXinerama", "-static-libstdc++"],
          "cflags+": ["-Wno-missing-field-initializers", "-Wimplicit-fallthrough=0"],
        }],
        [ "OS == 'mac'", {
          "libraries": ["-framework ApplicationServices", "-framework AppKit"],
          "cflags+": ["-fvisibility=hidden"],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.7",
            "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
            "OTHER_CPLUSPLUSFLAGS": [
              "-std=c++17",
              "-ObjC++",
              "-Wno-sign-compare",
              "-Wno-missing-field-initializers",
            ],
          },
        }],
        [ "OS == 'win'", {
          "libraries": ["-lPsapi"],
          "defines!": ["_HAS_EXCEPTIONS=0"],
          "defines": ["UNICODE", "_HAS_EXCEPTIONS=1"],
          "msvs_settings": {
            "VCCLCompilerTool": {"ExceptionHandling": 1},
            "VCLinkerTool": {"SubSystem": 2}
          },
          "msvs_disabled_warnings": [4005, 4661],
        }],
      ],
    },
  ],
}
