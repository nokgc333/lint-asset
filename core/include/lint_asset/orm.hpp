#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <vector>

#include "lint_asset/normal_map.hpp"

namespace lint_asset {

// ORM packing (FR-009): ambient occlusion, roughness, and metalness in the red, green, and blue
// channels of one texture. This is the layout of glTF (the metallic-roughness texture, with
// occlusion in the same texture) and of Unreal Engine.
//
// All pixels are RGBA, 4 bytes each, row by row, straight (not premultiplied) alpha.

// What a missing texture is filled with when packing.
constexpr std::uint8_t ORM_DEFAULT_OCCLUSION = 255;  // white: no occlusion
constexpr std::uint8_t ORM_DEFAULT_ROUGHNESS = 255;  // white: fully rough
constexpr std::uint8_t ORM_DEFAULT_METALLIC = 0;     // black: not a metal

struct PackOrmResult {
    TextureError error = TextureError::none;
    std::string message;               // English reason; empty on success
    std::vector<std::uint8_t> pixels;  // width * height * 4 bytes; empty when the call fails
    // Per input (occlusion, roughness, metallic): how many pixels are not gray (red, green, and
    // blue differ). Only the red channel of an input is used, so a colored image gives a
    // surprising result; the caller warns about it. 0 for a missing input.
    std::array<std::uint64_t, 3> non_gray_pixels{};
    // Pixels with alpha below 255, summed over the inputs. The output is fully opaque, so this
    // information is dropped; the caller warns about it. 0 for a missing input.
    std::uint64_t translucent_pixels = 0;

    bool ok() const noexcept { return error == TextureError::none; }
};

// Packs up to three textures into one: the output's red is the occlusion texture's red, its green
// is the roughness texture's red, its blue is the metallic texture's red, and its alpha is 255.
// A texture that is std::nullopt is replaced by its default (ORM_DEFAULT_*).
//
// - Each texture is read as a gray image through its red channel; green, blue, and alpha of the
//   inputs are not used.
// - At least one texture must be given, and each given texture must hold exactly width * height
//   pixels. The inputs are not changed.
// - Checks, in this order: width * height above `max_pixels` is over_limit; a width or height of
//   0, or no texture at all, is invalid_pixels; a given texture whose length is not
//   width * height * 4 is size_mismatch (the textures to combine do not have the same size).
// - Never throws on bad input and never reads outside the given spans.
PackOrmResult pack_orm(std::optional<std::span<const std::uint8_t>> occlusion,
                       std::optional<std::span<const std::uint8_t>> roughness,
                       std::optional<std::span<const std::uint8_t>> metallic, std::uint32_t width,
                       std::uint32_t height, std::uint64_t max_pixels = DEFAULT_MAX_TEXTURE_PIXELS);

struct UnpackOrmResult {
    TextureError error = TextureError::none;
    std::string message;  // English reason; empty on success
    // Occlusion, roughness, and metallic, each as a gray RGBA image of width * height pixels: the
    // channel's value in red, green, and blue, and 255 in alpha. All empty when the call fails.
    std::array<std::vector<std::uint8_t>, 3> textures;
    // Pixels of the input with alpha below 255. Alpha is dropped (the outputs are opaque); the
    // caller warns about it.
    std::uint64_t translucent_pixels = 0;

    bool ok() const noexcept { return error == TextureError::none; }
};

// Splits a packed texture into its three channels. packing the three results again gives back the
// red, green, and blue of `rgba` exactly. Fails, changing nothing, for the same reasons as
// flip_normal_map_green: over_limit, or invalid_pixels when width or height is 0 or the length is
// not width * height * 4.
UnpackOrmResult unpack_orm(std::span<const std::uint8_t> rgba, std::uint32_t width,
                           std::uint32_t height,
                           std::uint64_t max_pixels = DEFAULT_MAX_TEXTURE_PIXELS);

}  // namespace lint_asset
