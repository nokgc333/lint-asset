#include "lint_asset/normal_inspection.hpp"

#include <array>
#include <cmath>
#include <limits>
#include <utility>

namespace lint_asset {
namespace {

using Vector = std::array<double, 3>;

Vector vertex(const std::vector<float> &values, std::size_t index) {
    return {values[3 * index], values[3 * index + 1], values[3 * index + 2]};
}

Vector subtract(const Vector &a, const Vector &b) {
    return {a[0] - b[0], a[1] - b[1], a[2] - b[2]};
}

Vector cross(const Vector &a, const Vector &b) {
    return {a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]};
}

double length(const Vector &v) { return std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

void record(Issue &issue, std::size_t triangle) {
    ++issue.count;
    if (issue.elements.size() < MAX_ISSUE_ELEMENTS) {
        issue.elements.push_back(static_cast<std::uint32_t>(triangle));
    }
    issue.truncated = issue.count > issue.elements.size();
}

}  // namespace

std::vector<Issue> inspect_normals(const Geometry &geometry) {
    std::vector<Issue> issues;
    for (const auto &part : geometry.primitives) {
        Issue flipped{RuleId::normal_flipped,
                      Severity::error,
                      "Vertex normals point opposite to the face winding.",
                      part.mesh,
                      part.primitive,
                      0,
                      {},
                      false};
        Issue missing{RuleId::normal_missing,
                      Severity::warning,
                      "The primitive has no vertex normals.",
                      part.mesh,
                      part.primitive,
                      0,
                      {},
                      false};
        Issue unnormalized{RuleId::normal_unnormalized,
                           Severity::warning,
                           "Vertex normals are not unit length (outside 1 +/- 0.01).",
                           part.mesh,
                           part.primitive,
                           0,
                           {},
                           false};
        for (std::size_t t = 0; t < part.triangles.size() / 3; ++t) {
            const std::array<std::size_t, 3> indices = {
                part.triangles[3 * t], part.triangles[3 * t + 1], part.triangles[3 * t + 2]};
            const auto vertex_count = part.positions.size() / 3;
            if (indices[0] >= vertex_count || indices[1] >= vertex_count ||
                indices[2] >= vertex_count) {
                continue;
            }
            if (part.normals.empty()) {
                record(missing, t);
                continue;
            }
            const auto normal_count = part.normals.size() / 3;
            if (indices[0] >= normal_count || indices[1] >= normal_count ||
                indices[2] >= normal_count) {
                continue;
            }
            Vector sum{};
            bool nonunit = false;
            for (const auto index : indices) {
                const auto normal = vertex(part.normals, index);
                const double magnitude = length(normal);
                nonunit = nonunit || !std::isfinite(magnitude) ||
                          std::abs(magnitude - 1) >
                              NORMAL_LENGTH_TOLERANCE + std::numeric_limits<float>::epsilon();
                if (magnitude > 0 && std::isfinite(magnitude)) {
                    for (std::size_t axis = 0; axis < sum.size(); ++axis) {
                        sum[axis] += normal[axis] / magnitude;
                    }
                }
            }
            if (nonunit) {
                record(unnormalized, t);
            }
            const auto origin = vertex(part.positions, indices[0]);
            const auto face = cross(subtract(vertex(part.positions, indices[1]), origin),
                                    subtract(vertex(part.positions, indices[2]), origin));
            const double face_length = length(face);
            const double sum_length = length(sum);
            // The cross product has twice the area of the triangle.
            const bool has_reliable_face =
                std::isfinite(face_length) && face_length * 0.5 >= MIN_FACE_AREA;
            if (has_reliable_face && sum_length > 0) {
                double dot = 0;
                for (std::size_t axis = 0; axis < face.size(); ++axis) {
                    dot += (face[axis] / face_length) * (sum[axis] / sum_length);
                }
                if (dot < -FLIP_EPSILON) {
                    record(flipped, t);
                }
            }
        }
        for (auto *issue : {&flipped, &missing, &unnormalized}) {
            if (issue->count > 0) {
                issues.push_back(std::move(*issue));
            }
        }
    }
    return issues;
}

}  // namespace lint_asset
