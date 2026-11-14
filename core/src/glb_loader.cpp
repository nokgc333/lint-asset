#include "lint_asset/glb_loader.hpp"

#include "glb_parse.hpp"
#include <new>

namespace lint_asset {
std::string_view load_error_code(LoadError error) noexcept {
    switch (error) {
    case LoadError::none:
        return {};
    case LoadError::unsupported_format:
        return "E-LOAD-001";
    case LoadError::corrupt_file:
        return "E-LOAD-002";
    case LoadError::limit_exceeded:
        return "E-LOAD-003";
    case LoadError::unsupported_extension:
        return "E-LOAD-004";
    case LoadError::missing_files:
        return "E-LOAD-005";
    }
    return {};
}

LoadResult load_glb(std::span<const std::uint8_t> bytes, const LoadLimits &limits) {
    try {
        detail::ParsedModel parsed;
        return detail::parse_glb(parsed, bytes, limits);
    } catch (const std::bad_alloc &) {
        LoadResult result;
        result.error = LoadError::limit_exceeded;
        result.message = "out of memory";
        return result;
    }
}
}  // namespace lint_asset
