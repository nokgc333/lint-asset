#pragma once

#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"
#include "lint_asset/size_inspection.hpp"

namespace lint_asset {

// Counts, for every edge, how many triangles use it, and reports the edges that are not shared by
// exactly two triangles. Returns the findings ordered by mesh, then primitive, then rule
// (non-manifold, boundary). The result depends only on the input.
//
// Which vertices are "the same":
// - Files often write one vertex several times (at a hard normal or a UV seam), so vertex indices
//   cannot identify an edge. Two vertices are the same when their positions are exactly equal
//   (+0 and -0 count as equal). There is no tolerance: a vertex that is slightly off is a gap.
// - Vertices are joined across all primitives of the same mesh, so a closed model that is split
//   by material is not reported as open at the split. Different meshes are never joined.
//
// What is reported:
// - mesh.nonmanifold_edge (error): an edge used by three or more triangles.
// - mesh.boundary_edge (warning): an edge used by exactly one triangle (the rim of a hole).
// - Each issue is about one primitive. `elements` lists the triangles of that primitive that
//   touch at least one such edge, and `count` is the number of those triangles. The message holds
//   the number of distinct edges, for example "4 boundary edges are each used by only one
//   triangle." An edge shared between two primitives is counted in both.
// - A triangle with two vertices at the same position, with an area below
//   DEGENERATE_TRIANGLE_AREA, or with a position that is not a finite number has no usable edges
//   and is left out. The degenerate-triangle check reports it.
std::vector<Issue> inspect_edges(const Geometry &geometry);

}  // namespace lint_asset
