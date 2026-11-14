#include <doctest/doctest.h>

#include <chrono>
#include <cmath>
#include <cstdint>
#include <limits>
#include <vector>

#include "lint_asset/normal_inspection.hpp"

using lint_asset::Geometry;
using lint_asset::Issue;
using lint_asset::PrimitiveGeometry;
using lint_asset::RuleId;
using lint_asset::Severity;

namespace {

using Floats = std::vector<float>;
using Elements = std::vector<std::uint32_t>;

// One triangle in the XY plane, counter-clockwise seen from +Z, so its face normal is +Z.
const Floats TRIANGLE = {0, 0, 0, 1, 0, 0, 0, 1, 0};

Geometry geometry_of(PrimitiveGeometry primitive) {
    Geometry geometry;
    geometry.primitives.push_back(std::move(primitive));
    return geometry;
}

PrimitiveGeometry triangle_with(const Floats &normals, std::uint32_t mesh = 0,
                                std::uint32_t primitive = 0) {
    PrimitiveGeometry part;
    part.mesh = mesh;
    part.primitive = primitive;
    part.positions = TRIANGLE;
    part.normals = normals;
    part.triangles = {0, 1, 2};
    return part;
}

const Floats UP = {0, 0, 1, 0, 0, 1, 0, 0, 1};
const Floats DOWN = {0, 0, -1, 0, 0, -1, 0, 0, -1};

}  // namespace

TEST_CASE("rule and severity names match the report schema") {
    CHECK(lint_asset::rule_name(RuleId::normal_flipped) == "normal.flipped");
    CHECK(lint_asset::rule_name(RuleId::normal_missing) == "normal.missing");
    CHECK(lint_asset::rule_name(RuleId::normal_unnormalized) == "normal.unnormalized");
    CHECK(lint_asset::severity_name(Severity::error) == "error");
    CHECK(lint_asset::severity_name(Severity::warning) == "warning");
    CHECK(lint_asset::severity_name(Severity::info) == "info");
}

TEST_CASE("normals that agree with the winding give no issue") {
    CHECK(lint_asset::inspect_normals(geometry_of(triangle_with(UP))).empty());
}

TEST_CASE("normals opposite to the winding are a flipped error") {
    const auto issues = lint_asset::inspect_normals(geometry_of(triangle_with(DOWN)));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::normal_flipped);
    CHECK(issues[0].severity == Severity::error);
    CHECK(issues[0].message == "Vertex normals point opposite to the face winding.");
    CHECK(issues[0].mesh == 0);
    CHECK(issues[0].primitive == 0);
    CHECK(issues[0].count == 1);
    CHECK(issues[0].elements == Elements{0});
    CHECK_FALSE(issues[0].truncated);
}

TEST_CASE("one wrong vertex normal out of three is outweighed by the other two") {
    const Floats one_wrong = {0, 0, 1, 0, 0, -1, 0, 0, 1};
    CHECK(lint_asset::inspect_normals(geometry_of(triangle_with(one_wrong))).empty());
}

TEST_CASE("two wrong vertex normals out of three make the triangle flipped") {
    const Floats two_wrong = {0, 0, -1, 0, 0, -1, 0, 0, 1};
    const auto issues = lint_asset::inspect_normals(geometry_of(triangle_with(two_wrong)));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::normal_flipped);
}

TEST_CASE("normals at 90 degrees to the face are not flipped") {
    const Floats sideways = {1, 0, 0, 1, 0, 0, 1, 0, 0};
    CHECK(lint_asset::inspect_normals(geometry_of(triangle_with(sideways))).empty());
}

TEST_CASE("smooth normals that lean away from the face are not flipped") {
    // 60 degrees away from +Z on each vertex, as on a rounded edge.
    const float s = std::sin(1.0471976f);  // 60 degrees
    const float c = std::cos(1.0471976f);
    const Floats leaning = {s, 0, c, 0, s, c, -s, 0, c};
    CHECK(lint_asset::inspect_normals(geometry_of(triangle_with(leaning))).empty());
}

TEST_CASE("a zero-length vertex normal does not count in the flip test") {
    const Floats with_zero = {0, 0, 0, 0, 0, -1, 0, 0, -1};
    const auto issues = lint_asset::inspect_normals(geometry_of(triangle_with(with_zero)));

    bool flipped = false;
    for (const Issue &issue : issues) {
        flipped = flipped || issue.rule == RuleId::normal_flipped;
    }
    CHECK(flipped);
}

TEST_CASE("a triangle with no area is skipped by the flip test") {
    PrimitiveGeometry part = triangle_with(DOWN);
    part.positions = {0, 0, 0, 1, 0, 0, 2, 0, 0};  // three points on a line

    CHECK(lint_asset::inspect_normals(geometry_of(part)).empty());
}

TEST_CASE("a triangle too small to have a reliable face normal is left to the degenerate rule") {
    // The area limit is 1e-10, the same as the degenerate-triangle check.
    const auto scaled = [](float side) {
        PrimitiveGeometry part = triangle_with(DOWN);
        for (float &value : part.positions) {
            value *= side;
        }
        return part;
    };

    SUBCASE("area 5e-13: skipped") {
        CHECK(lint_asset::inspect_normals(geometry_of(scaled(1e-6f))).empty());
    }
    SUBCASE("area 5e-9: checked") {
        const auto issues = lint_asset::inspect_normals(geometry_of(scaled(1e-4f)));
        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::normal_flipped);
    }
}

TEST_CASE("a primitive without normals lists all its triangles as missing, as a warning") {
    PrimitiveGeometry part = triangle_with({});
    part.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0};
    part.triangles = {0, 1, 2, 2, 1, 3};
    const auto issues = lint_asset::inspect_normals(geometry_of(part));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::normal_missing);
    CHECK(issues[0].severity == Severity::warning);
    CHECK(issues[0].message == "The primitive has no vertex normals.");
    CHECK(issues[0].count == 2);
    CHECK(issues[0].elements == Elements{0, 1});
    CHECK_FALSE(issues[0].truncated);
}

TEST_CASE("the length limit is 1 plus or minus 0.01") {
    const auto lengths = [](float length) {
        return Floats{0, 0, length, 0, 0, length, 0, 0, length};
    };

    SUBCASE("inside the limit") {
        CHECK(lint_asset::inspect_normals(geometry_of(triangle_with(lengths(1.0f)))).empty());
        CHECK(lint_asset::inspect_normals(geometry_of(triangle_with(lengths(1.009f)))).empty());
        CHECK(lint_asset::inspect_normals(geometry_of(triangle_with(lengths(0.991f)))).empty());
    }
    SUBCASE("outside the limit") {
        for (const float length : {1.011f, 0.989f, 2.0f, 0.5f}) {
            CAPTURE(length);
            const auto issues =
                lint_asset::inspect_normals(geometry_of(triangle_with(lengths(length))));
            REQUIRE(issues.size() == 1);
            CHECK(issues[0].rule == RuleId::normal_unnormalized);
            CHECK(issues[0].severity == Severity::warning);
            CHECK(issues[0].message == "Vertex normals are not unit length (outside 1 +/- 0.01).");
            CHECK(issues[0].elements == Elements{0});
        }
    }
}

TEST_CASE("a triangle with any one non-unit vertex normal is unnormalized") {
    const Floats one_long = {0, 0, 1, 0, 0, 3, 0, 0, 1};
    const auto issues = lint_asset::inspect_normals(geometry_of(triangle_with(one_long)));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::normal_unnormalized);
}

TEST_CASE("a zero-length or non-finite normal is unnormalized") {
    const float nan = std::numeric_limits<float>::quiet_NaN();
    const Floats zero = {0, 0, 0, 0, 0, 1, 0, 0, 1};
    const Floats broken = {0, 0, nan, 0, 0, 1, 0, 0, 1};

    for (const Floats &normals : {zero, broken}) {
        const auto issues = lint_asset::inspect_normals(geometry_of(triangle_with(normals)));
        bool found = false;
        for (const Issue &issue : issues) {
            found = found || issue.rule == RuleId::normal_unnormalized;
        }
        CHECK(found);
    }
}

TEST_CASE("a flipped and unnormalized triangle gets both issues, in a fixed order") {
    const Floats flipped_long = {0, 0, -2, 0, 0, -2, 0, 0, -2};
    const auto issues = lint_asset::inspect_normals(geometry_of(triangle_with(flipped_long)));

    REQUIRE(issues.size() == 2);
    CHECK(issues[0].rule == RuleId::normal_flipped);
    CHECK(issues[1].rule == RuleId::normal_unnormalized);
}

TEST_CASE("issues are ordered by mesh, then primitive, and point to the right target") {
    Geometry geometry;
    geometry.primitives.push_back(triangle_with(DOWN, 0, 0));
    geometry.primitives.push_back(triangle_with({}, 0, 1));
    geometry.primitives.push_back(triangle_with(DOWN, 2, 0));
    const auto issues = lint_asset::inspect_normals(geometry);

    REQUIRE(issues.size() == 3);
    CHECK((issues[0].mesh == 0 && issues[0].primitive == 0));
    CHECK(issues[0].rule == RuleId::normal_flipped);
    CHECK((issues[1].mesh == 0 && issues[1].primitive == 1));
    CHECK(issues[1].rule == RuleId::normal_missing);
    CHECK((issues[2].mesh == 2 && issues[2].primitive == 0));
}

TEST_CASE("only the affected triangles are listed, in ascending order") {
    // Three triangles; the middle one is flipped.
    PrimitiveGeometry part;
    part.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0,
                      0, 2, 1, 0, 4, 0, 0, 5, 0, 0, 4, 1, 0};
    part.normals = {0,  0, 1, 0,  0, 1, 0, 0, 1, 0, 0, -1, 0, 0,
                    -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0,  1};
    part.triangles = {0, 1, 2, 3, 4, 5, 6, 7, 8};
    const auto issues = lint_asset::inspect_normals(geometry_of(part));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].count == 1);
    CHECK(issues[0].elements == Elements{1});
}

TEST_CASE("a long list is cut at 1000 elements but keeps the total count") {
    constexpr std::uint32_t TRIANGLES = 1500;
    PrimitiveGeometry part;
    part.normals.assign(3 * 3 * TRIANGLES, 0.0f);
    for (std::uint32_t t = 0; t < TRIANGLES; ++t) {
        const float x = static_cast<float>(t) * 2.0f;
        part.positions.insert(part.positions.end(), {x, 0, 0, x + 1, 0, 0, x, 1, 0});
        for (std::uint32_t v = 0; v < 3; ++v) {
            part.normals[(3 * t + v) * 3 + 2] = -1.0f;
        }
        part.triangles.insert(part.triangles.end(), {3 * t, 3 * t + 1, 3 * t + 2});
    }
    const auto issues = lint_asset::inspect_normals(geometry_of(part));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].count == TRIANGLES);
    REQUIRE(issues[0].elements.size() == lint_asset::MAX_ISSUE_ELEMENTS);
    CHECK(issues[0].elements.front() == 0);
    CHECK(issues[0].elements.back() == lint_asset::MAX_ISSUE_ELEMENTS - 1);
    CHECK(issues[0].truncated);
}

TEST_CASE("the same input always gives the same issues") {
    const Geometry geometry = geometry_of(triangle_with(DOWN));

    CHECK(lint_asset::inspect_normals(geometry) == lint_asset::inspect_normals(geometry));
}

TEST_CASE("100,000 triangles are inspected within a second") {
    constexpr std::uint32_t TRIANGLES = 100000;
    PrimitiveGeometry part;
    part.positions.reserve(9 * TRIANGLES);
    part.normals.reserve(9 * TRIANGLES);
    part.triangles.reserve(3 * TRIANGLES);
    for (std::uint32_t t = 0; t < TRIANGLES; ++t) {
        const float x = static_cast<float>(t % 1000);
        const float y = static_cast<float>(t / 1000);
        part.positions.insert(part.positions.end(), {x, y, 0, x + 1, y, 0, x, y + 1, 0});
        part.normals.insert(part.normals.end(), {0, 0, 1, 0, 0, 1, 0, 0, 1});
        part.triangles.insert(part.triangles.end(), {3 * t, 3 * t + 1, 3 * t + 2});
    }
    const Geometry geometry = geometry_of(std::move(part));

    const auto start = std::chrono::steady_clock::now();
    const auto issues = lint_asset::inspect_normals(geometry);
    const auto elapsed = std::chrono::steady_clock::now() - start;

    CHECK(issues.empty());
    CHECK(elapsed < std::chrono::seconds(1));
}
