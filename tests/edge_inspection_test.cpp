#include <doctest/doctest.h>

#include <array>
#include <chrono>
#include <cstdint>
#include <limits>
#include <string>
#include <utility>
#include <vector>

#include "lint_asset/edge_inspection.hpp"

using lint_asset::Geometry;
using lint_asset::Issue;
using lint_asset::PrimitiveGeometry;
using lint_asset::RuleId;
using lint_asset::Severity;

namespace {

using Elements = std::vector<std::uint32_t>;

// Builds a primitive from triangles written out with their three corners, so no two triangles share
// a vertex by index. Welding by position is then the only way to see that they touch.
using Corner = std::array<float, 3>;
using Triangle = std::array<Corner, 3>;

PrimitiveGeometry unshared(const std::vector<Triangle> &triangles, std::uint32_t mesh = 0,
                           std::uint32_t primitive = 0) {
    PrimitiveGeometry part;
    part.mesh = mesh;
    part.primitive = primitive;
    std::uint32_t next = 0;
    for (const Triangle &triangle : triangles) {
        for (const Corner &corner : triangle) {
            part.positions.insert(part.positions.end(), corner.begin(), corner.end());
            part.triangles.push_back(next++);
        }
    }
    return part;
}

Geometry geometry_of(std::vector<PrimitiveGeometry> primitives) {
    Geometry geometry;
    geometry.primitives = std::move(primitives);
    return geometry;
}

std::vector<Issue> issues_with(const std::vector<Issue> &issues, RuleId rule) {
    std::vector<Issue> found;
    for (const Issue &issue : issues) {
        if (issue.rule == rule) {
            found.push_back(issue);
        }
    }
    return found;
}

// A unit cube [0,1]^3 as 12 triangles, two per face in the order -Z, +Z, -X, +X, -Y, +Y.
std::vector<Triangle> cube_triangles() {
    const std::vector<std::array<Corner, 4>> faces = {{
        {{{0, 0, 0}, {0, 1, 0}, {1, 1, 0}, {1, 0, 0}}},
        {{{0, 0, 1}, {1, 0, 1}, {1, 1, 1}, {0, 1, 1}}},
        {{{0, 0, 0}, {0, 0, 1}, {0, 1, 1}, {0, 1, 0}}},
        {{{1, 0, 0}, {1, 1, 0}, {1, 1, 1}, {1, 0, 1}}},
        {{{0, 0, 0}, {1, 0, 0}, {1, 0, 1}, {0, 0, 1}}},
        {{{0, 1, 0}, {0, 1, 1}, {1, 1, 1}, {1, 1, 0}}},
    }};
    std::vector<Triangle> triangles;
    for (const auto &face : faces) {
        triangles.push_back({face[0], face[1], face[2]});
        triangles.push_back({face[0], face[2], face[3]});
    }
    return triangles;
}

const Triangle UNIT = {{{0, 0, 0}, {1, 0, 0}, {0, 1, 0}}};

}  // namespace

TEST_CASE("rule names match the report schema") {
    CHECK(lint_asset::rule_name(RuleId::mesh_nonmanifold_edge) == "mesh.nonmanifold_edge");
    CHECK(lint_asset::rule_name(RuleId::mesh_boundary_edge) == "mesh.boundary_edge");
}

TEST_CASE("a closed cube whose vertices are all written out separately has no issue") {
    // 36 vertices, none shared by index: the edges only match when positions are welded.
    const auto issues = lint_asset::inspect_edges(geometry_of({unshared(cube_triangles())}));

    CHECK(issues.empty());
}

TEST_CASE("a closed tetrahedron with shared vertices has no issue") {
    PrimitiveGeometry part;
    part.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1};
    part.triangles = {0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2};

    CHECK(lint_asset::inspect_edges(geometry_of({part})).empty());
}

TEST_CASE("a single triangle has three boundary edges and is listed once") {
    const auto issues = lint_asset::inspect_edges(geometry_of({unshared({UNIT})}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::mesh_boundary_edge);
    CHECK(issues[0].severity == Severity::warning);
    CHECK(issues[0].message == "3 boundary edges are each used by only one triangle.");
    CHECK(issues[0].mesh == 0);
    CHECK(issues[0].primitive == 0);
    CHECK(issues[0].count == 1);
    CHECK(issues[0].elements == Elements{0});
    CHECK_FALSE(issues[0].truncated);
}

TEST_CASE("exactly one open edge is described in the singular") {
    // An octahedron (8 triangles, every edge used twice) plus a flap triangle that uses two of its
    // edges and adds one new edge: the flap's two shared edges become non-manifold, and its new
    // edge is the only open one. Triangle n of the octahedron has signs (+,+,+) for 0, (+,+,-) for
    // 1, and so on, with the x sign as the highest bit.
    std::vector<Triangle> triangles;
    for (const float sx : {1.0f, -1.0f}) {
        for (const float sy : {1.0f, -1.0f}) {
            for (const float sz : {1.0f, -1.0f}) {
                triangles.push_back({{{sx, 0, 0}, {0, sy, 0}, {0, 0, sz}}});
            }
        }
    }
    triangles.push_back({{{1, 0, 0}, {0, 1, 0}, {-1, 0, 0}}});  // triangle 8, the flap
    const auto issues = lint_asset::inspect_edges(geometry_of({unshared(triangles)}));

    REQUIRE(issues.size() == 2);
    CHECK(issues[0].rule == RuleId::mesh_nonmanifold_edge);
    CHECK(issues[0].message == "2 edges are each shared by three or more triangles.");
    // The edge +x/+y is in triangles 0 and 1, the edge +y/-x in triangles 4 and 5, and both are
    // in 8.
    CHECK(issues[0].elements == Elements{0, 1, 4, 5, 8});
    CHECK(issues[1].rule == RuleId::mesh_boundary_edge);
    CHECK(issues[1].message == "1 boundary edge is used by only one triangle.");
    CHECK(issues[1].elements == Elements{8});
}

TEST_CASE("a quad made of two triangles has four boundary edges and both triangles are listed") {
    const Triangle second = {{{1, 0, 0}, {1, 1, 0}, {0, 1, 0}}};
    const auto issues = lint_asset::inspect_edges(geometry_of({unshared({UNIT, second})}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].message == "4 boundary edges are each used by only one triangle.");
    CHECK(issues[0].elements == Elements{0, 1});
}

TEST_CASE("a cube without its top face has four boundary edges") {
    auto triangles = cube_triangles();
    triangles.resize(10);  // drop the +Y face (the last two triangles)
    const auto issues = lint_asset::inspect_edges(geometry_of({unshared(triangles)}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].rule == RuleId::mesh_boundary_edge);
    CHECK(issues[0].message == "4 boundary edges are each used by only one triangle.");
    // The rim edges belong to triangles 0 (-Z), 3 (+Z), 5 (-X), and 6 (+X).
    CHECK(issues[0].elements == Elements{0, 3, 5, 6});
    CHECK(issues[0].count == 4);
}

TEST_CASE("three triangles around one edge are non-manifold, an error") {
    const Triangle a = {{{0, 0, 0}, {1, 0, 0}, {0, 1, 0}}};
    const Triangle b = {{{0, 0, 0}, {1, 0, 0}, {0, 0, 1}}};
    const Triangle c = {{{0, 0, 0}, {1, 0, 0}, {0, -1, 0}}};
    const auto issues = lint_asset::inspect_edges(geometry_of({unshared({a, b, c})}));

    REQUIRE(issues.size() == 2);
    CHECK(issues[0].rule == RuleId::mesh_nonmanifold_edge);
    CHECK(issues[0].severity == Severity::error);
    CHECK(issues[0].message == "1 edge is shared by three or more triangles.");
    CHECK(issues[0].elements == Elements{0, 1, 2});
    CHECK(issues[0].count == 3);
    // The six other edges are used once each, so the same triangles also touch the rim.
    CHECK(issues[1].rule == RuleId::mesh_boundary_edge);
    CHECK(issues[1].message == "6 boundary edges are each used by only one triangle.");
    CHECK(issues[1].elements == Elements{0, 1, 2});
}

TEST_CASE("four triangles around one edge are also non-manifold") {
    std::vector<Triangle> pages;
    for (const Corner apex :
         {Corner{0, 1, 0}, Corner{0, 0, 1}, Corner{0, -1, 0}, Corner{0, 0, -1}}) {
        pages.push_back({{{0, 0, 0}, {1, 0, 0}, apex}});
    }
    const auto found = issues_with(lint_asset::inspect_edges(geometry_of({unshared(pages)})),
                                   RuleId::mesh_nonmanifold_edge);

    REQUIRE(found.size() == 1);
    CHECK(found[0].elements == Elements{0, 1, 2, 3});
}

TEST_CASE("vertices are joined across the primitives of one mesh") {
    // A quad split into two primitives of one mesh. Their shared diagonal is not an open edge.
    const Triangle second = {{{1, 0, 0}, {1, 1, 0}, {0, 1, 0}}};
    const auto issues =
        lint_asset::inspect_edges(geometry_of({unshared({UNIT}, 0, 0), unshared({second}, 0, 1)}));

    REQUIRE(issues.size() == 2);
    CHECK((issues[0].mesh == 0 && issues[0].primitive == 0));
    CHECK(issues[0].message == "2 boundary edges are each used by only one triangle.");
    CHECK((issues[1].mesh == 0 && issues[1].primitive == 1));
    CHECK(issues[1].message == "2 boundary edges are each used by only one triangle.");
}

TEST_CASE("a closed model split by material has no issue") {
    // The cube's six faces go to two primitives of one mesh.
    const auto all = cube_triangles();
    const std::vector<Triangle> first(all.begin(), all.begin() + 6);
    const std::vector<Triangle> rest(all.begin() + 6, all.end());

    CHECK(lint_asset::inspect_edges(geometry_of({unshared(first, 0, 0), unshared(rest, 0, 1)}))
              .empty());
}

TEST_CASE("different meshes are never joined") {
    const auto issues =
        lint_asset::inspect_edges(geometry_of({unshared({UNIT}, 0, 0), unshared({UNIT}, 1, 0)}));

    REQUIRE(issues.size() == 2);
    CHECK(issues[0].mesh == 0);
    CHECK(issues[0].message == "3 boundary edges are each used by only one triangle.");
    CHECK(issues[1].mesh == 1);
    CHECK(issues[1].message == "3 boundary edges are each used by only one triangle.");
}

TEST_CASE("+0 and -0 are the same position, and a tiny difference is not") {
    SUBCASE("negative zero joins") {
        const Triangle a = {{{0, 0, 0}, {1, 0, 0}, {0, 1, 0}}};
        const Triangle b = {{{-0.0f, -0.0f, -0.0f}, {1, 1, 0}, {1, 0, 0}}};
        const auto issues = lint_asset::inspect_edges(geometry_of({unshared({a, b})}));

        REQUIRE(issues.size() == 1);
        // The edge from (0,0,0) to (1,0,0) is shared, so 4 of the 6 edges are open.
        CHECK(issues[0].message == "4 boundary edges are each used by only one triangle.");
    }
    SUBCASE("a difference of 1e-7 does not join") {
        const Triangle a = {{{0, 0, 0}, {1, 0, 0}, {0, 1, 0}}};
        const Triangle b = {{{0, 0, 1e-7f}, {1, 0, 1e-7f}, {0, -1, 0}}};
        const auto issues = lint_asset::inspect_edges(geometry_of({unshared({a, b})}));

        REQUIRE(issues.size() == 1);
        CHECK(issues[0].message == "6 boundary edges are each used by only one triangle.");
    }
}

TEST_CASE("a triangle with two vertices at one position adds no edges") {
    // A closed tetrahedron plus a collapsed triangle on one of its edges: still closed.
    PrimitiveGeometry part;
    part.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1};
    part.triangles = {0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2, 0, 1, 1};

    CHECK(lint_asset::inspect_edges(geometry_of({part})).empty());
}

TEST_CASE("a triangle with a non-finite position adds no edges") {
    const float nan = std::numeric_limits<float>::quiet_NaN();
    const Triangle broken = {{{nan, 0, 0}, {1, 0, 0}, {0, 1, 0}}};

    CHECK(lint_asset::inspect_edges(geometry_of({unshared({broken})})).empty());
}

TEST_CASE("a long list is cut at 1000 elements but keeps the total count") {
    std::vector<Triangle> far_apart;
    for (std::uint32_t i = 0; i < 1500; ++i) {
        const float x = static_cast<float>(i) * 10.0f;
        far_apart.push_back({{{x, 0, 0}, {x + 1, 0, 0}, {x, 1, 0}}});
    }
    const auto issues = lint_asset::inspect_edges(geometry_of({unshared(far_apart)}));

    REQUIRE(issues.size() == 1);
    CHECK(issues[0].count == 1500);
    REQUIRE(issues[0].elements.size() == lint_asset::MAX_ISSUE_ELEMENTS);
    CHECK(issues[0].elements.front() == 0);
    CHECK(issues[0].elements.back() == lint_asset::MAX_ISSUE_ELEMENTS - 1);
    CHECK(issues[0].truncated);
}

TEST_CASE("issues are ordered by mesh, then primitive, then rule") {
    const Triangle a = {{{0, 0, 0}, {1, 0, 0}, {0, 1, 0}}};
    const Triangle b = {{{0, 0, 0}, {1, 0, 0}, {0, 0, 1}}};
    const Triangle c = {{{0, 0, 0}, {1, 0, 0}, {0, -1, 0}}};
    // Mesh 0 holds a non-manifold edge across two primitives; mesh 2 holds one open triangle.
    const auto issues = lint_asset::inspect_edges(
        geometry_of({unshared({a, b}, 0, 0), unshared({c}, 0, 1), unshared({UNIT}, 2, 0)}));

    REQUIRE(issues.size() == 5);
    CHECK((issues[0].mesh == 0 && issues[0].primitive == 0));
    CHECK(issues[0].rule == RuleId::mesh_nonmanifold_edge);
    CHECK((issues[1].mesh == 0 && issues[1].primitive == 0));
    CHECK(issues[1].rule == RuleId::mesh_boundary_edge);
    CHECK((issues[2].mesh == 0 && issues[2].primitive == 1));
    CHECK(issues[2].rule == RuleId::mesh_nonmanifold_edge);
    CHECK((issues[3].mesh == 0 && issues[3].primitive == 1));
    CHECK(issues[3].rule == RuleId::mesh_boundary_edge);
    CHECK((issues[4].mesh == 2 && issues[4].primitive == 0));
}

TEST_CASE("the same input always gives the same issues") {
    const Geometry geometry = geometry_of({unshared(cube_triangles())});
    auto open = cube_triangles();
    open.resize(9);
    const Geometry holey = geometry_of({unshared(open)});

    CHECK(lint_asset::inspect_edges(holey) == lint_asset::inspect_edges(holey));
    CHECK(lint_asset::inspect_edges(geometry) == lint_asset::inspect_edges(geometry));
}

TEST_CASE("a closed grid of 100,000 triangles is inspected within a second") {
    // A torus-like closed surface: a grid whose last row and column wrap around to the first.
    constexpr std::uint32_t N = 224;  // 224 * 224 * 2 = 100,352 triangles
    PrimitiveGeometry part;
    part.positions.reserve(N * N * 3);
    for (std::uint32_t y = 0; y < N; ++y) {
        for (std::uint32_t x = 0; x < N; ++x) {
            part.positions.insert(part.positions.end(),
                                  {static_cast<float>(x), static_cast<float>(y), 0.0f});
        }
    }
    const auto id = [](std::uint32_t x, std::uint32_t y) { return (y % N) * N + (x % N); };
    for (std::uint32_t y = 0; y < N; ++y) {
        for (std::uint32_t x = 0; x < N; ++x) {
            part.triangles.insert(part.triangles.end(),
                                  {id(x, y), id(x + 1, y), id(x, y + 1), id(x + 1, y),
                                   id(x + 1, y + 1), id(x, y + 1)});
        }
    }
    const Geometry geometry = geometry_of({std::move(part)});

    const auto start = std::chrono::steady_clock::now();
    const auto issues = lint_asset::inspect_edges(geometry);
    const auto elapsed = std::chrono::steady_clock::now() - start;

    CHECK(issues.empty());
    CHECK(elapsed < std::chrono::seconds(1));
}
