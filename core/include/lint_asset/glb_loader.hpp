#pragma once

#include <cstdint>
#include <span>
#include <string>
#include <string_view>

namespace lint_asset {

// Why a load failed. Each value maps to one E-LOAD-xxx code shown to the user.
enum class LoadError : std::uint8_t {
    none,                  // success
    unsupported_format,    // E-LOAD-001: not a GLB 2.x file, or it needs an external resource
    corrupt_file,          // E-LOAD-002: a GLB that is truncated or structurally invalid
    limit_exceeded,        // E-LOAD-003: over the size, triangle, or memory limit
    unsupported_extension  // E-LOAD-004: requires a glTF extension this tool cannot read
};

// Returns "E-LOAD-001" .. "E-LOAD-004", or an empty string for LoadError::none.
std::string_view load_error_code(LoadError error) noexcept;

// Upper bounds for one load. The defaults are the limits in the requirements (data volume).
// They are parameters so that tests can use small values and the UI can raise them when the
// user chooses to continue past the warning.
struct LoadLimits {
    std::uint64_t max_file_bytes = 100ULL * 1024 * 1024;
    std::uint64_t max_triangles = 2'000'000;
};

// Counts of what the file defines (not of node instances). Zero when the load fails.
struct LoadStats {
    std::uint32_t meshes = 0;
    std::uint32_t primitives = 0;
    std::uint64_t triangles = 0;
};

struct LoadResult {
    LoadError error = LoadError::none;
    std::string message;  // English reason; empty on success
    LoadStats stats;

    bool ok() const noexcept { return error == LoadError::none; }
};

// Parses a GLB held in memory and counts its meshes, primitives, and triangles.
//
// - Reads only the given bytes. External URIs are never opened (SEC-002).
// - Never throws on bad input; every failure comes back as a LoadError with a reason.
// - Triangles are counted per primitive mode: TRIANGLES, TRIANGLE_STRIP, and TRIANGLE_FAN
//   count; points and lines count as zero.
LoadResult load_glb(std::span<const std::uint8_t> bytes, const LoadLimits &limits = {});

}  // namespace lint_asset
