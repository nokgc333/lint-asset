#include <doctest/doctest.h>

#include <cstddef>
#include <cstdint>
#include <limits>
#include <random>
#include <string>
#include <utility>
#include <vector>

#include "lint_asset/normal_map.hpp"

using lint_asset::DEFAULT_MAX_TEXTURE_PIXELS;
using lint_asset::flip_normal_map_green;
using lint_asset::NormalMapResult;
using lint_asset::TextureError;

namespace {

using Pixels = std::vector<std::uint8_t>;

Pixels random_pixels(std::uint32_t width, std::uint32_t height, std::uint32_t seed) {
    std::mt19937 rng(seed);
    Pixels pixels(static_cast<std::size_t>(width) * height * 4);
    for (auto &byte : pixels) {
        byte = static_cast<std::uint8_t>(rng() & 0xFFU);
    }
    return pixels;
}

}  // namespace

TEST_CASE("texture_error_code names every error") {
    CHECK(lint_asset::texture_error_code(TextureError::none) == "");
    CHECK(lint_asset::texture_error_code(TextureError::invalid_pixels) == "E-TEX-001");
    CHECK(lint_asset::texture_error_code(TextureError::over_limit) == "E-TEX-003");
}

TEST_CASE("the default limit is 8192 x 8192 pixels") {
    CHECK(DEFAULT_MAX_TEXTURE_PIXELS == 67'108'864ULL);
}

TEST_CASE("flip_normal_map_green inverts green and leaves red, blue, and alpha alone") {
    Pixels pixels = {10, 0,   30, 255,  //
                     40, 255, 60, 255,  //
                     70, 128, 90, 200,  //
                     1,  127, 3,  0};
    const NormalMapResult result = flip_normal_map_green(pixels, 2, 2);
    REQUIRE(result.ok());
    CHECK(result.message.empty());
    const Pixels expected = {10, 255, 30, 255,  //
                             40, 0,   60, 255,  //
                             70, 127, 90, 200,  //
                             1,  128, 3,  0};
    CHECK(pixels == expected);
}

TEST_CASE("flipping every green value gives 255 minus it, with no fixed point") {
    Pixels pixels(256 * 4);
    for (std::size_t i = 0; i < 256; ++i) {
        pixels[i * 4 + 1] = static_cast<std::uint8_t>(i);
    }
    REQUIRE(flip_normal_map_green(pixels, 256, 1).ok());
    for (std::size_t i = 0; i < 256; ++i) {
        CHECK(pixels[i * 4 + 1] == 255 - i);
    }
}

TEST_CASE("flipping twice restores every byte exactly, including translucent pixels") {
    // The acceptance criterion for FR-008 (TC-007): a round trip gives back the original.
    const Pixels original = random_pixels(97, 61, 12345);
    Pixels pixels = original;
    REQUIRE(flip_normal_map_green(pixels, 97, 61).ok());
    CHECK(pixels != original);
    REQUIRE(flip_normal_map_green(pixels, 97, 61).ok());
    CHECK(pixels == original);
}

TEST_CASE("only the green bytes change") {
    const Pixels original = random_pixels(33, 17, 7);
    Pixels pixels = original;
    REQUIRE(flip_normal_map_green(pixels, 33, 17).ok());
    for (std::size_t i = 0; i < pixels.size(); ++i) {
        if (i % 4 == 1) {
            CHECK(pixels[i] == 255 - original[i]);
        } else {
            CHECK(pixels[i] == original[i]);
        }
    }
}

TEST_CASE("a one-pixel image works") {
    Pixels pixels = {1, 2, 3, 4};
    REQUIRE(flip_normal_map_green(pixels, 1, 1).ok());
    CHECK(pixels == Pixels{1, 253, 3, 4});
}

TEST_CASE("translucent pixels are the ones with alpha below 255") {
    Pixels pixels = {0, 0, 0, 255,  //
                     0, 0, 0, 254,  //
                     0, 0, 0, 0,    //
                     0, 0, 0, 1,    //
                     9, 9, 9, 255};
    const NormalMapResult result = flip_normal_map_green(pixels, 5, 1);
    REQUIRE(result.ok());
    CHECK(result.translucent_pixels == 3);
}

TEST_CASE("an opaque image has no translucent pixels") {
    Pixels pixels(4 * 4 * 4, 255);
    const NormalMapResult result = flip_normal_map_green(pixels, 4, 4);
    REQUIRE(result.ok());
    CHECK(result.translucent_pixels == 0);
}

TEST_CASE("a zero width or height is invalid and changes nothing") {
    Pixels pixels = {1, 2, 3, 4};
    const Pixels before = pixels;
    for (const auto &size : {std::pair{0U, 1U}, std::pair{1U, 0U}, std::pair{0U, 0U}}) {
        const NormalMapResult result = flip_normal_map_green(pixels, size.first, size.second);
        CHECK_FALSE(result.ok());
        CHECK(result.error == TextureError::invalid_pixels);
        CHECK_FALSE(result.message.empty());
        CHECK(result.translucent_pixels == 0);
        CHECK(pixels == before);
    }
}

TEST_CASE("a buffer that does not match width * height * 4 is invalid and changes nothing") {
    Pixels pixels(2 * 2 * 4 + 1, 7);  // one byte too many
    Pixels before = pixels;
    NormalMapResult result = flip_normal_map_green(pixels, 2, 2);
    CHECK(result.error == TextureError::invalid_pixels);
    CHECK(pixels == before);

    pixels.assign(2 * 2 * 4 - 4, 7);  // one pixel too few
    before = pixels;
    result = flip_normal_map_green(pixels, 2, 2);
    CHECK(result.error == TextureError::invalid_pixels);
    CHECK(pixels == before);

    Pixels empty;
    result = flip_normal_map_green(empty, 2, 2);
    CHECK(result.error == TextureError::invalid_pixels);
}

TEST_CASE("more pixels than the limit is over_limit and changes nothing") {
    Pixels pixels(4 * 4 * 4, 5);
    const Pixels before = pixels;
    const NormalMapResult result = flip_normal_map_green(pixels, 4, 4, 15);
    CHECK_FALSE(result.ok());
    CHECK(result.error == TextureError::over_limit);
    CHECK_FALSE(result.message.empty());
    CHECK(pixels == before);
}

TEST_CASE("exactly the limit is accepted") {
    Pixels pixels(4 * 4 * 4, 5);
    CHECK(flip_normal_map_green(pixels, 4, 4, 16).ok());
}

TEST_CASE("a huge claimed size is over_limit and is not multiplied in 32 bits") {
    constexpr auto MAX = std::numeric_limits<std::uint32_t>::max();
    Pixels pixels(16, 1);
    const Pixels before = pixels;
    const NormalMapResult result = flip_normal_map_green(pixels, MAX, MAX);
    CHECK(result.error == TextureError::over_limit);
    CHECK(pixels == before);

    // 65536 * 65536 is 2^32: it would wrap to 0 in 32 bits and look like an empty image.
    const NormalMapResult wrapped = flip_normal_map_green(pixels, 65536, 65536);
    CHECK(wrapped.error == TextureError::over_limit);
}

TEST_CASE("the limit is checked before the buffer length") {
    Pixels pixels(8, 1);
    const NormalMapResult result = flip_normal_map_green(pixels, 100, 100, 10);
    CHECK(result.error == TextureError::over_limit);
}

TEST_CASE("the default limit accepts 8192 x 1 and rejects 8193 x 8192") {
    Pixels row(8192ULL * 4, 0);
    CHECK(flip_normal_map_green(row, 8192, 1).ok());
    Pixels tiny(4, 0);
    CHECK(flip_normal_map_green(tiny, 8193, 8192).error == TextureError::over_limit);
}

TEST_CASE("a large image is flipped correctly") {
    const Pixels original = random_pixels(1024, 768, 99);
    Pixels pixels = original;
    REQUIRE(flip_normal_map_green(pixels, 1024, 768).ok());
    bool all_correct = true;
    for (std::size_t i = 1; i < pixels.size(); i += 4) {
        all_correct = all_correct && pixels[i] == 255 - original[i];
    }
    CHECK(all_correct);
}
