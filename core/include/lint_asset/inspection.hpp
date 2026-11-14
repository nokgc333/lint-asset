#pragma once

#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"
#include "lint_asset/size_inspection.hpp"
#include "lint_asset/uv_inspection.hpp"

namespace lint_asset {

// Runs every check that exists so far (vertex normals, edges, degenerate triangles, UVs, and the
// size, scale, and external image references of the asset) and returns all findings in one list.
// This is the order of the
// report, and it depends only on the input:
// - whole-asset issues first, in the order of the RuleId enum;
// - then the triangle issues, by mesh, then primitive, then rule in the order of the RuleId enum.
std::vector<Issue> inspect_geometry(const Geometry &geometry,
                                    const InspectionThresholds &thresholds = {});

}  // namespace lint_asset
