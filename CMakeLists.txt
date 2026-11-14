cmake_minimum_required(VERSION 3.24)
project(lint_asset VERSION 0.0.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(LINT_ASSET_SANITIZE "Build native targets with AddressSanitizer and UBSan" ON)

# Shared compiler flags. Targets opt in by linking to this interface library.
add_library(lint_asset_options INTERFACE)
target_compile_options(lint_asset_options INTERFACE -Wall -Wextra -Wpedantic -Werror)
add_library(lint_asset_sanitizers INTERFACE)
target_link_libraries(lint_asset_options INTERFACE lint_asset_sanitizers)
if(LINT_ASSET_SANITIZE AND NOT EMSCRIPTEN)
  target_compile_options(lint_asset_sanitizers INTERFACE
    -fsanitize=address,undefined -fno-omit-frame-pointer)
  target_link_options(lint_asset_sanitizers INTERFACE -fsanitize=address,undefined)
endif()

# libFuzzer targets. Clang only. The code under test is built with coverage instrumentation.
option(LINT_ASSET_FUZZ "Build the libFuzzer targets in fuzz/" OFF)
if(LINT_ASSET_FUZZ)
  if(NOT CMAKE_CXX_COMPILER_ID STREQUAL "Clang" AND NOT CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang")
    message(FATAL_ERROR "LINT_ASSET_FUZZ needs clang")
  endif()
  if(EMSCRIPTEN)
    message(FATAL_ERROR "LINT_ASSET_FUZZ is for the native build")
  endif()
  target_compile_options(lint_asset_sanitizers INTERFACE -fsanitize=fuzzer-no-link)
endif()

add_subdirectory(core)
if(LINT_ASSET_FUZZ)
  add_subdirectory(fuzz)
endif()

# Tests run natively only; the WASM build has no test runner.
if(NOT EMSCRIPTEN)
  enable_testing()
  add_subdirectory(tests)
endif()
