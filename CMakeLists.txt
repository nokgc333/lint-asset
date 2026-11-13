cmake_minimum_required(VERSION 3.24)
project(lint_asset VERSION 0.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(LINT_ASSET_SANITIZE "Build native targets with AddressSanitizer and UBSan" ON)

# Shared compiler flags. Targets opt in by linking to this interface library.
add_library(lint_asset_options INTERFACE)
target_compile_options(lint_asset_options INTERFACE -Wall -Wextra -Wpedantic -Werror)
if(LINT_ASSET_SANITIZE AND NOT EMSCRIPTEN)
  target_compile_options(lint_asset_options INTERFACE
    -fsanitize=address,undefined -fno-omit-frame-pointer)
  target_link_options(lint_asset_options INTERFACE -fsanitize=address,undefined)
endif()

add_subdirectory(core)

# Tests run natively only; the WASM build has no test runner.
if(NOT EMSCRIPTEN)
  enable_testing()
  add_subdirectory(tests)
endif()
