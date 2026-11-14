#include <doctest/doctest.h>

#include <cstdint>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "lint_asset/normal_inspection.hpp"

namespace {

std::vector<lint_asset::Issue> inspect_fixture(const std::string &name) {
    const std::string path = std::string(LINT_ASSET_TEST_GLB_DIR) + "/" + name + ".glb";
    std::ifstream file(path, std::ios::binary);
    REQUIRE_MESSAGE(file.is_open(), "missing generated file: " << path);
    const std::vector<std::uint8_t> bytes{std::istreambuf_iterator<char>(file),
                                          std::istreambuf_iterator<char>()};
    const auto result = lint_asset::load_glb_geometry(bytes);
    REQUIRE(result.ok());
    return lint_asset::inspect_normals(result.geometry);
}

}  // namespace

// tests/golden/*.json are the source of truth; these inline expectations mirror them.

TEST_CASE("normal golden: cube") {
    const std::vector<lint_asset::Issue> expected = {};
    CHECK(inspect_fixture("cube") == expected);
}

TEST_CASE("normal golden: cube_flipped_normals") {
    const std::vector<lint_asset::Issue> expected = {
        {lint_asset::RuleId::normal_flipped,
         lint_asset::Severity::error,
         "Vertex normals point opposite to the face winding.",
         0,
         0,
         12,
         {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11},
         false},
    };
    CHECK(inspect_fixture("cube_flipped_normals") == expected);
}

TEST_CASE("normal golden: cube_faces_flipped") {
    const std::vector<lint_asset::Issue> expected = {
        {lint_asset::RuleId::normal_flipped,
         lint_asset::Severity::error,
         "Vertex normals point opposite to the face winding.",
         0,
         0,
         4,
         {2, 3, 8, 9},
         false},
    };
    CHECK(inspect_fixture("cube_faces_flipped") == expected);
}

TEST_CASE("normal golden: cube_unnormalized") {
    const std::vector<lint_asset::Issue> expected = {
        {lint_asset::RuleId::normal_unnormalized,
         lint_asset::Severity::warning,
         "Vertex normals are not unit length (outside 1 +/- 0.01).",
         0,
         0,
         6,
         {0, 1, 4, 5, 8, 9},
         false},
    };
    CHECK(inspect_fixture("cube_unnormalized") == expected);
}

TEST_CASE("normal golden: primitive_modes") {
    const std::vector<lint_asset::Issue> expected = {
        {lint_asset::RuleId::normal_missing,
         lint_asset::Severity::warning,
         "The primitive has no vertex normals.",
         0,
         0,
         1,
         {0},
         false},
        {lint_asset::RuleId::normal_missing,
         lint_asset::Severity::warning,
         "The primitive has no vertex normals.",
         0,
         1,
         2,
         {0, 1},
         false},
        {lint_asset::RuleId::normal_missing,
         lint_asset::Severity::warning,
         "The primitive has no vertex normals.",
         1,
         0,
         3,
         {0, 1, 2},
         false},
    };
    CHECK(inspect_fixture("primitive_modes") == expected);
}
