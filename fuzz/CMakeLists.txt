# libFuzzer targets (SEC-001, TC-015). Built only with -DLINT_ASSET_FUZZ=ON and clang.
# Each target links the sanitized library and libFuzzer; see fuzz/run_fuzz.py for running them.
foreach(name IN ITEMS fuzz_glb fuzz_gltf fuzz_obj fuzz_texture)
  add_executable(${name} ${name}.cpp)
  target_include_directories(${name} PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
  target_link_libraries(${name} PRIVATE lint_core lint_asset_options)
  target_compile_options(${name} PRIVATE -fsanitize=fuzzer-no-link)
  target_link_options(${name} PRIVATE -fsanitize=fuzzer)
endforeach()
