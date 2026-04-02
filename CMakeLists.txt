cmake_minimum_required(VERSION 3.15)
cmake_policy(SET CMP0091 NEW)
cmake_policy(SET CMP0042 NEW)

project(mechatron)

# Use C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find node-addon-api headers
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

# Robot C++ library sources
set(ROBOT_SOURCES
  src/robot/Bounds.cc
  src/robot/Clipboard.cc
  src/robot/Color.cc
  src/robot/Hash.cc
  src/robot/Image.cc
  src/robot/Keyboard.cc
  src/robot/Memory.cc
  src/robot/Module.cc
  src/robot/Mouse.cc
  src/robot/Point.cc
  src/robot/Process.cc
  src/robot/Range.cc
  src/robot/Screen.cc
  src/robot/Size.cc
  src/robot/Timer.cc
  src/robot/Window.cc
)

# Flat NAPI backend sources
set(NATIVE_SOURCES
  src/native/init.cc
  src/native/keyboard.cc
  src/native/mouse.cc
  src/native/clipboard.cc
  src/native/screen.cc
  src/native/window.cc
  src/native/process.cc
  src/native/memory.cc
)

# Define the NAPI addon
add_library(robot SHARED
  ${ROBOT_SOURCES}
  ${NATIVE_SOURCES}
)

# Set NAPI version
target_compile_definitions(robot PRIVATE NAPI_VERSION=8)

# Include directories
target_include_directories(robot PRIVATE
  ${CMAKE_JS_INC}
  ${NODE_ADDON_API_DIR}
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/robot
  ${CMAKE_SOURCE_DIR}/src/native
)

# Link cmake-js provided libraries
target_link_libraries(robot ${CMAKE_JS_LIB})

# Platform-specific settings
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  target_link_libraries(robot rt X11 Xtst Xinerama)
  target_link_options(robot PRIVATE -static-libstdc++)
  target_compile_options(robot PRIVATE
    -fexceptions
    -Wno-missing-field-initializers
    -Wimplicit-fallthrough=0
  )
elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
  find_library(APPLICATION_SERVICES ApplicationServices)
  find_library(APPKIT AppKit)
  target_link_libraries(robot ${APPLICATION_SERVICES} ${APPKIT})
  target_compile_options(robot PRIVATE
    -fexceptions
    -fvisibility=hidden
    -ObjC++
    -Wno-sign-compare
    -Wno-missing-field-initializers
  )
  set_target_properties(robot PROPERTIES
    MACOSX_DEPLOYMENT_TARGET "10.7"
  )
elseif(WIN32)
  target_link_libraries(robot Psapi)
  target_compile_definitions(robot PRIVATE UNICODE _HAS_EXCEPTIONS=1)
  if(MSVC)
    target_compile_options(robot PRIVATE /EHsc)
    target_compile_options(robot PRIVATE /wd4005 /wd4661)
    set_target_properties(robot PROPERTIES
      LINK_FLAGS "/SUBSYSTEM:WINDOWS"
    )
  endif()
endif()

# Set output properties for node-gyp-build compatibility
set_target_properties(robot PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

# Node.js addon boilerplate
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()
