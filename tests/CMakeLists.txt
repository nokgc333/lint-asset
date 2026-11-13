include(FetchContent)

# Pinned to the commit of tag v2.4.12 so every build uses exactly the same source.
FetchContent_Declare(
  doctest
  GIT_REPOSITORY https://github.com/doctest/doctest.git
  GIT_TAG 1da23a3e8119ec5cce4f9388e91b065e20bf06f5)
set(DOCTEST_WITH_TESTS OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(doctest)

find_package(Python3 REQUIRED COMPONENTS Interpreter)
set(LINT_ASSET_TEST_GLB_DIR "${CMAKE_CURRENT_BINARY_DIR}/glb")
set(LINT_ASSET_TEST_GLB_NAMES
  node_transforms quantized_strided index_out_of_vertex_range sparse_accessor
  node_cycle node_instance_explosion
  cube cube_flipped_normals cube_open_top primitive_modes external_image_uri
  unknown_extension_used required_supported_extension bad_version_1 external_buffer_uri
  truncated_cube length_mismatch invalid_json missing_asset accessor_out_of_range
  huge_accessor_count required_draco required_unknown_extension)
set(LINT_ASSET_TEST_GLB_FILES)
foreach(name IN LISTS LINT_ASSET_TEST_GLB_NAMES)
  list(APPEND LINT_ASSET_TEST_GLB_FILES "${LINT_ASSET_TEST_GLB_DIR}/${name}.glb")
endforeach()
add_custom_command(
  OUTPUT ${LINT_ASSET_TEST_GLB_FILES}
  COMMAND Python3::Interpreter "${CMAKE_CURRENT_SOURCE_DIR}/tools/make_test_glbs.py"
    "${LINT_ASSET_TEST_GLB_DIR}"
  DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/tools/make_test_glbs.py"
  VERBATIM)
add_custom_target(lint_test_glbs DEPENDS ${LINT_ASSET_TEST_GLB_FILES})

add_executable(lint_core_tests main.cpp version_test.cpp glb_loader_test.cpp glb_geometry_test.cpp)
add_dependencies(lint_core_tests lint_test_glbs)
target_compile_definitions(lint_core_tests PRIVATE
  LINT_ASSET_TEST_GLB_DIR="${LINT_ASSET_TEST_GLB_DIR}")
target_link_libraries(lint_core_tests PRIVATE lint_core lint_asset_options doctest::doctest)
add_test(NAME lint_core_tests COMMAND lint_core_tests)
