#include "lint_asset/normal_map.hpp"

#include <cstddef>
#include <limits>
#include <new>

namespace lint_asset {

std::string_view texture_error_code(TextureError error) noexcept {
    switch (error) {
    case TextureError::none:
        return {};
    case TextureError::invalid_pixels:
        return "E-TEX-001";
    case TextureError::size_mismatch:
        return "E-TEX-002";
    case TextureError::over_limit:
        return "E-TEX-003";
    }
    return {};
}

NormalMapResult flip_normal_map_green(std::span<std::uint8_t> rgba, std::uint32_t width,
                                      std::uint32_t height, std::uint64_t max_pixels) {
    const auto count = static_cast<std::uint64_t>(width) * height;
    const auto error = count > max_pixels ? TextureError::over_limit : TextureError::invalid_pixels;
    try {
        if (count > max_pixels) {
            return {.error = error,
                    .message = "The image is " + std::to_string(width) + " x " +
                               std::to_string(height) + " pixels, over the limit of " +
                               std::to_string(max_pixels) + " pixels."};
        }
        if (width == 0 || height == 0 || count > std::numeric_limits<std::uint64_t>::max() / 4 ||
            rgba.size() != count * 4) {
            return {.error = error,
                    .message = "The image is " + std::to_string(width) + " x " +
                               std::to_string(height) + " pixels with " +
                               std::to_string(rgba.size()) +
                               " RGBA bytes, an invalid pixel buffer."};
        }
    } catch (const std::bad_alloc &) {
        return {.error = error, .message = {}};
    }

    NormalMapResult result;
    for (std::size_t offset = 0; offset < rgba.size(); offset += 4) {
        rgba[offset + 1] = static_cast<std::uint8_t>(255 - rgba[offset + 1]);
        result.translucent_pixels += rgba[offset + 3] < 255;
    }
    return result;
}

}  // namespace lint_asset
