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
  sample_toy_house_clean sample_toy_house_broken
  node_transforms quantized_strided index_out_of_vertex_range sparse_accessor
  cube_uv_overlap_same cube_uv_overlap_mirrored
  cube_flat cube_uv_out_of_range uv_ushort_normalized uv_count_mismatch uv_wrong_type
  node_cycle node_instance_explosion
  cube_small cube_huge cube_cm_export cube_with_degenerate
  cube cube_flipped_normals cube_open_top cube_faces_flipped cube_unnormalized primitive_modes three_pages external_image_uri external_image_uris_mixed embedded_image_uri
  unknown_extension_used required_supported_extension bad_version_1 external_buffer_uri
  truncated_cube length_mismatch invalid_json missing_asset accessor_out_of_range
  huge_accessor_count required_draco required_unknown_extension)
set(LINT_ASSET_TEST_SPLIT_FILES
  split_cube.gltf split_cube.bin split_cube_subfolder.gltf split_cube_encoded.gltf
  embedded_cube.gltf split_cube_web_buffer.gltf split_cube_images.gltf split_cube_two_buffers.gltf)
set(LINT_ASSET_TEST_GLB_FILES)
foreach(name IN LISTS LINT_ASSET_TEST_GLB_NAMES)
  list(APPEND LINT_ASSET_TEST_GLB_FILES "${LINT_ASSET_TEST_GLB_DIR}/${name}.glb")
endforeach()
foreach(name IN LISTS LINT_ASSET_TEST_SPLIT_FILES)
  list(APPEND LINT_ASSET_TEST_GLB_FILES "${LINT_ASSET_TEST_GLB_DIR}/${name}")
endforeach()
add_custom_command(
  OUTPUT ${LINT_ASSET_TEST_GLB_FILES}
  COMMAND Python3::Interpreter "${CMAKE_CURRENT_SOURCE_DIR}/tools/make_test_glbs.py"
    "${LINT_ASSET_TEST_GLB_DIR}"
  DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/tools/make_test_glbs.py"
    "${CMAKE_CURRENT_SOURCE_DIR}/tools/sample_models.py"
  VERBATIM)
add_custom_target(lint_test_glbs DEPENDS ${LINT_ASSET_TEST_GLB_FILES})

add_executable(lint_core_tests main.cpp samples_test.cpp version_test.cpp glb_loader_test.cpp glb_geometry_test.cpp normal_inspection_test.cpp uv_inspection_test.cpp normal_golden_test.cpp edge_inspection_test.cpp inspection_test.cpp size_inspection_test.cpp uri_inspection_test.cpp external_uri_limits_test.cpp normal_map_test.cpp orm_test.cpp gltf_loader_test.cpp)
add_dependencies(lint_core_tests lint_test_glbs)
target_compile_definitions(lint_core_tests PRIVATE
  LINT_ASSET_SAMPLES_DIR="${PROJECT_SOURCE_DIR}/samples"
  LINT_ASSET_TEST_GLB_DIR="${LINT_ASSET_TEST_GLB_DIR}")
target_link_libraries(lint_core_tests PRIVATE lint_core lint_asset_options doctest::doctest)
add_test(NAME lint_core_tests COMMAND lint_core_tests)
