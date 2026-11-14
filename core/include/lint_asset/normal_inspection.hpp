#pragma once

#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"

namespace lint_asset {

// A vertex normal is "not unit length" when its length is outside 1 +/- this value.
constexpr double NORMAL_LENGTH_TOLERANCE = 0.01;

// A triangle counts as flipped when the cosine between its face normal and the summed vertex
// normals is below -FLIP_EPSILON. The small margin keeps a normal exactly at 90 degrees from being
// reported because of rounding.
constexpr double FLIP_EPSILON = 1e-6;

// A triangle with an area below this has no reliable face normal (it would be decided by rounding
// noise), so the flip test skips it. The degenerate-triangle check reports such triangles.
constexpr double MIN_FACE_AREA = 1e-10;

// Checks the vertex normals of every primitive and returns the findings, ordered by mesh, then
// primitive, then rule (flipped, missing, unnormalized). The result depends only on the input.
//
// - normal.flipped (error): the face normal is n = normalize((v1 - v0) x (v2 - v0)). The three
//   vertex normals are each scaled to length 1 (a zero-length or non-finite one is left out) and
//   added up. If dot(n, sum) is negative, the triangle is flipped. One wrong vertex normal out of
//   three is outweighed by the other two. A triangle with an area below MIN_FACE_AREA is skipped.
// - normal.missing (warning): the primitive has no NORMAL attribute. Every triangle of the
//   primitive is listed.
// - normal.unnormalized (warning): any of the three vertex normals has a length outside
//   1 +/- NORMAL_LENGTH_TOLERANCE, or is not a finite number.
//
// Works in the primitive's own space, so node transforms do not matter.
std::vector<Issue> inspect_normals(const Geometry &geometry);

}  // namespace lint_asset
