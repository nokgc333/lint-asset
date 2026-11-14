#include "lint_asset/uv_inspection.hpp"

#include <array>
#include <cmath>
#include <utility>

namespace lint_asset {

std::vector<Issue> inspect_uvs(const Geometry &geometry) {
    std::vector<Issue> issues;
    for (const auto &part : geometry.primitives) {
        const bool missing = part.uvs.empty();
        Issue issue{missing ? RuleId::uv_missing : RuleId::uv_out_of_range,
                    missing ? Severity::warning : Severity::info,
                    missing ? "The primitive has no UV coordinates."
                            : "UV coordinates are outside the 0 to 1 range.",
                    part.mesh,
                    part.primitive,
                    0,
                    {},
                    false};
        for (std::size_t t = 0; t < part.triangles.size() / 3; ++t) {
            bool affected = missing;
            if (!missing) {
                const std::array<std::size_t, 3> indices = {
                    part.triangles[3 * t], part.triangles[3 * t + 1], part.triangles[3 * t + 2]};
                const auto vertex_count = part.uvs.size() / 2;
                if (indices[0] >= vertex_count || indices[1] >= vertex_count ||
                    indices[2] >= vertex_count) {
                    continue;
                }
                for (const auto index : indices) {
                    for (std::size_t axis = 0; axis < 2; ++axis) {
                        const double coordinate = part.uvs[2 * index + axis];
                        affected = affected || !std::isfinite(coordinate) ||
                                   coordinate < -UV_RANGE_TOLERANCE ||
                                   coordinate > 1 + UV_RANGE_TOLERANCE;
                    }
                }
            }
            if (affected) {
                ++issue.count;
                if (issue.elements.size() < MAX_ISSUE_ELEMENTS) {
                    issue.elements.push_back(static_cast<std::uint32_t>(t));
                }
            }
        }
        issue.truncated = issue.count > issue.elements.size();
        if (issue.count > 0) {
            issues.push_back(std::move(issue));
        }
    }
    return issues;
}

}  // namespace lint_asset
