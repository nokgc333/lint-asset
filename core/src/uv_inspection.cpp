#include "lint_asset/uv_inspection.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <utility>

namespace lint_asset {

namespace {

constexpr std::int64_t SUBPIXEL_SCALE = std::int64_t{1} << UV_SUBPIXEL_BITS;
constexpr std::int64_t PIXEL_CENTRE = SUBPIXEL_SCALE / 2;

struct FixedPoint {
    std::int64_t x;
    std::int64_t y;
};

std::int64_t floor_div(std::int64_t numerator, std::int64_t denominator) {
    return numerator / denominator - (numerator % denominator < 0 ? 1 : 0);
}

std::int64_t ceil_div(std::int64_t numerator, std::int64_t denominator) {
    return numerator / denominator + (numerator % denominator > 0 ? 1 : 0);
}

void inspect_overlaps(const PrimitiveGeometry &part, std::vector<Issue> &issues) {
    const auto triangle_count = part.triangles.size() / 3;
    std::vector<bool> same(triangle_count, false);
    std::vector<bool> mirrored(triangle_count, false);
    std::vector<std::int32_t> first_positive;
    std::vector<std::int32_t> first_negative;
    std::uint64_t visited = 0;
    for (std::size_t t = 0; t < triangle_count; ++t) {
        std::array<FixedPoint, 3> points{};
        bool valid = true;
        for (std::size_t corner = 0; corner < points.size(); ++corner) {
            const std::size_t index = part.triangles[3 * t + corner];
            if (index >= part.uvs.size() / 2) {
                valid = false;
                break;
            }
            const double u = part.uvs[2 * index];
            const double v = part.uvs[2 * index + 1];
            if (!std::isfinite(u) || !std::isfinite(v)) {
                valid = false;
                break;
            }
            const auto convert = [](double value) {
                const double clamped = std::clamp(value, -UV_COORDINATE_LIMIT, UV_COORDINATE_LIMIT);
                return static_cast<std::int64_t>(std::llround(clamped * 1024.0 * 256.0));
            };
            points[corner] = {convert(u), convert(v)};
        }
        if (!valid) {
            continue;
        }
        auto &[a, b, c] = points;
        const std::int64_t area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (area == 0) {
            continue;
        }
        const bool positive = area > 0;
        if (!positive) {
            std::swap(b, c);
        }
        const auto first_row = std::max<std::int64_t>(
            0, ceil_div(std::min({a.y, b.y, c.y}) - PIXEL_CENTRE, SUBPIXEL_SCALE));
        const auto last_row = std::min<std::int64_t>(
            UV_RASTER_SIZE - 1,
            floor_div(std::max({a.y, b.y, c.y}) - PIXEL_CENTRE, SUBPIXEL_SCALE));
        for (auto j = first_row; j <= last_row; ++j) {
            std::int64_t first_column = 0;
            std::int64_t last_column = UV_RASTER_SIZE - 1;
            for (std::size_t edge = 0; edge < points.size(); ++edge) {
                const auto &p = points[edge];
                const auto &q = points[(edge + 1) % points.size()];
                const auto dx = q.x - p.x;
                const auto dy = q.y - p.y;
                const auto slope = -dy * SUBPIXEL_SCALE;
                const auto constant =
                    dx * (j * SUBPIXEL_SCALE + PIXEL_CENTRE - p.y) - dy * (PIXEL_CENTRE - p.x);
                const std::int64_t minimum = (dy > 0 || (dy == 0 && dx < 0)) ? 0 : 1;
                if (slope > 0) {
                    first_column = std::max(first_column, ceil_div(minimum - constant, slope));
                } else if (slope < 0) {
                    last_column = std::min(last_column, floor_div(constant - minimum, -slope));
                } else if (constant < minimum) {
                    last_column = -1;
                    break;
                }
            }
            if (first_column > last_column) {
                continue;
            }
            if (first_positive.empty()) {
                const auto pixel_count = static_cast<std::size_t>(UV_RASTER_SIZE) * UV_RASTER_SIZE;
                first_positive.assign(pixel_count, -1);
                first_negative.assign(pixel_count, -1);
            }
            auto &same_slot = positive ? first_positive : first_negative;
            auto &other_slot = positive ? first_negative : first_positive;
            for (auto i = first_column; i <= last_column; ++i) {
                ++visited;
                const auto pixel = static_cast<std::size_t>(j * UV_RASTER_SIZE + i);
                if (same_slot[pixel] >= 0) {
                    same[static_cast<std::size_t>(same_slot[pixel])] = true;
                    same[t] = true;
                }
                if (other_slot[pixel] >= 0) {
                    mirrored[static_cast<std::size_t>(other_slot[pixel])] = true;
                    mirrored[t] = true;
                }
                if (same_slot[pixel] < 0) {
                    same_slot[pixel] = static_cast<std::int32_t>(t);
                }
            }
        }
        if (visited > UV_RASTER_PIXEL_BUDGET) {
            break;
        }
    }
    for (const auto severity : {Severity::error, Severity::warning}) {
        Issue issue{RuleId::uv_overlap,
                    severity,
                    severity == Severity::error
                        ? "Triangles overlap in UV space."
                        : "Triangles overlap in UV space in a mirrored layout (for example, left "
                          "and right halves that share one area).",
                    part.mesh,
                    part.primitive,
                    0,
                    {},
                    false};
        for (std::size_t t = 0; t < triangle_count; ++t) {
            const bool affected = severity == Severity::error ? same[t] : mirrored[t] && !same[t];
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
}

}  // namespace

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
        if (!missing) {
            inspect_overlaps(part, issues);
        }
    }
    return issues;
}

}  // namespace lint_asset
