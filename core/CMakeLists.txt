add_library(lint_core STATIC src/version.cpp)
target_include_directories(lint_core PUBLIC include)
target_compile_definitions(lint_core PRIVATE LINT_ASSET_VERSION="${PROJECT_VERSION}")
target_link_libraries(lint_core PRIVATE lint_asset_options)

# The WASM module: the same library, exposed to JavaScript through Embind.
if(EMSCRIPTEN)
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
    -sENVIRONMENT=${LINT_ASSET_WASM_ENVIRONMENT})
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
