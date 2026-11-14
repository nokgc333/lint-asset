#include "lint_asset/orm.hpp"

#include <cstddef>
#include <limits>
#include <new>
#include <utility>

namespace lint_asset {
namespace {

std::string memory_message() {
    try {
        return "Not enough memory for the result.";
    } catch (const std::bad_alloc &) {
        return {};
    }
}

std::string limit_message(std::uint32_t width, std::uint32_t height, std::uint64_t max_pixels) {
    return "The image is " + std::to_string(width) + " x " + std::to_string(height) +
           " pixels, over the limit of " + std::to_string(max_pixels) + " pixels.";
}

// Builds a failed result. Designated initializers would leave the vectors out, which the
// Emscripten compiler rejects (-Wmissing-designated-field-initializers).
template <typename Result> Result failure(TextureError error, std::string message) {
    Result result;
    result.error = error;
    result.message = std::move(message);
    return result;
}

}  // namespace

PackOrmResult pack_orm(std::optional<std::span<const std::uint8_t>> occlusion,
                       std::optional<std::span<const std::uint8_t>> roughness,
                       std::optional<std::span<const std::uint8_t>> metallic, std::uint32_t width,
                       std::uint32_t height, std::uint64_t max_pixels) {
    const auto count = static_cast<std::uint64_t>(width) * height;
    const std::array inputs{occlusion, roughness, metallic};
    try {
        if (count > max_pixels) {
            return failure<PackOrmResult>(TextureError::over_limit,
                                          limit_message(width, height, max_pixels));
        }
        if (width == 0 || height == 0 || (!occlusion && !roughness && !metallic)) {
            return failure<PackOrmResult>(
                TextureError::invalid_pixels,
                "Packing " + std::to_string(width) + " x " + std::to_string(height) +
                    " pixels needs nonzero dimensions and at least 1 texture.");
        }
        for (const auto &input : inputs) {
            if (input && (count > std::numeric_limits<std::uint64_t>::max() / 4 ||
                          input->size() != count * 4)) {
                return failure<PackOrmResult>(TextureError::size_mismatch,
                                              "The texture has " + std::to_string(input->size()) +
                                                  " RGBA bytes for " + std::to_string(width) +
                                                  " x " + std::to_string(height) +
                                                  " pixels, a size mismatch.");
            }
        }
        PackOrmResult result;
        const auto size = count * 4;
        if (size > result.pixels.max_size()) {
            return failure<PackOrmResult>(TextureError::over_limit,
                                          "The result needs " + std::to_string(size) +
                                              " bytes, over the memory limit.");
        }
        result.pixels.resize(static_cast<std::size_t>(size));
        constexpr std::array defaults{ORM_DEFAULT_OCCLUSION, ORM_DEFAULT_ROUGHNESS,
                                      ORM_DEFAULT_METALLIC};
        for (std::size_t offset = 0; offset < result.pixels.size(); offset += 4) {
            for (std::size_t channel = 0; channel < inputs.size(); ++channel) {
                result.pixels[offset + channel] = defaults[channel];
                if (inputs[channel]) {
                    const auto input = *inputs[channel];
                    result.pixels[offset + channel] = input[offset];
                    result.non_gray_pixels[channel] +=
                        input[offset] != input[offset + 1] || input[offset] != input[offset + 2];
                    result.translucent_pixels += input[offset + 3] < 255;
                }
            }
            result.pixels[offset + 3] = 255;
        }
        return result;
    } catch (const std::bad_alloc &) {
        return failure<PackOrmResult>(TextureError::over_limit, memory_message());
    }
}

UnpackOrmResult unpack_orm(std::span<const std::uint8_t> rgba, std::uint32_t width,
                           std::uint32_t height, std::uint64_t max_pixels) {
    const auto count = static_cast<std::uint64_t>(width) * height;
    try {
        if (count > max_pixels) {
            return failure<UnpackOrmResult>(TextureError::over_limit,
                                            limit_message(width, height, max_pixels));
        }
        if (width == 0 || height == 0 || count > std::numeric_limits<std::uint64_t>::max() / 4 ||
            rgba.size() != count * 4) {
            return failure<UnpackOrmResult>(TextureError::invalid_pixels,
                                            "The image is " + std::to_string(width) + " x " +
                                                std::to_string(height) + " pixels with " +
                                                std::to_string(rgba.size()) +
                                                " RGBA bytes, an invalid pixel buffer.");
        }
        UnpackOrmResult result;
        if (rgba.size() > result.textures[0].max_size()) {
            return failure<UnpackOrmResult>(TextureError::over_limit,
                                            "Each result needs " + std::to_string(rgba.size()) +
                                                " bytes, over the memory limit.");
        }
        for (auto &texture : result.textures) {
            texture.resize(rgba.size());
        }
        for (std::size_t offset = 0; offset < rgba.size(); offset += 4) {
            for (std::size_t channel = 0; channel < result.textures.size(); ++channel) {
                auto &texture = result.textures[channel];
                texture[offset] = texture[offset + 1] = texture[offset + 2] =
                    rgba[offset + channel];
                texture[offset + 3] = 255;
            }
            result.translucent_pixels += rgba[offset + 3] < 255;
        }
        return result;
    } catch (const std::bad_alloc &) {
        return failure<UnpackOrmResult>(TextureError::over_limit, memory_message());
    }
}

}  // namespace lint_asset
