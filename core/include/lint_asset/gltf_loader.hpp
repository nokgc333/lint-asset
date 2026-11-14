#pragma once

#include <cstdint>
#include <span>
#include <string>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/glb_loader.hpp"

namespace lint_asset {

// A file the user gave together with a .gltf: a .bin buffer or an image. `name` is how the user's
// browser calls it: a bare file name ("scene.bin"), or a path relative to the folder the user chose
// ("textures/wood.png"). `bytes` must stay valid while the load runs.
struct SuppliedFile {
    std::string name;
    std::span<const std::uint8_t> bytes;
};

// Loading a split glTF (FR-014): a .gltf (JSON) whose binary data and images are in separate files.
//
// - Nothing is read from anywhere except `files` (SEC-002). A web address is never fetched, and
//   there is no file system. A uri that names a supplied file is served from memory; a data: uri
//   is decoded in place; anything else is not available.
// - How a uri is matched to a supplied file: the uri is percent-decoded, backslashes become
//   slashes, and a leading "./" is dropped. Then a supplied file matches when its name (the same
//   cleaning applied) is equal to the uri; if there is none, when it is the only supplied file
//   whose last path part equals the last path part of the uri (so a folder of files given by name
//   alone still works). Names are compared exactly, case included.
// - A buffer that cannot be served is the error missing_files (E-LOAD-005), with the names of all
//   the missing buffers in `missing_files` (the uri as the .gltf writes it, percent-decoded, once
//   each, in the order of the buffers). A buffer whose uri is a web address is
//   unsupported_format (E-LOAD-001), as an external buffer is for a GLB.
// - Images are not decoded and not needed: a .gltf whose images are missing, or are web addresses,
//   loads fine. They are counted in Geometry::external_images, but only web addresses are counted
//   for a .gltf (`other` stays 0): a relative path to an image is the normal form of a split glTF.
// - The size limit counts the .gltf and every supplied file that is used.
// - Bytes that start with the GLB magic are loaded as a GLB; `files` is then not used.
// - Everything else is as for load_glb / load_glb_geometry: the limits, the ranges of the vertex
//   data, the supported extensions, no throwing on bad input. Text that is not valid glTF JSON is
//   corrupt_file (E-LOAD-002).
LoadResult load_gltf(std::span<const std::uint8_t> json, std::span<const SuppliedFile> files,
                     const LoadLimits &limits = {});

GeometryResult load_gltf_geometry(std::span<const std::uint8_t> json,
                                  std::span<const SuppliedFile> files,
                                  const LoadLimits &limits = {});

}  // namespace lint_asset
