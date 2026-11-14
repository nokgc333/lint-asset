#pragma once

#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"

namespace lint_asset {

// Runs every mesh check that exists so far (vertex normals and edges) and returns all findings in
// one list, ordered by mesh, then primitive, then rule in the order of the RuleId enum. This is the
// order of the report, and it depends only on the input.
std::vector<Issue> inspect_geometry(const Geometry &geometry);

}  // namespace lint_asset
