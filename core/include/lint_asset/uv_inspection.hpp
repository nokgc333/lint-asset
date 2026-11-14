#pragma once

#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"

namespace lint_asset {

// A UV coordinate counts as inside the 0 to 1 square up to this much, so a value such as
// 1.0000001 written by an exporter is not reported.
constexpr double UV_RANGE_TOLERANCE = 1e-6;

// Checks the first UV set (TEXCOORD_0) of every primitive. Returns the findings ordered by mesh,
// then primitive, then rule. The result depends only on the input.
//
// - uv.missing (warning): the primitive has no UV coordinates. Every triangle is listed. Some
//   assets (for example, ones that use only vertex colours) do not need UVs, which is why this is
//   a warning and not an error.
// - uv.out_of_range (info): a triangle has a corner with u or v below -UV_RANGE_TOLERANCE or above
//   1 + UV_RANGE_TOLERANCE, or one that is not a finite number. This can be intended (a tiling
//   texture), so it is only information.
std::vector<Issue> inspect_uvs(const Geometry &geometry);

}  // namespace lint_asset
