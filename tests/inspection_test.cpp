#include <doctest/doctest.h>

#include <cstdint>
#include <vector>

#include "lint_asset/edge_inspection.hpp"
#include "lint_asset/inspection.hpp"
#include "lint_asset/normal_inspection.hpp"

using lint_asset::Geometry;
using lint_asset::Issue;
using lint_asset::PrimitiveGeometry;
using lint_asset::RuleId;

namespace {

// One triangle in the XY plane (face normal +Z), written with its own three vertices.
PrimitiveGeometry triangle(const std::vector<float> &normals, std::uint32_t mesh,
                           std::uint32_t primitive) {
    PrimitiveGeometry part;
    part.mesh = mesh;
    part.primitive = primitive;
    part.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0};
    part.normals = normals;
    part.triangles = {0, 1, 2};
    return part;
}

const std::vector<float> UP = {0, 0, 1, 0, 0, 1, 0, 0, 1};
const std::vector<float> DOWN = {0, 0, -1, 0, 0, -1, 0, 0, -1};

}  // namespace

TEST_CASE("a model with no problem has no issue") {
    Geometry geometry;
    CHECK(lint_asset::inspect_geometry(geometry).empty());
}

TEST_CASE("normal and edge findings of one primitive come out in the order of the rules") {
    Geometry geometry;
    geometry.primitives.push_back(triangle(DOWN, 0, 0));  // flipped, and an open triangle
    const auto issues = lint_asset::inspect_geometry(geometry);

    REQUIRE(issues.size() == 2);
    CHECK(issues[0].rule == RuleId::normal_flipped);
    CHECK(issues[1].rule == RuleId::mesh_boundary_edge);
}

TEST_CASE("findings are ordered by mesh first, whichever check found them") {
    // Two meshes, so the identical triangles are not joined into one surface.
    Geometry geometry;
    geometry.primitives.push_back(triangle(UP, 0, 0));    // open triangle only
    geometry.primitives.push_back(triangle(DOWN, 1, 0));  // flipped and open
    const auto issues = lint_asset::inspect_geometry(geometry);

    REQUIRE(issues.size() == 3);
    CHECK((issues[0].mesh == 0 && issues[0].rule == RuleId::mesh_boundary_edge));
    CHECK((issues[1].mesh == 1 && issues[1].rule == RuleId::normal_flipped));
    CHECK((issues[2].mesh == 1 && issues[2].rule == RuleId::mesh_boundary_edge));
}

TEST_CASE("the combined list holds exactly what the single checks find") {
    Geometry geometry;
    geometry.primitives.push_back(triangle(DOWN, 0, 0));
    geometry.primitives.push_back(triangle({}, 1, 0));

    const auto all = lint_asset::inspect_geometry(geometry);

    CHECK(all.size() == lint_asset::inspect_normals(geometry).size() +
                            lint_asset::inspect_edges(geometry).size());
    CHECK(all == lint_asset::inspect_geometry(geometry));
}

TEST_CASE("whole-asset issues come first, then the triangle issues") {
    Geometry geometry;
    geometry.primitives.push_back(triangle(DOWN, 0, 0));  // flipped, and an open triangle
    lint_asset::MeshInstance instance;
    instance.mesh = 0;
    instance.world = {1500, 0, 0, 0, 0, 1500, 0, 0, 0, 0, 1500, 0, 0, 0, 0, 1};
    geometry.instances.push_back(instance);  // 1500 m across, and one drawn triangle

    const auto issues = lint_asset::inspect_geometry(geometry, {.max_triangles = 0});

    REQUIRE(issues.size() == 4);
    CHECK(issues[0].rule == RuleId::asset_triangle_count_exceeded);
    CHECK(issues[1].rule == RuleId::asset_scale_too_large);
    CHECK(issues[2].rule == RuleId::normal_flipped);
    CHECK(issues[3].rule == RuleId::mesh_boundary_edge);
}

TEST_CASE("a degenerate triangle is reported once, and the other checks leave it alone") {
    Geometry geometry;
    PrimitiveGeometry part;
    part.positions = {0, 0, 0, 1, 0, 0, 2, 0, 0};  // three points on a line
    part.normals = {0, 0, -1, 0, 0, -1, 0, 0, -1};
    part.triangles = {0, 1, 2};
    geometry.primitives.push_back(part);
    const auto issues = lint_asset::inspect_geometry(geometry);

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::mesh_degenerate_triangle);
}

TEST_CASE("the thresholds reach the size checks") {
    Geometry geometry;
    geometry.primitives.push_back(triangle(UP, 0, 0));
    lint_asset::MeshInstance instance;
    instance.mesh = 0;
    instance.world = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
    geometry.instances.push_back(instance);

    const auto with_defaults = lint_asset::inspect_geometry(geometry);
    const auto strict = lint_asset::inspect_geometry(geometry, {.min_extent_m = 5.0});

    CHECK(with_defaults.size() == 1);  // only the open triangle
    REQUIRE(strict.size() == 2);
    CHECK(strict[0].rule == RuleId::asset_scale_too_small);
}
