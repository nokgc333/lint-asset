include(FetchContent)

# Pinned to the commit of tag v3.1.0.
FetchContent_Declare(
  tinygltf
  GIT_REPOSITORY https://github.com/syoyo/tinygltf.git
  GIT_TAG 97789b346ed792f413b9520c80bb479f3b63368f
  SOURCE_SUBDIR lint_asset_download_only)
FetchContent_MakeAvailable(tinygltf)

add_library(tinygltf_v3 STATIC "${tinygltf_SOURCE_DIR}/tiny_gltf_v3.c")
set_target_properties(tinygltf_v3 PROPERTIES C_STANDARD 11 C_STANDARD_REQUIRED ON C_EXTENSIONS OFF)
target_include_directories(tinygltf_v3 SYSTEM PUBLIC "${tinygltf_SOURCE_DIR}")
target_link_libraries(tinygltf_v3 PRIVATE lint_asset_sanitizers)

add_library(lint_core STATIC src/version.cpp src/glb_loader.cpp src/glb_geometry.cpp src/glb_parse.cpp src/issue.cpp src/normal_inspection.cpp src/uv_inspection.cpp src/edge_inspection.cpp src/inspection.cpp src/size_inspection.cpp src/uri_inspection.cpp src/normal_map.cpp)
target_include_directories(lint_core PUBLIC include)
target_compile_definitions(lint_core PRIVATE LINT_ASSET_VERSION="${PROJECT_VERSION}")
target_link_libraries(lint_core PRIVATE lint_asset_options tinygltf_v3)

# The WASM module: the same library, exposed to JavaScript through Embind.
if(EMSCRIPTEN)
  target_compile_options(lint_core PRIVATE -fexceptions)
  target_link_options(lint_core INTERFACE -fexceptions)
  # The browser build needs only web and worker. Node.js support adds code the browser never
  # uses (and a bundler warning), so it is opt-in, for running the module in tests.
  option(LINT_ASSET_WASM_NODE "Also build the WASM module so it can run in Node.js" OFF)
  if(LINT_ASSET_WASM_NODE)
    set(LINT_ASSET_WASM_ENVIRONMENT "web,worker,node")
  else()
    set(LINT_ASSET_WASM_ENVIRONMENT "web,worker")
  endif()

  add_executable(lint_core_wasm src/wasm_bindings.cpp)
  target_link_libraries(lint_core_wasm PRIVATE lint_core lint_asset_options)
  target_link_options(lint_core_wasm PRIVATE
    -lembind
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=createLintCore
    -sENVIRONMENT=${LINT_ASSET_WASM_ENVIRONMENT}
    # The default memory is fixed at 16 MB, which a large GLB (up to 100 MB) cannot fit in. Let it
    # grow, up to 2 GB, the largest size every supported browser can reach.
    # The production CSP forbids eval and new Function. Without this, Embind builds its call
    # wrappers with new Function and the module cannot start in the browser.
    -sDYNAMIC_EXECUTION=0
    -sALLOW_MEMORY_GROWTH=1
    -sMAXIMUM_MEMORY=2GB)
  set_target_properties(lint_core_wasm PROPERTIES OUTPUT_NAME lint_core SUFFIX ".mjs")

  # Copy the built module next to the web app sources, where worker.ts imports it from.
  set(LINT_ASSET_WASM_DEST "${PROJECT_SOURCE_DIR}/web/src/wasm" CACHE PATH
      "Directory the built WASM module is copied to")
  file(MAKE_DIRECTORY "${LINT_ASSET_WASM_DEST}")
  add_custom_command(TARGET lint_core_wasm POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      "$<TARGET_FILE:lint_core_wasm>" "$<TARGET_FILE_DIR:lint_core_wasm>/lint_core.wasm"
      "${LINT_ASSET_WASM_DEST}")
endif()
