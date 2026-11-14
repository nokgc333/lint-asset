#include <doctest/doctest.h>

#include <array>
#include <cstdint>
#include <limits>
#include <string>
#include <utility>
#include <vector>

#include "lint_asset/size_inspection.hpp"

using lint_asset::ElementKind;
using lint_asset::Geometry;
using lint_asset::InspectionThresholds;
using lint_asset::Issue;
using lint_asset::MeshInstance;
using lint_asset::PrimitiveGeometry;
using lint_asset::RuleId;
using lint_asset::Severity;

namespace {

using Elements = std::vector<std::uint32_t>;
using Matrix = std::array<float, 16>;

constexpr Matrix IDENTITY = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

Matrix scale_by(float factor) {
    return {factor, 0, 0, 0, 0, factor, 0, 0, 0, 0, factor, 0, 0, 0, 0, 1};
}

Matrix translate_by(float x, float y, float z) {
    return {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1};
}

// A right triangle with legs a and b in the XY plane, so its area is a * b / 2.
PrimitiveGeometry right_triangle(float a, float b, std::uint32_t mesh = 0,
                                 std::uint32_t primitive = 0) {
    PrimitiveGeometry part;
    part.mesh = mesh;
    part.primitive = primitive;
    part.positions = {0, 0, 0, a, 0, 0, 0, b, 0};
    part.triangles = {0, 1, 2};
    return part;
}

MeshInstance placed(std::uint32_t mesh, const Matrix &world = IDENTITY) {
    MeshInstance instance;
    instance.mesh = mesh;
    instance.world = world;
    return instance;
}

// A primitive with `count` copies of one triangle, listed as separate triangles.
PrimitiveGeometry many_triangles(std::uint32_t count, std::uint32_t mesh = 0) {
    PrimitiveGeometry part = right_triangle(1, 1, mesh);
    part.positions.clear();
    part.triangles.clear();
    for (std::uint32_t t = 0; t < count; ++t) {
        part.positions.insert(part.positions.end(), {0, 0, 0, 1, 0, 0, 0, 1, 0});
        part.triangles.insert(part.triangles.end(), {3 * t, 3 * t + 1, 3 * t + 2});
    }
    return part;
}

Geometry one_placed(PrimitiveGeometry part, const Matrix &world = IDENTITY) {
    Geometry geometry;
    const auto mesh = part.mesh;
    geometry.primitives.push_back(std::move(part));
    geometry.instances.push_back(placed(mesh, world));
    return geometry;
}

}  // namespace

TEST_CASE("the default thresholds are the ones in the requirements") {
    const InspectionThresholds defaults;

    CHECK(defaults.max_triangles == 100000);
    CHECK(defaults.min_extent_m == 0.01);
    CHECK(defaults.max_extent_m == 1000.0);
}

// ---- mesh.degenerate_triangle ----

TEST_CASE("a triangle with a normal area is not degenerate") {
    Geometry geometry;
    geometry.primitives.push_back(right_triangle(1, 1));

    CHECK(lint_asset::inspect_degenerate_triangles(geometry).empty());
}

TEST_CASE("the degenerate limit is an area of 1e-10, and exactly the limit is fine") {
    REQUIRE(lint_asset::DEGENERATE_TRIANGLE_AREA == 1e-10);

    SUBCASE("area 9.9e-11 is degenerate") {
        Geometry geometry;
        geometry.primitives.push_back(right_triangle(1e-5f, 1.98e-5f));
        const auto issues = lint_asset::inspect_degenerate_triangles(geometry);

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].elements == Elements{0});
    }
    SUBCASE("area 1.01e-10 is not") {
        Geometry geometry;
        geometry.primitives.push_back(right_triangle(1e-5f, 2.02e-5f));

        CHECK(lint_asset::inspect_degenerate_triangles(geometry).empty());
    }
}

TEST_CASE("collinear and coincident vertices are degenerate") {
    PrimitiveGeometry part;
    part.positions = {0, 0, 0, 1, 0, 0, 2, 0, 0, 5, 5, 5};
    // triangle 0: three points on a line; triangle 1: two vertices at the same position
    part.triangles = {0, 1, 2, 0, 3, 3};
    Geometry geometry;
    geometry.primitives.push_back(part);
    const auto issues = lint_asset::inspect_degenerate_triangles(geometry);

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::mesh_degenerate_triangle);
    CHECK(issues[0].severity == Severity::error);
    CHECK(issues[0].element_kind == ElementKind::triangle);
    CHECK(issues[0].message ==
          "Triangles with an area below 1e-10, or with a position that is not a finite number.");
    CHECK(issues[0].count == 2);
    CHECK(issues[0].elements == Elements{0, 1});
    CHECK_FALSE(issues[0].truncated);
}

TEST_CASE("a triangle with a position that is not finite is degenerate") {
    const float nan = std::numeric_limits<float>::quiet_NaN();
    const float inf = std::numeric_limits<float>::infinity();
    PrimitiveGeometry part;
    part.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0, nan, 0, 0, inf, 1, 0};
    part.triangles = {0, 1, 2, 3, 1, 2, 0, 4, 2};
    Geometry geometry;
    geometry.primitives.push_back(part);
    const auto issues = lint_asset::inspect_degenerate_triangles(geometry);

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].elements == Elements{1, 2});
}

TEST_CASE("degenerate triangles are listed per primitive, ordered, and capped at 1000") {
    Geometry geometry;
    PrimitiveGeometry flat;
    flat.mesh = 1;
    flat.primitive = 2;
    flat.positions = {0, 0, 0, 1, 0, 0, 2, 0, 0};
    for (std::uint32_t t = 0; t < 1500; ++t) {
        flat.triangles.insert(flat.triangles.end(), {0, 1, 2});
    }
    geometry.primitives.push_back(right_triangle(1, 1, 0, 0));  // no issue
    geometry.primitives.push_back(flat);
    const auto issues = lint_asset::inspect_degenerate_triangles(geometry);

    REQUIRE(issues.size() == 1);
    CHECK((issues[0].mesh == 1 && issues[0].primitive == 2));
    CHECK(issues[0].count == 1500);
    REQUIRE(issues[0].elements.size() == lint_asset::MAX_ISSUE_ELEMENTS);
    CHECK(issues[0].elements.back() == lint_asset::MAX_ISSUE_ELEMENTS - 1);
    CHECK(issues[0].truncated);
}

// ---- asset.triangle_count_exceeded ----

TEST_CASE("the triangle limit is exceeded only by more triangles than the limit") {
    const Geometry geometry = one_placed(many_triangles(3));

    SUBCASE("exactly the limit is fine") {
        CHECK(lint_asset::inspect_asset_size(geometry, {.max_triangles = 3}).empty());
    }
    SUBCASE("one more than the limit is a warning") {
        const auto issues = lint_asset::inspect_asset_size(geometry, {.max_triangles = 2});

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::asset_triangle_count_exceeded);
        CHECK(issues[0].severity == Severity::warning);
        CHECK(issues[0].element_kind == ElementKind::asset);
        CHECK(issues[0].message == "The scene draws 3 triangles (limit 2).");
        CHECK(issues[0].count == 1);
        CHECK(issues[0].elements.empty());
        CHECK_FALSE(issues[0].truncated);
        CHECK((issues[0].mesh == 0 && issues[0].primitive == 0));
    }
    SUBCASE("the default limit is 100000") {
        CHECK(lint_asset::inspect_asset_size(one_placed(many_triangles(100000))).empty());
        const auto issues = lint_asset::inspect_asset_size(one_placed(many_triangles(100001)));
        REQUIRE(issues.size() == 1);
        CHECK(issues[0].message == "The scene draws 100001 triangles (limit 100000).");
    }
}

TEST_CASE("a mesh is counted once for every node that places it") {
    Geometry geometry;
    geometry.primitives.push_back(many_triangles(2));
    geometry.instances = {placed(0), placed(0), placed(0)};  // 3 x 2 = 6 drawn

    CHECK(lint_asset::inspect_asset_size(geometry, {.max_triangles = 6}).empty());
    const auto issues = lint_asset::inspect_asset_size(geometry, {.max_triangles = 5});
    REQUIRE(issues.size() == 1);
    CHECK(issues[0].message == "The scene draws 6 triangles (limit 5).");
}

TEST_CASE("all primitives of a placed mesh count, and an unplaced mesh counts nothing") {
    Geometry geometry;
    geometry.primitives.push_back(many_triangles(2, 0));
    PrimitiveGeometry second = many_triangles(3, 0);
    second.primitive = 1;
    geometry.primitives.push_back(second);
    geometry.primitives.push_back(many_triangles(50, 7));  // mesh 7 is never placed
    geometry.instances = {placed(0)};

    CHECK(lint_asset::inspect_asset_size(geometry, {.max_triangles = 5}).empty());
    CHECK(lint_asset::inspect_asset_size(geometry, {.max_triangles = 4}).size() == 1);
}

// ---- asset.scale_too_small / asset.scale_too_large ----

TEST_CASE("a model between the limits has no scale issue") {
    CHECK(lint_asset::inspect_asset_size(one_placed(right_triangle(0.5f, 0.2f))).empty());
}

TEST_CASE("the longest side below 0.01 m is too small, and 0.01 m or more is fine") {
    SUBCASE("0.0099 m") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(0.0099f, 0.001f)));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::asset_scale_too_small);
        CHECK(issues[0].severity == Severity::warning);
        CHECK(issues[0].element_kind == ElementKind::asset);
        CHECK(issues[0].message ==
              "The longest side of the bounding box is 0.0099 m (minimum 0.01 m).");
        CHECK(issues[0].count == 1);
        CHECK(issues[0].elements.empty());
    }
    SUBCASE("0.0101 m") {
        CHECK(lint_asset::inspect_asset_size(one_placed(right_triangle(0.0101f, 0.001f))).empty());
    }
    SUBCASE("0.005 m is written as 0.005") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(0.005f, 0.001f)));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].message ==
              "The longest side of the bounding box is 0.005 m (minimum 0.01 m).");
    }
}

TEST_CASE("the longest side above 1000 m is too large, and 1000 m is fine") {
    SUBCASE("exactly 1000 m") {
        CHECK(lint_asset::inspect_asset_size(one_placed(right_triangle(1000.0f, 1.0f))).empty());
    }
    SUBCASE("1001 m") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(1001.0f, 1.0f)));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::asset_scale_too_large);
        CHECK(issues[0].message ==
              "The longest side of the bounding box is 1001 m (limit 1000 m).");
    }
    SUBCASE("1500 m") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(1500.0f, 1.0f)));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].message ==
              "The longest side of the bounding box is 1500 m (limit 1000 m).");
    }
}

TEST_CASE("numbers in messages have at most four significant digits, in plain notation") {
    const auto message_for = [](float side) {
        const auto issues = lint_asset::inspect_asset_size(one_placed(right_triangle(side, 1.0f)),
                                                           {.max_extent_m = 10.0});
        REQUIRE(issues.size() == 1);
        return issues[0].message;
    };

    CHECK(message_for(12.34f) == "The longest side of the bounding box is 12.34 m (limit 10 m).");
    CHECK(message_for(12.3456f) == "The longest side of the bounding box is 12.35 m (limit 10 m).");
    CHECK(message_for(123456.0f) ==
          "The longest side of the bounding box is 123500 m (limit 10 m).");
}

TEST_CASE("the scale is measured after the node transform, not on the raw vertices") {
    SUBCASE("a centimetre model scaled down by its node is one metre") {
        // Vertices 100 units long, placed with a scale of 0.01: 1 m in the scene.
        CHECK(lint_asset::inspect_asset_size(one_placed(right_triangle(100, 50), scale_by(0.01f)))
                  .empty());
    }
    SUBCASE("a one-metre model scaled by 0.005 is too small") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(1, 0.5f), scale_by(0.005f)));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::asset_scale_too_small);
    }
    SUBCASE("a one-metre model scaled by 1500 is too large") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(1, 0.5f), scale_by(1500)));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::asset_scale_too_large);
    }
}

TEST_CASE("one box covers every placement of every mesh") {
    Geometry geometry;
    geometry.primitives.push_back(right_triangle(1, 1));
    // Each copy is small, but the two are 1500 m apart.
    geometry.instances = {placed(0), placed(0, translate_by(1500, 0, 0))};
    const auto issues = lint_asset::inspect_asset_size(geometry);

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::asset_scale_too_large);
    CHECK(issues[0].message == "The longest side of the bounding box is 1501 m (limit 1000 m).");
}

TEST_CASE("nothing placed, or nothing finite, gives no box and no scale issue") {
    SUBCASE("no instance") {
        Geometry geometry;
        geometry.primitives.push_back(right_triangle(1e-6f, 1e-6f));

        CHECK(lint_asset::inspect_asset_size(geometry).empty());
    }
    SUBCASE("only non-finite positions") {
        PrimitiveGeometry part;
        part.positions = {std::numeric_limits<float>::quiet_NaN(), 0, 0};
        part.triangles = {};

        CHECK(lint_asset::inspect_asset_size(one_placed(part)).empty());
    }
    SUBCASE("a non-finite vertex is ignored, the others still count") {
        PrimitiveGeometry part = right_triangle(1500.0f, 1.0f);
        part.positions.insert(part.positions.end(), {std::numeric_limits<float>::infinity(), 0, 0});
        const auto issues = lint_asset::inspect_asset_size(one_placed(part));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::asset_scale_too_large);
    }
}

TEST_CASE("the limits can be set") {
    const InspectionThresholds thresholds = {
        .max_triangles = 10, .min_extent_m = 1.0, .max_extent_m = 2.0};

    SUBCASE("too small for a custom minimum") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(0.5f, 0.5f)), thresholds);

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].message == "The longest side of the bounding box is 0.5 m (minimum 1 m).");
    }
    SUBCASE("too large for a custom maximum") {
        const auto issues =
            lint_asset::inspect_asset_size(one_placed(right_triangle(3.0f, 0.5f)), thresholds);

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].message == "The longest side of the bounding box is 3 m (limit 2 m).");
    }
}

TEST_CASE("asset issues come out in the order triangle count, too small, too large") {
    // Many tiny triangles: too many, and too small.
    Geometry geometry = one_placed(many_triangles(3));
    geometry.primitives[0].positions.assign(geometry.primitives[0].positions.size(), 0.0f);
    const auto issues = lint_asset::inspect_asset_size(geometry, {.max_triangles = 2});

    REQUIRE(issues.size() == 2);
    CHECK(issues[0].rule == RuleId::asset_triangle_count_exceeded);
    CHECK(issues[1].rule == RuleId::asset_scale_too_small);
}

TEST_CASE("the same input always gives the same issues") {
    const Geometry geometry = one_placed(right_triangle(1500.0f, 1.0f));

    CHECK(lint_asset::inspect_asset_size(geometry) == lint_asset::inspect_asset_size(geometry));
}
