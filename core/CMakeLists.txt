add_library(lint_core STATIC src/version.cpp)
target_include_directories(lint_core PUBLIC include)
target_compile_definitions(lint_core PRIVATE LINT_ASSET_VERSION="${PROJECT_VERSION}")
target_link_libraries(lint_core PRIVATE lint_asset_options)

# The WASM module: the same library, exposed to JavaScript through Embind.
if(EMSCRIPTEN)
  add_executable(lint_core_wasm src/wasm_bindings.cpp)
  target_link_libraries(lint_core_wasm PRIVATE lint_core lint_asset_options)
  target_link_options(lint_core_wasm PRIVATE
    -lembind
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=createLintCore
    -sENVIRONMENT=web,worker,node)
  set_target_properties(lint_core_wasm PROPERTIES OUTPUT_NAME lint_core SUFFIX ".mjs")
endif()
