#pragma once

#include <cstdint>
#include <span>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/glb_loader.hpp"

namespace lint_asset {

// Loading a Wavefront OBJ (FR-015): text, one file.
//
// What is read:
// - `v x y z` (extra numbers, such as w or colours, are ignored), `vt u [v [w]]`, `vn x y z`, and
//   `f` with the four vertex forms `v`, `v/vt`, `v//vn`, `v/vt/vn`. Indices are 1-based; a
//   negative index counts back from the last element defined so far. A face with more than three
//   vertices is split into a fan (0, i, i + 1). A face with fewer than three vertices is skipped.
// - Everything else is skipped without a message: comments, `o`, `g`, `s`, `mtllib`, `usemtl`, `l`,
//   `p`, and every statement this tool does not know. No other file is ever opened or named; the
//   .mtl and the textures are not read (SEC-002). Groups and objects do not split anything: the
//   whole file is ONE mesh with ONE primitive (mesh 0, primitive 0).
// - Lines end with LF or CRLF; a trailing backslash joins the next line; a UTF-8 byte order mark at
//   the start is skipped. Keywords are case-sensitive, fields are separated by spaces or tabs.
//
// How the geometry is built:
// - OBJ indexes positions, texture coordinates and normals separately. One output vertex is made
//   for each distinct (v, vt, vn) triple that a face uses, in order of first use; unused `v` lines
//   make no vertex. Triangles keep the winding of the face.
// - Normals are filled only when EVERY face vertex has a `vn`; otherwise `normals` is empty (as
//   for a glTF primitive without NORMAL). Likewise `uvs` only when every face vertex has a `vt`.
// - A file whose faces make no triangle gives meshes 0, primitives 0, triangles 0, and empty
//   geometry (success). Otherwise stats are meshes 1, primitives 1, and one MeshInstance with the
//   identity matrix is made. external_images stays zero.
// - OBJ has no units: the numbers are used as metres, as the size and scale checks assume.
//
// Errors:
// - corrupt_file (E-LOAD-002): empty input, a NUL byte in the data (not text), a number that does
//   not parse or is not finite, `v`/`vt`/`vn` with too few numbers, a face index that is 0 or
//   points past what is defined (or, negative, before the start), a face vertex field that is not
//   a number. The text has no `v` and no `f` statement at all (for example, a text file that is
//   not an OBJ).
// - unsupported_format (E-LOAD-001): the bytes start with the GLB magic "glTF".
// - limit_exceeded (E-LOAD-003): the size is over max_file_bytes, or the triangles (counted as the
//   fans are made, so a huge face cannot blow up memory first) are over max_triangles.
// Never throws on bad input; never reads anything but `bytes`.
LoadResult load_obj(std::span<const std::uint8_t> bytes, const LoadLimits &limits = {});

GeometryResult load_obj_geometry(std::span<const std::uint8_t> bytes,
                                 const LoadLimits &limits = {});

}  // namespace lint_asset
