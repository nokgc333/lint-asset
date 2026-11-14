#pragma once

#include <cstdint>
#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"

namespace lint_asset {

// A UV coordinate counts as inside the 0 to 1 square up to this much, so a value such as
// 1.0000001 written by an exporter is not reported.
constexpr double UV_RANGE_TOLERANCE = 1e-6;

// The texture is drawn on a grid of this many pixels on each side to find overlaps.
constexpr int UV_RASTER_SIZE = 1024;

// UV coordinates are turned into integers with this many bits below the pixel: 1 / 256 of a pixel.
constexpr int UV_SUBPIXEL_BITS = 8;

// UV values are limited to [-UV_COORDINATE_LIMIT, UV_COORDINATE_LIMIT] before the conversion, so
// that the integer arithmetic cannot overflow. Only a triangle that reaches that far is changed.
constexpr double UV_COORDINATE_LIMIT = 8.0;

// Per primitive, drawing stops after the triangle that brings the total number of covered pixels
// above this. A valid layout covers at most about UV_RASTER_SIZE squared pixels, so this limit is
// never reached by a sensible model; it only keeps a crafted file (thousands of triangles that each
// cover the whole texture) from running for a long time. The triangles drawn so far are reported.
constexpr std::uint64_t UV_RASTER_PIXEL_BUDGET = 16ULL * 1024 * 1024;

// Checks the first UV set (TEXCOORD_0) of every primitive. Returns the findings ordered by mesh,
// then primitive, then rule. The result depends only on the input.
//
// - uv.missing (warning): the primitive has no UV coordinates. Every triangle is listed. Some
//   assets (for example, ones that use only vertex colours) do not need UVs, which is why this is
//   a warning and not an error.
// - uv.out_of_range (info): a triangle has a corner with u or v below -UV_RANGE_TOLERANCE or above
//   1 + UV_RANGE_TOLERANCE, or one that is not a finite number. This can be intended (a tiling
//   texture), so it is only information.
// - uv.overlap: triangles that cover the same pixel of the texture. Two issues at most per
//   primitive (see below).
//
// How overlaps are found (all in integers, so the result is the same on every platform):
// 1. Each UV is converted to a fixed-point position in 1/256 pixel units: the value is limited to
//    +/-UV_COORDINATE_LIMIT, then X = llround(u * 1024 * 256) and Y = llround(v * 1024 * 256).
//    v is not flipped. Triangles with a corner that is not finite, or with a vertex index that does
//    not exist, are not drawn. A triangle whose area (below) is 0 is not drawn.
// 2. The area is area2 = (B-A) x (C-A) = (Bx-Ax)(Cy-Ay) - (By-Ay)(Cx-Ax), in int64. Its sign is the
//    triangle's orientation: positive or negative. A negative one is made positive for the test
//    below by swapping B and C.
// 3. The centre of pixel (i, j) is (i * 256 + 128, j * 256 + 128). It is covered when, for each of
//    the edges A->B, B->C, C->A (P->Q), with w = (Qx-Px)(Yc-Py) - (Qy-Py)(Xc-Px) where (Xc, Yc)
//    is the centre, either w > 0, or w == 0 and (dy > 0, or dy == 0 and dx < 0) with
//    (dx, dy) = Q - P. The second part decides who owns an edge two triangles share, so a shared
//    edge is never counted twice. Only pixels 0 to 1023 in both directions exist, so the part of a
//    triangle outside the 0 to 1 square is cut off, and a triangle wholly outside is not drawn.
//    A triangle too small to contain any pixel centre is not drawn either.
// 4. Triangles are drawn in ascending order. Each pixel remembers the first triangle of each
//    orientation that covered it. When triangle t of orientation o covers a pixel:
//    - if a triangle a of the same orientation is remembered, a and t are both "same";
//    - if a triangle b of the opposite orientation is remembered, b and t are both "mirrored";
//    - then t is remembered for that orientation if none was.
// 5. Opposite orientations on the same area mean the layout is mirrored, as when the left and the
//    right half of a symmetric model share one area of the texture. That is intended, so it is a
//    warning. The same orientation means the texture is painted twice by different parts, which is
//    an error.
// 6. One uv.overlap issue (error, message "Triangles overlap in UV space.") lists the triangles
// that
//    are "same". A second one (warning, message "Triangles overlap in UV space in a mirrored layout
//    (for example, left and right halves that share one area).") lists the triangles that are
//    "mirrored" and not "same". Each is left out when it is empty. Overlaps are looked for in one
//    primitive at a time.
//
// The order of the issues of one primitive is uv.missing, uv.out_of_range, then uv.overlap (error
// first).
std::vector<Issue> inspect_uvs(const Geometry &geometry);

}  // namespace lint_asset
