#include "lint_asset/inspection.hpp"

#include <algorithm>
#include <iterator>
#include <tuple>

#include "lint_asset/edge_inspection.hpp"
#include "lint_asset/normal_inspection.hpp"

namespace lint_asset {

std::vector<Issue> inspect_geometry(const Geometry &geometry) {
    auto issues = inspect_normals(geometry);
    auto edges = inspect_edges(geometry);
    issues.insert(issues.end(), std::make_move_iterator(edges.begin()),
                  std::make_move_iterator(edges.end()));
    std::stable_sort(issues.begin(), issues.end(), [](const Issue &a, const Issue &b) {
        return std::tie(a.mesh, a.primitive, a.rule) < std::tie(b.mesh, b.primitive, b.rule);
    });
    return issues;
}

}  // namespace lint_asset
