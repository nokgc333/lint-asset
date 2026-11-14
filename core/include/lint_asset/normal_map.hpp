#pragma once

#include <cstdint>
#include <span>
#include <string>
#include <string_view>

namespace lint_asset {

// Why a texture operation failed. Each value maps to one E-TEX-xxx code shown to the user.
enum class TextureError : std::uint8_t {
    none,            // success
    invalid_pixels,  // E-TEX-001: the pixel buffer does not match the width and height
    size_mismatch,   // E-TEX-002: the textures to combine do not have the same size
    over_limit       // E-TEX-003: more pixels than the limit
};

// Returns "E-TEX-001", "E-TEX-002", or "E-TEX-003", or an empty string for TextureError::none.
std::string_view texture_error_code(TextureError error) noexcept;

// The data-volume limit for a texture: 8192 x 8192 pixels (requirements, data volume). It is a
// parameter so that tests can use small values and the UI can raise it when the user chooses to
// continue past the warning.
constexpr std::uint64_t DEFAULT_MAX_TEXTURE_PIXELS = 8192ULL * 8192ULL;

struct NormalMapResult {
    TextureError error = TextureError::none;
    std::string message;                   // English reason; empty on success
    std::uint64_t translucent_pixels = 0;  // pixels with alpha below 255; 0 when the call fails

    bool ok() const noexcept { return error == TextureError::none; }
};

// Converts a normal map between the DirectX and OpenGL conventions, in place.
//
// - `rgba` holds width * height pixels of 4 bytes each (R, G, B, A), row by row, with straight
//   (not premultiplied) alpha.
// - The two conventions differ only in the direction of the green channel (Y), so both directions
//   are the same operation: g' = 255 - g. Red, blue, and alpha are not touched.
// - The operation is its own inverse, so applying it twice gives back every byte exactly, for any
//   input.
// - `translucent_pixels` counts the pixels whose alpha is below 255. Browsers decode such pixels
//   in a form that can already have changed their color, so the caller warns about them.
// - Fails, leaving `rgba` unchanged, when width or height is 0 or the buffer length is not
//   width * height * 4 (invalid_pixels), or when width * height is above `max_pixels`
//   (over_limit). The limit is checked first, so a huge size is reported as over_limit.
// - Never throws and never reads or writes outside `rgba`.
NormalMapResult flip_normal_map_green(std::span<std::uint8_t> rgba, std::uint32_t width,
                                      std::uint32_t height,
                                      std::uint64_t max_pixels = DEFAULT_MAX_TEXTURE_PIXELS);

}  // namespace lint_asset
