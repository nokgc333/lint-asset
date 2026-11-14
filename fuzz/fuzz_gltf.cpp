// Fuzz target: a split glTF. The input is framed as chunks (see chunks.hpp): the first chunk is the
// .gltf, then pairs of (file name, file bytes) for the files the user "selected" with it.
#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "chunks.hpp"
#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/gltf_loader.hpp"
#include "lint_asset/inspection.hpp"

namespace {
constexpr std::size_t MAX_CHUNKS = 9;  // the .gltf and four files
}

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
    const auto chunks = fuzz::split_chunks(data, size, MAX_CHUNKS);
    if (chunks.empty()) {
        return 0;
    }
    std::vector<lint_asset::SuppliedFile> files;
    for (std::size_t i = 1; i + 1 < chunks.size(); i += 2) {
        files.push_back({std::string(chunks[i].begin(), chunks[i].end()), chunks[i + 1]});
    }
    const auto result = lint_asset::load_gltf_geometry(chunks[0], files);
    if (result.ok()) {
        (void)lint_asset::inspect_geometry(result.geometry);
    }
    return 0;
}
