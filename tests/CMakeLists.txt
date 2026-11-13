include(FetchContent)

# Pinned to the commit of tag v2.4.12 so every build uses exactly the same source.
FetchContent_Declare(
  doctest
  GIT_REPOSITORY https://github.com/doctest/doctest.git
  GIT_TAG 1da23a3e8119ec5cce4f9388e91b065e20bf06f5)
set(DOCTEST_WITH_TESTS OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(doctest)

add_executable(lint_core_tests main.cpp version_test.cpp)
target_link_libraries(lint_core_tests PRIVATE lint_core lint_asset_options doctest::doctest)
add_test(NAME lint_core_tests COMMAND lint_core_tests)
