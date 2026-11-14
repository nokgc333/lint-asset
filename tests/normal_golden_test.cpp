#include <doctest/doctest.h>

#include <cstdint>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "lint_asset/inspection.hpp"

namespace {

std::vector<lint_asset::Issue> inspect_fixture(const std::string &name) {
    const std::string path = std::string(LINT_ASSET_TEST_GLB_DIR) + "/" + name + ".glb";
    std::ifstream file(path, std::ios::binary);
    REQUIRE_MESSAGE(file.is_open(), "missing generated file: " << path);
    const std::vector<std::uint8_t> bytes{std::istreambuf_iterator<char>(file),
                                          std::istreambuf_iterator<char>()};
    const auto result = lint_asset::load_glb_geometry(bytes);
    REQUIRE(result.ok());
    return lint_asset::inspect_geometry(result.geometry);
}

}  // namespace

// tests/golden/*.json are the source of truth; these inline expectations mirror them.

TEST_CASE("inspection golden: cube") {
    const std::vector<lint_asset::Issue> expected = {};
    CHECK(inspect_fixture("cube") == expected);
}

TEST_CASE("inspection golden: cube_faces_flipped") {
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

TEST_CASE("inspection golden: cube_flipped_normals") {
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

TEST_CASE("inspection golden: cube_open_top") {
    const std::vector<lint_asset::Issue> expected = {
        {lint_asset::RuleId::mesh_boundary_edge,
         lint_asset::Severity::warning,
         "4 boundary edges are each used by only one triangle.",
         0,
         0,
         4,
         {1, 3, 6, 9},
         false},
    };
    CHECK(inspect_fixture("cube_open_top") == expected);
}

TEST_CASE("inspection golden: cube_unnormalized") {
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

TEST_CASE("inspection golden: primitive_modes") {
    const std::vector<lint_asset::Issue> expected = {
        {lint_asset::RuleId::normal_missing,
         lint_asset::Severity::warning,
         "The primitive has no vertex normals.",
         0,
         0,
         1,
         {0},
         false},
        {lint_asset::RuleId::mesh_nonmanifold_edge,
         lint_asset::Severity::error,
         "1 edge is shared by three or more triangles.",
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
        {lint_asset::RuleId::mesh_nonmanifold_edge,
         lint_asset::Severity::error,
         "1 edge is shared by three or more triangles.",
         0,
         1,
         2,
         {0, 1},
         false},
        {lint_asset::RuleId::mesh_boundary_edge,
         lint_asset::Severity::warning,
         "2 boundary edges are each used by only one triangle.",
         0,
         1,
         1,
         {1},
         false},
        {lint_asset::RuleId::normal_missing,
         lint_asset::Severity::warning,
         "The primitive has no vertex normals.",
         1,
         0,
         3,
         {0, 1, 2},
         false},
        {lint_asset::RuleId::mesh_boundary_edge,
         lint_asset::Severity::warning,
         "5 boundary edges are each used by only one triangle.",
         1,
         0,
         3,
         {0, 1, 2},
         false},
    };
    CHECK(inspect_fixture("primitive_modes") == expected);
}

TEST_CASE("inspection golden: three_pages") {
    const std::vector<lint_asset::Issue> expected = {
        {lint_asset::RuleId::normal_missing,
         lint_asset::Severity::warning,
         "The primitive has no vertex normals.",
         0,
         0,
         3,
         {0, 1, 2},
         false},
        {lint_asset::RuleId::mesh_nonmanifold_edge,
         lint_asset::Severity::error,
         "1 edge is shared by three or more triangles.",
         0,
         0,
         3,
         {0, 1, 2},
         false},
        {lint_asset::RuleId::mesh_boundary_edge,
         lint_asset::Severity::warning,
         "6 boundary edges are each used by only one triangle.",
         0,
         0,
         3,
         {0, 1, 2},
         false},
    };
    CHECK(inspect_fixture("three_pages") == expected);
}
