#include <doctest/doctest.h>

#include <chrono>
#include <cstdint>
#include <limits>
#include <utility>
#include <vector>

#include "lint_asset/uv_inspection.hpp"

using lint_asset::ElementKind;
using lint_asset::Geometry;
using lint_asset::Issue;
using lint_asset::PrimitiveGeometry;
using lint_asset::RuleId;
using lint_asset::Severity;

namespace {

using Elements = std::vector<std::uint32_t>;
using Floats = std::vector<float>;

// A primitive whose triangles use vertices 0, 1, 2, then 3, 4, 5, and so on, with the given UVs
// (two numbers per vertex). The positions do not matter for the UV checks.
PrimitiveGeometry with_uvs(const Floats &uvs, std::uint32_t mesh = 0, std::uint32_t primitive = 0) {
    PrimitiveGeometry part;
    part.mesh = mesh;
    part.primitive = primitive;
    const std::uint32_t vertices = static_cast<std::uint32_t>(uvs.size() / 2);
    part.positions.assign(3 * vertices, 0.0f);
    part.uvs = uvs;
    for (std::uint32_t v = 0; v + 2 < vertices; v += 3) {
        part.triangles.insert(part.triangles.end(), {v, v + 1, v + 2});
    }
    return part;
}

Geometry geometry_of(std::vector<PrimitiveGeometry> primitives) {
    Geometry geometry;
    geometry.primitives = std::move(primitives);
    return geometry;
}

// A triangle well inside the 0 to 1 square.
const Floats INSIDE = {0.1f, 0.1f, 0.4f, 0.1f, 0.1f, 0.4f};

}  // namespace

TEST_CASE("rule names match the report schema") {
    CHECK(lint_asset::rule_name(RuleId::uv_missing) == "uv.missing");
    CHECK(lint_asset::rule_name(RuleId::uv_out_of_range) == "uv.out_of_range");
}

TEST_CASE("a primitive with valid UVs has no issue") {
    CHECK(lint_asset::inspect_uvs(geometry_of({with_uvs(INSIDE)})).empty());
}

TEST_CASE("a primitive without UVs lists all its triangles as missing, as a warning") {
    PrimitiveGeometry part = with_uvs(INSIDE);
    part.uvs.clear();
    part.positions.assign(3 * 6, 0.0f);
    part.triangles = {0, 1, 2, 3, 4, 5};
    const auto issues = lint_asset::inspect_uvs(geometry_of({part}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::uv_missing);
    CHECK(issues[0].severity == Severity::warning);
    CHECK(issues[0].element_kind == ElementKind::triangle);
    CHECK(issues[0].message == "The primitive has no UV coordinates.");
    CHECK(issues[0].count == 2);
    CHECK(issues[0].elements == Elements{0, 1});
    CHECK_FALSE(issues[0].truncated);
}

TEST_CASE("a corner outside the 0 to 1 square is out of range, as information") {
    // The second triangle has u = 1.5.
    const Floats uvs = {0.1f, 0.1f, 0.4f, 0.1f, 0.1f, 0.4f, 0.5f, 0.5f, 1.5f, 0.5f, 0.5f, 0.9f};
    const auto issues = lint_asset::inspect_uvs(geometry_of({with_uvs(uvs)}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::uv_out_of_range);
    CHECK(issues[0].severity == Severity::info);
    CHECK(issues[0].message == "UV coordinates are outside the 0 to 1 range.");
    CHECK(issues[0].count == 1);
    CHECK(issues[0].elements == Elements{1});
}

TEST_CASE("the edges of the square are inside, with a margin for rounding") {
    const auto flagged = [](float u, float v) {
        const Floats uvs = {u, v, 0.5f, 0.5f, 0.6f, 0.6f};
        return !lint_asset::inspect_uvs(geometry_of({with_uvs(uvs)})).empty();
    };

    CHECK_FALSE(flagged(0.0f, 0.0f));
    CHECK_FALSE(flagged(1.0f, 1.0f));
    CHECK_FALSE(flagged(1.0000001f, 0.5f));  // float rounding of an exporter
    CHECK_FALSE(flagged(-1e-7f, 0.5f));
    CHECK(flagged(1.00001f, 0.5f));
    CHECK(flagged(0.5f, 1.5f));
    CHECK(flagged(-0.00001f, 0.5f));
    CHECK(flagged(0.5f, -2.0f));
}

TEST_CASE("a UV that is not a finite number is out of range") {
    const float nan = std::numeric_limits<float>::quiet_NaN();
    const float inf = std::numeric_limits<float>::infinity();
    const Floats uvs = {nan, 0.1f, 0.4f, 0.1f, 0.1f, 0.4f, 0.1f, inf, 0.4f, 0.1f, 0.1f, 0.4f};
    const auto issues = lint_asset::inspect_uvs(geometry_of({with_uvs(uvs)}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::uv_out_of_range);
    CHECK(issues[0].elements == Elements{0, 1});
}

TEST_CASE("a triangle that uses a vertex that does not exist is skipped") {
    PrimitiveGeometry part = with_uvs(INSIDE);
    part.triangles = {0, 1, 2, 0, 1, 9};

    CHECK(lint_asset::inspect_uvs(geometry_of({part})).empty());
}

TEST_CASE("issues are ordered by mesh, then primitive, then rule, and point to their target") {
    PrimitiveGeometry no_uvs = with_uvs(INSIDE, 0, 0);
    no_uvs.uvs.clear();
    const Floats outside = {1.5f, 0.1f, 1.6f, 0.1f, 1.5f, 0.4f};
    const auto issues = lint_asset::inspect_uvs(
        geometry_of({no_uvs, with_uvs(outside, 0, 1), with_uvs(outside, 2, 0)}));

    REQUIRE(issues.size() == 3);
    CHECK((issues[0].mesh == 0 && issues[0].primitive == 0));
    CHECK(issues[0].rule == RuleId::uv_missing);
    CHECK((issues[1].mesh == 0 && issues[1].primitive == 1));
    CHECK(issues[1].rule == RuleId::uv_out_of_range);
    CHECK((issues[2].mesh == 2 && issues[2].primitive == 0));
}

TEST_CASE("a long list is cut at 1000 elements but keeps the total count") {
    Floats uvs;
    for (int t = 0; t < 1500; ++t) {
        uvs.insert(uvs.end(), {2.0f, 0.1f, 2.3f, 0.1f, 2.0f, 0.4f});
    }
    const auto issues = lint_asset::inspect_uvs(geometry_of({with_uvs(uvs)}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].count == 1500);
    REQUIRE(issues[0].elements.size() == lint_asset::MAX_ISSUE_ELEMENTS);
    CHECK(issues[0].elements.back() == lint_asset::MAX_ISSUE_ELEMENTS - 1);
    CHECK(issues[0].truncated);
}

TEST_CASE("the same input always gives the same issues") {
    const Floats uvs = {0.1f, 0.1f, 1.4f, 0.1f, 0.1f, 0.4f};
    const Geometry geometry = geometry_of({with_uvs(uvs)});

    CHECK(lint_asset::inspect_uvs(geometry) == lint_asset::inspect_uvs(geometry));
}

TEST_CASE("100,000 triangles are checked within a second") {
    Floats uvs;
    uvs.reserve(6 * 100000);
    for (int t = 0; t < 100000; ++t) {
        uvs.insert(uvs.end(), {0.2f, 0.2f, 0.5f, 0.2f, 0.2f, 0.5f});
    }
    const Geometry geometry = geometry_of({with_uvs(uvs)});

    const auto start = std::chrono::steady_clock::now();
    const auto issues = lint_asset::inspect_uvs(geometry);
    const auto elapsed = std::chrono::steady_clock::now() - start;

    CHECK(issues.empty());
    CHECK(elapsed < std::chrono::seconds(1));
}
