#include "lint_asset/edge_inspection.hpp"

#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <utility>

#include "lint_asset/size_inspection.hpp"

namespace lint_asset {
namespace {

using Position = std::array<std::uint32_t, 3>;
using Edge = std::uint64_t;
constexpr auto INVALID_VERTEX = std::numeric_limits<std::uint32_t>::max();

struct Vertex {
    Position position;
    std::uint64_t offset;
};

Edge edge_key(std::uint32_t a, std::uint32_t b) {
    return (static_cast<Edge>(std::min(a, b)) << 32) | std::max(a, b);
}

bool triangle_edges(const PrimitiveGeometry &part, const std::vector<std::uint32_t> &welded,
                    std::uint64_t offset, std::uint64_t triangle, std::array<Edge, 3> &edges) {
    std::array<std::uint32_t, 3> ids{};
    for (std::uint64_t corner = 0; corner < ids.size(); ++corner) {
        const auto index = part.triangles[triangle * 3 + corner];
        if (index >= part.positions.size() / 3) {
            return false;
        }
        ids[corner] = welded[offset + index];
        if (ids[corner] == INVALID_VERTEX) {
            return false;
        }
    }
    if (ids[0] == ids[1] || ids[1] == ids[2] || ids[2] == ids[0]) {
        return false;
    }
    std::array<double, 3> a{}, b{};
    for (std::size_t axis = 0; axis < 3; ++axis) {
        const double origin =
            part.positions[3 * static_cast<std::size_t>(part.triangles[triangle * 3]) + axis];
        a[axis] =
            static_cast<double>(
                part.positions[3 * static_cast<std::size_t>(part.triangles[triangle * 3 + 1]) +
                               axis]) -
            origin;
        b[axis] =
            static_cast<double>(
                part.positions[3 * static_cast<std::size_t>(part.triangles[triangle * 3 + 2]) +
                               axis]) -
            origin;
    }
    const double area = 0.5 * std::hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                                         a[0] * b[1] - a[1] * b[0]);
    if (area < DEGENERATE_TRIANGLE_AREA) {
        return false;
    }
    edges = {edge_key(ids[0], ids[1]), edge_key(ids[1], ids[2]), edge_key(ids[2], ids[0])};
    return true;
}

void record(Issue &issue, std::uint64_t triangle) {
    ++issue.count;
    if (issue.elements.size() < MAX_ISSUE_ELEMENTS) {
        issue.elements.push_back(static_cast<std::uint32_t>(triangle));
    }
    issue.truncated = issue.count > issue.elements.size();
}

void finish_issue(Issue &issue, std::vector<Edge> &edges, std::vector<Issue> &issues) {
    if (issue.count == 0) {
        return;
    }
    std::sort(edges.begin(), edges.end());
    const auto count =
        static_cast<std::uint64_t>(std::unique(edges.begin(), edges.end()) - edges.begin());
    if (issue.rule == RuleId::mesh_nonmanifold_edge) {
        issue.message = count == 1 ? "1 edge is shared by three or more triangles."
                                   : std::to_string(count) +
                                         " edges are each shared by three or more triangles.";
    } else {
        issue.message = count == 1 ? "1 boundary edge is used by only one triangle."
                                   : std::to_string(count) +
                                         " boundary edges are each used by only one triangle.";
    }
    issues.push_back(std::move(issue));
}

void inspect_mesh(const Geometry &geometry, std::uint64_t first, std::uint64_t end,
                  std::vector<Issue> &issues) {
    std::vector<std::uint64_t> offsets;
    offsets.reserve(end - first);
    std::uint64_t vertex_count = 0;
    std::uint64_t index_count = 0;
    for (std::uint64_t p = first; p < end; ++p) {
        offsets.push_back(vertex_count);
        vertex_count += geometry.primitives[p].positions.size() / 3;
        index_count += geometry.primitives[p].triangles.size();
    }
    if (vertex_count > std::vector<std::uint32_t>().max_size() ||
        vertex_count > std::vector<Vertex>().max_size() ||
        index_count > std::vector<Edge>().max_size()) {
        throw std::length_error("Mesh geometry exceeds inspection capacity.");
    }
    std::vector<std::uint32_t> welded(vertex_count, INVALID_VERTEX);
    {
        std::vector<Vertex> vertices;
        vertices.reserve(vertex_count);
        for (std::uint64_t p = first; p < end; ++p) {
            const auto &positions = geometry.primitives[p].positions;
            for (std::uint64_t v = 0; v < positions.size() / 3; ++v) {
                Position key{};
                bool finite = true;
                for (std::uint64_t axis = 0; axis < key.size(); ++axis) {
                    const float value = positions[3 * v + axis];
                    finite = finite && std::isfinite(value);
                    key[axis] = value == 0 ? 0 : std::bit_cast<std::uint32_t>(value);
                }
                if (finite) {
                    vertices.push_back({key, offsets[p - first] + v});
                }
            }
        }
        std::sort(vertices.begin(), vertices.end(),
                  [](const Vertex &a, const Vertex &b) { return a.position < b.position; });
        std::uint64_t id = 0;
        for (std::uint64_t v = 0; v < vertices.size(); ++v) {
            if (v > 0 && vertices[v].position != vertices[v - 1].position) {
                ++id;
            }
            if (id >= INVALID_VERTEX) {
                throw std::length_error("Mesh has too many distinct positions.");
            }
            welded[vertices[v].offset] = static_cast<std::uint32_t>(id);
        }
    }
    std::vector<Edge> edges;
    edges.reserve(index_count);
    for (std::uint64_t p = first; p < end; ++p) {
        const auto &part = geometry.primitives[p];
        for (std::uint64_t t = 0; t < part.triangles.size() / 3; ++t) {
            std::array<Edge, 3> keys{};
            if (triangle_edges(part, welded, offsets[p - first], t, keys)) {
                edges.insert(edges.end(), keys.begin(), keys.end());
            }
        }
    }
    std::sort(edges.begin(), edges.end());
    std::vector<Edge> boundary;
    std::vector<Edge> nonmanifold;
    for (std::uint64_t begin = 0; begin < edges.size();) {
        auto end_run = begin + 1;
        while (end_run < edges.size() && edges[end_run] == edges[begin]) {
            ++end_run;
        }
        if (end_run - begin == 1) {
            boundary.push_back(edges[begin]);
        } else if (end_run - begin >= 3) {
            nonmanifold.push_back(edges[begin]);
        }
        begin = end_run;
    }
    std::vector<Edge>().swap(edges);
    if (boundary.empty() && nonmanifold.empty()) {
        return;
    }
    for (std::uint64_t p = first; p < end; ++p) {
        const auto &part = geometry.primitives[p];
        Issue nonmanifold_issue{RuleId::mesh_nonmanifold_edge,
                                Severity::error,
                                "",
                                part.mesh,
                                part.primitive,
                                0,
                                {},
                                false};
        Issue boundary_issue{RuleId::mesh_boundary_edge,
                             Severity::warning,
                             "",
                             part.mesh,
                             part.primitive,
                             0,
                             {},
                             false};
        std::vector<Edge> touched_nonmanifold;
        std::vector<Edge> touched_boundary;
        for (std::uint64_t t = 0; t < part.triangles.size() / 3; ++t) {
            std::array<Edge, 3> keys{};
            if (!triangle_edges(part, welded, offsets[p - first], t, keys)) {
                continue;
            }
            bool has_nonmanifold = false;
            bool has_boundary = false;
            for (const auto key : keys) {
                if (std::binary_search(nonmanifold.begin(), nonmanifold.end(), key)) {
                    touched_nonmanifold.push_back(key);
                    has_nonmanifold = true;
                }
                if (std::binary_search(boundary.begin(), boundary.end(), key)) {
                    touched_boundary.push_back(key);
                    has_boundary = true;
                }
            }
            if (has_nonmanifold) {
                record(nonmanifold_issue, t);
            }
            if (has_boundary) {
                record(boundary_issue, t);
            }
        }
        finish_issue(nonmanifold_issue, touched_nonmanifold, issues);
        finish_issue(boundary_issue, touched_boundary, issues);
    }
}

}  // namespace

std::vector<Issue> inspect_edges(const Geometry &geometry) {
    std::vector<Issue> issues;
    for (std::uint64_t first = 0; first < geometry.primitives.size();) {
        auto end = first + 1;
        while (end < geometry.primitives.size() &&
               geometry.primitives[end].mesh == geometry.primitives[first].mesh) {
            ++end;
        }
        inspect_mesh(geometry, first, end, issues);
        first = end;
    }
    return issues;
}

}  // namespace lint_asset
