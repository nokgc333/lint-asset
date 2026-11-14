#include "lint_asset/inspection.hpp"

#include <algorithm>
#include <iterator>
#include <tuple>

#include "lint_asset/edge_inspection.hpp"
#include "lint_asset/normal_inspection.hpp"

namespace lint_asset {

std::vector<Issue> inspect_geometry(const Geometry &geometry,
                                    const InspectionThresholds &thresholds) {
    auto issues = inspect_asset_size(geometry, thresholds);
    for (auto findings : {inspect_normals(geometry), inspect_edges(geometry),
                          inspect_degenerate_triangles(geometry), inspect_uvs(geometry)}) {
        issues.insert(issues.end(), std::make_move_iterator(findings.begin()),
                      std::make_move_iterator(findings.end()));
    }
    std::stable_sort(issues.begin(), issues.end(), [](const Issue &a, const Issue &b) {
        return std::tuple(a.element_kind != ElementKind::asset, a.mesh, a.primitive, a.rule) <
               std::tuple(b.element_kind != ElementKind::asset, b.mesh, b.primitive, b.rule);
    });
    return issues;
}

}  // namespace lint_asset
