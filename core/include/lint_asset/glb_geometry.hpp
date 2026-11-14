#pragma once

#include <array>
#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "lint_asset/glb_loader.hpp"

namespace lint_asset {

// The triangles of one primitive, in the primitive's own (local) space.
//
// A triangle is addressed everywhere (reports, colouring) by three numbers: the mesh index, the
// primitive index, and the triangle's position in `triangles` (triangle t uses vertex indices
// triangles[3t], triangles[3t + 1], triangles[3t + 2]).
struct PrimitiveGeometry {
    std::uint32_t mesh = 0;        // index into the glTF "meshes" array
    std::uint32_t primitive = 0;   // index into that mesh's "primitives" array
    std::vector<float> positions;  // x, y, z per vertex
    std::vector<float> normals;    // x, y, z per vertex; empty when the primitive has no NORMAL
    // Three vertex indices per triangle. Strips and fans are expanded to plain triangles, with the
    // winding of every other strip triangle swapped so that all triangles face the same way.
    std::vector<std::uint32_t> triangles;
    // u, v per vertex from TEXCOORD_0 (float, or normalized unsigned byte or short, decoded to
    // float); empty when the primitive has no TEXCOORD_0. When present it has one pair per vertex.
    // Only the first set is read; a second set (such as a lightmap's) is ignored.
    std::vector<float> uvs;
};

// One placement of a mesh in the scene, from the node hierarchy.
struct MeshInstance {
    std::uint32_t mesh = 0;
    std::array<float, 16> world{};  // column-major 4x4 matrix, as in glTF
};

// How many entries of the glTF "images" array keep their data outside the file (see
// uri_inspection.hpp). Only the counts are kept, never the uri text.
struct ExternalImageCounts {
    std::uint32_t web_addresses = 0;  // http, https, ftp, ftps, or a protocol-relative address
    std::uint32_t other = 0;          // a file path, file:, blob:, or any other non-data uri
};

struct Geometry {
    // Only primitives that draw triangles. Points and lines are left out. Ordered by mesh, then
    // primitive.
    std::vector<PrimitiveGeometry> primitives;
    // In depth-first order from the scene's root nodes. A mesh can appear more than once.
    std::vector<MeshInstance> instances;
    // Images stored outside the file. The file is never asked for them (SEC-002).
    ExternalImageCounts external_images;
};

struct GeometryResult {
    LoadError error = LoadError::none;
    std::string message;
    LoadStats stats;  // the same counts load_glb() reports
    Geometry geometry;

    bool ok() const noexcept { return error == LoadError::none; }
};

// Parses a GLB and extracts what is needed to draw and inspect it.
//
// Everything load_glb() promises also holds here (limits, no external reads, no throwing on bad
// input). In addition, every read of vertex data is range-checked against its buffer, and a vertex
// index that points past the vertex count is E-LOAD-002.
//
// TEXCOORD_0 must be a VEC2 accessor with one entry per vertex, or the file is E-LOAD-002.
//
// Supported accessor layouts: byte stride, and the normalized and plain integer component types
// used by quantized meshes (decoded to float). Sparse accessors are not supported yet and fail with
// E-LOAD-001. The node hierarchy is limited in depth and in the number of instances so that a
// crafted file cannot make the traversal run away; exceeding either is E-LOAD-003 (too many
// instances) or E-LOAD-002 (a cycle).
GeometryResult load_glb_geometry(std::span<const std::uint8_t> bytes,
                                 const LoadLimits &limits = {});

}  // namespace lint_asset
