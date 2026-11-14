#include <doctest/doctest.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
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

TEST_CASE("100,000 triangles of a tiled layout are checked within a second") {
    // The 0 to 1 square cut into 224 x 224 cells, each cell into two triangles: no overlap
    // anywhere, and every edge is shared, so the whole texture is covered exactly once.
    constexpr int N = 224;
    Floats uvs;
    uvs.reserve(12 * N * N);
    for (int y = 0; y < N; ++y) {
        for (int x = 0; x < N; ++x) {
            const float u0 = static_cast<float>(x) / N;
            const float u1 = static_cast<float>(x + 1) / N;
            const float v0 = static_cast<float>(y) / N;
            const float v1 = static_cast<float>(y + 1) / N;
            uvs.insert(uvs.end(), {u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1});
        }
    }
    const Geometry geometry = geometry_of({with_uvs(uvs)});

    const auto start = std::chrono::steady_clock::now();
    const auto issues = lint_asset::inspect_uvs(geometry);
    const auto elapsed = std::chrono::steady_clock::now() - start;

    CHECK(issues.empty());
    CHECK(elapsed < std::chrono::seconds(1));
}

// ---- uv.overlap ----

namespace {

using Triangle = std::array<float, 6>;  // u0 v0 u1 v1 u2 v2

// A primitive made of the given UV triangles, each with its own three vertices.
PrimitiveGeometry layout(const std::vector<Triangle> &triangles, std::uint32_t mesh = 0,
                         std::uint32_t primitive = 0) {
    Floats uvs;
    for (const Triangle &triangle : triangles) {
        uvs.insert(uvs.end(), triangle.begin(), triangle.end());
    }
    return with_uvs(uvs, mesh, primitive);
}

std::vector<Issue> overlaps(const std::vector<PrimitiveGeometry> &primitives) {
    std::vector<Issue> found;
    for (const Issue &issue : lint_asset::inspect_uvs(geometry_of(primitives))) {
        if (issue.rule == RuleId::uv_overlap) {
            found.push_back(issue);
        }
    }
    return found;
}

const char *const SAME = "Triangles overlap in UV space.";
const char *const MIRRORED =
    "Triangles overlap in UV space in a mirrored layout (for example, left and right halves that "
    "share one area).";

// A right triangle in the lower left of the square, counter-clockwise in UV space, and the same
// three points in the opposite order.
const Triangle A = {0.1f, 0.1f, 0.5f, 0.1f, 0.1f, 0.5f};
const Triangle A_REVERSED = {0.1f, 0.5f, 0.5f, 0.1f, 0.1f, 0.1f};

}  // namespace

TEST_CASE("the rule name matches the report schema") {
    CHECK(lint_asset::rule_name(RuleId::uv_overlap) == "uv.overlap");
}

TEST_CASE("the same triangle twice overlaps, and that is an error") {
    const auto found = overlaps({layout({A, A})});

    REQUIRE(found.size() == 1);
    CHECK(found[0].severity == Severity::error);
    CHECK(found[0].element_kind == ElementKind::triangle);
    CHECK(found[0].message == SAME);
    CHECK(found[0].count == 2);
    CHECK(found[0].elements == Elements{0, 1});
    CHECK_FALSE(found[0].truncated);
}

TEST_CASE("two triangles that cover part of the same area overlap") {
    const Triangle b = {0.2f, 0.2f, 0.6f, 0.2f, 0.2f, 0.6f};
    const auto found = overlaps({layout({A, b})});

    REQUIRE(found.size() == 1);
    CHECK(found[0].severity == Severity::error);
    CHECK(found[0].elements == Elements{0, 1});
}

TEST_CASE("triangles in different places do not overlap") {
    const Triangle far = {0.6f, 0.6f, 0.9f, 0.6f, 0.6f, 0.9f};

    CHECK(overlaps({layout({A, far})}).empty());
}

TEST_CASE("triangles that share only an edge or only a corner do not overlap") {
    SUBCASE("two halves of a square, cut along the diagonal") {
        // The diagonal runs through pixel centres, so the edge rule matters.
        const Triangle lower = {0.0f, 0.0f, 1.0f, 0.0f, 1.0f, 1.0f};
        const Triangle upper = {0.0f, 0.0f, 1.0f, 1.0f, 0.0f, 1.0f};

        CHECK(overlaps({layout({lower, upper})}).empty());
    }
    SUBCASE("a corner shared by two triangles") {
        const Triangle left = {0.1f, 0.1f, 0.3f, 0.1f, 0.2f, 0.3f};
        const Triangle right = {0.3f, 0.1f, 0.5f, 0.1f, 0.4f, 0.3f};

        CHECK(overlaps({layout({left, right})}).empty());
    }
}

TEST_CASE("a grid of squares cut into triangles has no overlap, aligned to pixels or not") {
    for (const int n : {8, 7, 13, 64}) {
        CAPTURE(n);
        std::vector<Triangle> triangles;
        for (int y = 0; y < n; ++y) {
            for (int x = 0; x < n; ++x) {
                const float u0 = static_cast<float>(x) / n;
                const float u1 = static_cast<float>(x + 1) / n;
                const float v0 = static_cast<float>(y) / n;
                const float v1 = static_cast<float>(y + 1) / n;
                triangles.push_back({u0, v0, u1, v0, u1, v1});
                triangles.push_back({u0, v0, u1, v1, u0, v1});
            }
        }

        CHECK(overlaps({layout(triangles)}).empty());
    }
}

TEST_CASE("an overlap with the opposite orientation is a mirrored layout, and only a warning") {
    const auto found = overlaps({layout({A, A_REVERSED})});

    REQUIRE(found.size() == 1);
    CHECK(found[0].severity == Severity::warning);
    CHECK(found[0].message == MIRRORED);
    CHECK(found[0].count == 2);
    CHECK(found[0].elements == Elements{0, 1});
}

TEST_CASE("a triangle that overlaps in both ways is listed with the error") {
    // Triangles 0 and 1 are the same triangle; triangle 2 is its mirror image.
    const auto found = overlaps({layout({A, A, A_REVERSED})});

    REQUIRE(found.size() == 2);
    CHECK(found[0].severity == Severity::error);
    CHECK(found[0].elements == Elements{0, 1});
    CHECK(found[1].severity == Severity::warning);
    CHECK(found[1].elements == Elements{2});
}

TEST_CASE("a triangle with no area in UV space is not drawn") {
    const Triangle line = {0.1f, 0.1f, 0.3f, 0.3f, 0.5f, 0.5f};

    CHECK(overlaps({layout({A, line})}).empty());
}

TEST_CASE("only the part inside the 0 to 1 square is drawn") {
    SUBCASE("two copies wholly outside do not overlap here, but are out of range") {
        const Triangle outside = {2.0f, 0.1f, 2.4f, 0.1f, 2.0f, 0.4f};
        const auto issues = lint_asset::inspect_uvs(geometry_of({layout({outside, outside})}));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].rule == RuleId::uv_out_of_range);
    }
    SUBCASE("a triangle across the border overlaps one inside") {
        const Triangle across = {-0.5f, 0.2f, 0.5f, 0.2f, 0.0f, 0.8f};
        const Triangle inside = {0.1f, 0.3f, 0.4f, 0.3f, 0.25f, 0.6f};
        const auto issues = lint_asset::inspect_uvs(geometry_of({layout({across, inside})}));

        REQUIRE(issues.size() == 2);
        CHECK(issues[0].rule == RuleId::uv_out_of_range);
        CHECK(issues[0].elements == Elements{0});
        CHECK(issues[1].rule == RuleId::uv_overlap);
        CHECK(issues[1].elements == Elements{0, 1});
    }
}

TEST_CASE("a triangle with a corner that is not finite is not drawn") {
    const float nan = std::numeric_limits<float>::quiet_NaN();
    const Triangle broken = {0.1f, 0.1f, nan, 0.1f, 0.1f, 0.5f};

    CHECK(overlaps({layout({A, broken})}).empty());
}

TEST_CASE("only a triangle that contains a pixel centre can overlap") {
    SUBCASE("a triangle smaller than a pixel, with no centre inside, is not drawn") {
        const Triangle tiny = {0.3f, 0.3f, 0.3001f, 0.3f, 0.3f, 0.3001f};

        CHECK(overlaps({layout({tiny, tiny})}).empty());
    }
    SUBCASE("a small triangle with one centre inside is") {
        // Pixel units: (512,512) (514,512) (512,514). The exact binary fractions keep the corners
        // exactly where they are written.
        const Triangle small = {0.5f, 0.5f, 0.501953125f, 0.5f, 0.5f, 0.501953125f};
        const auto found = overlaps({layout({small, small})});

        REQUIRE(found.size() == 1);
        CHECK(found[0].elements == Elements{0, 1});
    }
}

TEST_CASE("each primitive is checked on its own") {
    const auto found = overlaps({layout({A}, 0, 0), layout({A}, 0, 1), layout({A, A}, 1, 0)});

    REQUIRE(found.size() == 1);
    CHECK((found[0].mesh == 1 && found[0].primitive == 0));
}

TEST_CASE("a primitive without UVs has nothing to overlap") {
    PrimitiveGeometry none = layout({A, A});
    none.uvs.clear();

    CHECK(overlaps({none}).empty());
}

TEST_CASE("overlap issues come after the other UV issues of the same primitive") {
    const Triangle outside = {2.0f, 0.1f, 2.4f, 0.1f, 2.0f, 0.4f};
    const auto issues = lint_asset::inspect_uvs(geometry_of({layout({A, A, outside})}));

    REQUIRE(issues.size() == 2);
    CHECK(issues[0].rule == RuleId::uv_out_of_range);
    CHECK(issues[1].rule == RuleId::uv_overlap);
}

TEST_CASE("a long list of overlapping triangles is cut at 1000 elements") {
    const Triangle small = {0.1f, 0.1f, 0.2f, 0.1f, 0.1f, 0.2f};
    const auto found = overlaps({layout(std::vector<Triangle>(1500, small))});

    REQUIRE(found.size() == 1);
    CHECK(found[0].count == 1500);
    REQUIRE(found[0].elements.size() == lint_asset::MAX_ISSUE_ELEMENTS);
    CHECK(found[0].elements.back() == lint_asset::MAX_ISSUE_ELEMENTS - 1);
    CHECK(found[0].truncated);
}

TEST_CASE("a crafted file with thousands of full-texture triangles stops early") {
    // Each triangle covers about half of the texture. Drawing all 3000 would take a very long time;
    // the work limit stops it after a few dozen, and those are reported.
    const Triangle half = {0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f};
    const auto start = std::chrono::steady_clock::now();
    const auto found = overlaps({layout(std::vector<Triangle>(3000, half))});
    const auto elapsed = std::chrono::steady_clock::now() - start;

    REQUIRE(found.size() == 1);
    CHECK(found[0].severity == Severity::error);
    CHECK(found[0].count >= 30);
    CHECK(found[0].count <= 40);
    CHECK(found[0].elements.front() == 0);
    CHECK(elapsed < std::chrono::seconds(10));
}

// ---- a reference implementation, to check the real one against ----

namespace {

struct Fixed {
    std::int64_t x;
    std::int64_t y;
};

Fixed to_fixed(float u, float v) {
    const auto convert = [](float value) {
        const double clamped =
            std::clamp(static_cast<double>(value), -lint_asset::UV_COORDINATE_LIMIT,
                       lint_asset::UV_COORDINATE_LIMIT);
        return static_cast<std::int64_t>(std::llround(clamped * 1024.0 * 256.0));
    };
    return {convert(u), convert(v)};
}

// The pixel-by-pixel version of the rules in uv_inspection.hpp, with no cleverness.
struct Reference {
    std::vector<bool> same;
    std::vector<bool> mirrored;
};

Reference reference_overlaps(const std::vector<Triangle> &triangles) {
    constexpr int SIZE = lint_asset::UV_RASTER_SIZE;
    Reference result{std::vector<bool>(triangles.size(), false),
                     std::vector<bool>(triangles.size(), false)};
    std::vector<int> first_positive(static_cast<std::size_t>(SIZE) * SIZE, -1);
    std::vector<int> first_negative(static_cast<std::size_t>(SIZE) * SIZE, -1);
    for (std::size_t t = 0; t < triangles.size(); ++t) {
        const Triangle &tri = triangles[t];
        Fixed a = to_fixed(tri[0], tri[1]);
        Fixed b = to_fixed(tri[2], tri[3]);
        Fixed c = to_fixed(tri[4], tri[5]);
        const std::int64_t area2 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (area2 == 0) {
            continue;
        }
        const bool positive = area2 > 0;
        if (!positive) {
            std::swap(b, c);
        }
        const std::array<std::array<Fixed, 2>, 3> edges = {{{a, b}, {b, c}, {c, a}}};
        // Only the pixels near the triangle can be covered, so look at its box (a pixel more on
        // each side).
        const auto low = [](std::int64_t value) {
            return static_cast<int>(std::clamp<std::int64_t>(value / 256 - 1, 0, SIZE - 1));
        };
        const auto high = [](std::int64_t value) {
            return static_cast<int>(std::clamp<std::int64_t>(value / 256 + 1, 0, SIZE - 1));
        };
        const int first_x = low(std::min({a.x, b.x, c.x}));
        const int last_x = high(std::max({a.x, b.x, c.x}));
        const int first_y = low(std::min({a.y, b.y, c.y}));
        const int last_y = high(std::max({a.y, b.y, c.y}));
        for (int j = first_y; j <= last_y; ++j) {
            for (int i = first_x; i <= last_x; ++i) {
                const Fixed centre = {i * 256 + 128, j * 256 + 128};
                bool covered = true;
                for (const auto &edge : edges) {
                    const std::int64_t dx = edge[1].x - edge[0].x;
                    const std::int64_t dy = edge[1].y - edge[0].y;
                    const std::int64_t w =
                        dx * (centre.y - edge[0].y) - dy * (centre.x - edge[0].x);
                    covered = covered && (w > 0 || (w == 0 && (dy > 0 || (dy == 0 && dx < 0))));
                }
                if (!covered) {
                    continue;
                }
                auto &same_slot = positive ? first_positive : first_negative;
                auto &other_slot = positive ? first_negative : first_positive;
                const std::size_t pixel = static_cast<std::size_t>(j) * SIZE + i;
                if (same_slot[pixel] >= 0) {
                    result.same[static_cast<std::size_t>(same_slot[pixel])] = true;
                    result.same[t] = true;
                }
                if (other_slot[pixel] >= 0) {
                    result.mirrored[static_cast<std::size_t>(other_slot[pixel])] = true;
                    result.mirrored[t] = true;
                }
                if (same_slot[pixel] < 0) {
                    same_slot[pixel] = static_cast<int>(t);
                }
            }
        }
    }
    return result;
}

}  // namespace

TEST_CASE("the result equals a pixel-by-pixel reference on many random triangles") {
    // A small deterministic generator, so a failure can be repeated.
    std::uint32_t state = 12345;
    const auto next = [&state]() {
        state = state * 1664525u + 1013904223u;
        return static_cast<float>((state >> 8) & 0xFFFF) / 65536.0f;
    };

    for (int round = 0; round < 6; ++round) {
        CAPTURE(round);
        // Corners in a window that gets smaller each round, so overlaps get more frequent.
        const float window = 0.5f / static_cast<float>(1 << round);
        std::vector<Triangle> triangles;
        for (int t = 0; t < 30; ++t) {
            Triangle tri{};
            for (float &value : tri) {
                value = 0.1f + next() * window;
            }
            triangles.push_back(tri);
        }

        const Reference expected = reference_overlaps(triangles);
        const auto found = overlaps({layout(triangles)});

        Elements error_elements;
        Elements warning_elements;
        for (std::size_t t = 0; t < triangles.size(); ++t) {
            if (expected.same[t]) {
                error_elements.push_back(static_cast<std::uint32_t>(t));
            } else if (expected.mirrored[t]) {
                warning_elements.push_back(static_cast<std::uint32_t>(t));
            }
        }
        Elements actual_errors;
        Elements actual_warnings;
        for (const Issue &issue : found) {
            (issue.severity == Severity::error ? actual_errors : actual_warnings) = issue.elements;
        }
        CHECK(actual_errors == error_elements);
        CHECK(actual_warnings == warning_elements);
    }
}
