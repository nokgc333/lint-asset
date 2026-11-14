#pragma once

#include <cstdint>
#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"
#include "lint_asset/normal_inspection.hpp"

namespace lint_asset {

// The limits the size and scale checks compare against. The defaults are the ones in the
// requirements; the report repeats the values used so the same input gives the same report.
struct InspectionThresholds {
    std::uint64_t max_triangles = 100000;  // more than this many drawn triangles is a warning
    double min_extent_m = 0.01;            // a longest side below this is a warning
    double max_extent_m = 1000.0;          // a longest side above this is a warning
};

// A triangle with an area below this is degenerate. It is the same limit the normal check uses to
// decide that a face has no reliable normal, and the edge check leaves such triangles out too.
constexpr double DEGENERATE_TRIANGLE_AREA = MIN_FACE_AREA;

// mesh.degenerate_triangle (error): triangles whose area (half the length of the cross product of
// two sides, in the primitive's own space) is below DEGENERATE_TRIANGLE_AREA, and triangles with a
// position that is not a finite number. One issue per primitive that has any, ordered by mesh, then
// primitive. A triangle with an area of exactly the limit is fine.
std::vector<Issue> inspect_degenerate_triangles(const Geometry &geometry);

// Whole-asset checks, as issues with element_kind asset (count 1, no elements):
//
// - asset.triangle_count_exceeded (warning): the number of triangles that are DRAWN, that is, the
//   triangles of a mesh counted once for every node that places it, is more than
//   thresholds.max_triangles. Exactly the limit is fine. A mesh that no node places adds nothing.
//   The message is, for example, "The scene draws 120000 triangles (limit 100000)."
// - asset.scale_too_small / asset.scale_too_large (warning): the longest side of the axis-aligned
//   bounding box of everything that is placed, in the scene's own space (node transforms applied),
//   is below min_extent_m, or above max_extent_m. The glTF unit is the metre. The box of each
//   placement is the transformed box of its mesh's vertices, so a rotated mesh can get a slightly
//   larger box than a tight fit. Vertices with a position that is not finite are ignored. When
//   nothing is placed there is no box and no issue. The message is, for example, "The longest side
//   of the bounding box is 1500 m (limit 1000 m)." or "... is 0.005 m (minimum 0.01 m)."
//
// Numbers in messages are written with at most four significant digits in plain (not scientific)
// notation, without trailing zeros: 1500, 0.005, 12.34, 123500.
//
// Returns the issues in the order triangle count, too small, too large.
std::vector<Issue> inspect_asset_size(const Geometry &geometry,
                                      const InspectionThresholds &thresholds = {});

}  // namespace lint_asset
