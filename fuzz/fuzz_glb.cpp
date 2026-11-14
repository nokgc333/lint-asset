// Fuzz target: a GLB goes through the loader and every inspection (SEC-001).
#include <cstddef>
#include <cstdint>
#include <span>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/inspection.hpp"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
    const auto result = lint_asset::load_glb_geometry(std::span<const std::uint8_t>(data, size));
    if (result.ok()) {
        (void)lint_asset::inspect_geometry(result.geometry);
    }
    return 0;
}
