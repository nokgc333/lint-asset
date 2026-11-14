#include "lint_asset/size_inspection.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <map>
#include <string>
#include <utility>

namespace lint_asset {
namespace {

using Vector = std::array<double, 3>;

struct Box {
    Vector min{};
    Vector max{};
    bool present = false;

    void merge(const Vector &point) {
        if (!present) {
            min = max = point;
            present = true;
            return;
        }
        for (std::size_t axis = 0; axis < point.size(); ++axis) {
            min[axis] = std::min(min[axis], point[axis]);
            max[axis] = std::max(max[axis], point[axis]);
        }
    }
};

struct MeshSize {
    std::uint64_t triangles = 0;
    Box box;
};

std::string plain_number(double value) {
    if (value == 0) {
        return "0";
    }
    std::array<char, 32> buffer{};
    const auto result = std::to_chars(buffer.data(), buffer.data() + buffer.size(), value,
                                      std::chars_format::scientific, 3);
    const std::string scientific(buffer.data(), result.ptr);
    const auto exponent_at = scientific.find('e');
    const int exponent = std::stoi(scientific.substr(exponent_at + 1));
    std::string digits = scientific.substr(0, exponent_at);
    const bool negative = digits.front() == '-';
    if (negative) {
        digits.erase(0, 1);
    }
    digits.erase(digits.find('.'), 1);
    const int decimal = exponent + 1;
    std::string out;
    if (decimal <= 0) {
        out = "0." + std::string(-decimal, '0') + digits;
    } else if (decimal >= static_cast<int>(digits.size())) {
        out = digits + std::string(decimal - digits.size(), '0');
    } else {
        out = digits;
        out.insert(decimal, ".");
    }
    if (out.find('.') != std::string::npos) {
        while (out.back() == '0') {
            out.pop_back();
        }
        if (out.back() == '.') {
            out.pop_back();
        }
    }
    return negative ? "-" + out : out;
}

Issue asset_issue(RuleId rule, std::string message) {
    return {rule, Severity::warning, std::move(message), 0, 0, 1, {}, false, ElementKind::asset};
}

}  // namespace

std::vector<Issue> inspect_degenerate_triangles(const Geometry &geometry) {
    std::vector<Issue> issues;
    for (const auto &part : geometry.primitives) {
        Issue issue{
            RuleId::mesh_degenerate_triangle,
            Severity::error,
            "Triangles with an area below 1e-10, or with a position that is not a finite number.",
            part.mesh,
            part.primitive,
            0,
            {},
            false};
        for (std::size_t triangle = 0; triangle < part.triangles.size() / 3; ++triangle) {
            std::array<Vector, 3> vertices{};
            bool valid = true;
            bool finite = true;
            for (std::size_t corner = 0; corner < vertices.size(); ++corner) {
                const auto index = part.triangles[3 * triangle + corner];
                if (index >= part.positions.size() / 3) {
                    valid = false;
                    break;
                }
                for (std::size_t axis = 0; axis < 3; ++axis) {
                    const double value = part.positions[3 * static_cast<std::size_t>(index) + axis];
                    vertices[corner][axis] = value;
                    finite = finite && std::isfinite(value);
                }
            }
            if (!valid) {
                continue;
            }
            Vector a{}, b{};
            for (std::size_t axis = 0; axis < 3; ++axis) {
                a[axis] = vertices[1][axis] - vertices[0][axis];
                b[axis] = vertices[2][axis] - vertices[0][axis];
            }
            const Vector cross = {a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                                  a[0] * b[1] - a[1] * b[0]};
            const double area = 0.5 * std::hypot(cross[0], cross[1], cross[2]);
            if (!finite || area < DEGENERATE_TRIANGLE_AREA) {
                ++issue.count;
                if (issue.elements.size() < MAX_ISSUE_ELEMENTS) {
                    issue.elements.push_back(static_cast<std::uint32_t>(triangle));
                }
            }
        }
        if (issue.count > 0) {
            issue.truncated = issue.count > issue.elements.size();
            issues.push_back(std::move(issue));
        }
    }
    return issues;
}

std::vector<Issue> inspect_asset_size(const Geometry &geometry,
                                      const InspectionThresholds &thresholds) {
    std::map<std::uint32_t, MeshSize> meshes;
    for (const auto &part : geometry.primitives) {
        auto &mesh = meshes[part.mesh];
        mesh.triangles += part.triangles.size() / 3;
        for (std::size_t vertex = 0; vertex < part.positions.size() / 3; ++vertex) {
            const Vector point = {part.positions[3 * vertex], part.positions[3 * vertex + 1],
                                  part.positions[3 * vertex + 2]};
            if (std::all_of(point.begin(), point.end(),
                            [](double x) { return std::isfinite(x); })) {
                mesh.box.merge(point);
            }
        }
    }
    std::uint64_t triangles = 0;
    Box scene;
    for (const auto &instance : geometry.instances) {
        const auto found = meshes.find(instance.mesh);
        if (found == meshes.end()) {
            continue;
        }
        const auto &mesh = found->second;
        triangles += mesh.triangles;
        if (!mesh.box.present) {
            continue;
        }
        for (unsigned corner = 0; corner < 8; ++corner) {
            Vector point{};
            for (std::size_t axis = 0; axis < 3; ++axis) {
                point[axis] = (corner & (1U << axis)) ? mesh.box.max[axis] : mesh.box.min[axis];
            }
            Vector transformed{};
            for (std::size_t axis = 0; axis < 3; ++axis) {
                transformed[axis] = instance.world[axis] * point[0] +
                                    instance.world[4 + axis] * point[1] +
                                    instance.world[8 + axis] * point[2] + instance.world[12 + axis];
            }
            scene.merge(transformed);
        }
    }
    std::vector<Issue> issues;
    if (triangles > thresholds.max_triangles) {
        issues.push_back(asset_issue(RuleId::asset_triangle_count_exceeded,
                                     "The scene draws " + std::to_string(triangles) +
                                         " triangles (limit " +
                                         std::to_string(thresholds.max_triangles) + ")."));
    }
    if (scene.present) {
        double extent = 0;
        for (std::size_t axis = 0; axis < 3; ++axis) {
            extent = std::max(extent, scene.max[axis] - scene.min[axis]);
        }
        const auto prefix = "The longest side of the bounding box is " + plain_number(extent);
        if (extent < thresholds.min_extent_m) {
            issues.push_back(asset_issue(RuleId::asset_scale_too_small,
                                         prefix + " m (minimum " +
                                             plain_number(thresholds.min_extent_m) + " m)."));
        }
        if (extent > thresholds.max_extent_m) {
            issues.push_back(asset_issue(RuleId::asset_scale_too_large,
                                         prefix + " m (limit " +
                                             plain_number(thresholds.max_extent_m) + " m)."));
        }
    }
    return issues;
}

}  // namespace lint_asset
