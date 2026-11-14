#include <doctest/doctest.h>

#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <random>
#include <span>
#include <vector>

#include "lint_asset/orm.hpp"

using lint_asset::ORM_DEFAULT_METALLIC;
using lint_asset::ORM_DEFAULT_OCCLUSION;
using lint_asset::ORM_DEFAULT_ROUGHNESS;
using lint_asset::pack_orm;
using lint_asset::TextureError;
using lint_asset::unpack_orm;

namespace {

using Pixels = std::vector<std::uint8_t>;
using View = std::span<const std::uint8_t>;

Pixels gray_image(std::uint32_t width, std::uint32_t height, std::uint32_t seed) {
    std::mt19937 rng(seed);
    Pixels pixels(static_cast<std::size_t>(width) * height * 4);
    for (std::size_t i = 0; i < pixels.size(); i += 4) {
        const auto value = static_cast<std::uint8_t>(rng() & 0xFFU);
        pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
        pixels[i + 3] = 255;
    }
    return pixels;
}

Pixels random_pixels(std::uint32_t width, std::uint32_t height, std::uint32_t seed) {
    std::mt19937 rng(seed);
    Pixels pixels(static_cast<std::size_t>(width) * height * 4);
    for (auto &byte : pixels) {
        byte = static_cast<std::uint8_t>(rng() & 0xFFU);
    }
    return pixels;
}

}  // namespace

TEST_CASE("texture_error_code has a code for a size mismatch") {
    CHECK(lint_asset::texture_error_code(TextureError::size_mismatch) == "E-TEX-002");
}

TEST_CASE("the defaults are white occlusion, white roughness, and black metallic") {
    CHECK(ORM_DEFAULT_OCCLUSION == 255);
    CHECK(ORM_DEFAULT_ROUGHNESS == 255);
    CHECK(ORM_DEFAULT_METALLIC == 0);
}

TEST_CASE("pack_orm puts occlusion in red, roughness in green, and metallic in blue") {
    const Pixels occlusion = {10, 10, 10, 255, 20, 20, 20, 255};
    const Pixels roughness = {30, 30, 30, 255, 40, 40, 40, 255};
    const Pixels metallic = {50, 50, 50, 255, 60, 60, 60, 255};
    const auto result = pack_orm(View(occlusion), View(roughness), View(metallic), 2, 1);
    REQUIRE(result.ok());
    CHECK(result.message.empty());
    CHECK(result.pixels == Pixels{10, 30, 50, 255, 20, 40, 60, 255});
    CHECK(result.non_gray_pixels == std::array<std::uint64_t, 3>{0, 0, 0});
    CHECK(result.translucent_pixels == 0);
}

TEST_CASE("pack_orm reads only the red channel of an input, and writes an opaque result") {
    const Pixels occlusion = {7, 200, 100, 0};  // red 7; green, blue, and alpha are not used
    const Pixels roughness = {8, 1, 2, 128};
    const Pixels metallic = {9, 3, 4, 255};
    const auto result = pack_orm(View(occlusion), View(roughness), View(metallic), 1, 1);
    REQUIRE(result.ok());
    CHECK(result.pixels == Pixels{7, 8, 9, 255});
}

TEST_CASE("pack_orm fills a missing texture with its default") {
    const Pixels roughness = {77, 77, 77, 255};
    const auto only_roughness = pack_orm(std::nullopt, View(roughness), std::nullopt, 1, 1);
    REQUIRE(only_roughness.ok());
    CHECK(only_roughness.pixels == Pixels{255, 77, 0, 255});

    const Pixels occlusion = {11, 11, 11, 255};
    const auto only_occlusion = pack_orm(View(occlusion), std::nullopt, std::nullopt, 1, 1);
    REQUIRE(only_occlusion.ok());
    CHECK(only_occlusion.pixels == Pixels{11, 255, 0, 255});

    const Pixels metallic = {99, 99, 99, 255};
    const auto only_metallic = pack_orm(std::nullopt, std::nullopt, View(metallic), 1, 1);
    REQUIRE(only_metallic.ok());
    CHECK(only_metallic.pixels == Pixels{255, 255, 99, 255});
}

TEST_CASE("pack_orm needs at least one texture") {
    const auto result = pack_orm(std::nullopt, std::nullopt, std::nullopt, 2, 2);
    CHECK_FALSE(result.ok());
    CHECK(result.error == TextureError::invalid_pixels);
    CHECK_FALSE(result.message.empty());
    CHECK(result.pixels.empty());
}

TEST_CASE("pack_orm counts the pixels of an input that are not gray") {
    const Pixels occlusion = {5, 5, 5, 255, 5, 6, 5, 255, 5, 5, 7, 255};  // two are not gray
    const Pixels roughness = {1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255};  // all gray
    const Pixels metallic = {1, 2, 3, 255, 4, 5, 6, 255, 7, 7, 7, 255};   // two are not gray
    const auto result = pack_orm(View(occlusion), View(roughness), View(metallic), 3, 1);
    REQUIRE(result.ok());
    CHECK(result.non_gray_pixels == std::array<std::uint64_t, 3>{2, 0, 2});
}

TEST_CASE("pack_orm counts translucent pixels of the inputs, and a missing input counts nothing") {
    const Pixels occlusion = {1, 1, 1, 255, 1, 1, 1, 0};   // one translucent
    const Pixels roughness = {1, 1, 1, 10, 1, 1, 1, 255};  // one translucent
    const auto result = pack_orm(View(occlusion), View(roughness), std::nullopt, 2, 1);
    REQUIRE(result.ok());
    CHECK(result.translucent_pixels == 2);
    CHECK(result.non_gray_pixels == std::array<std::uint64_t, 3>{0, 0, 0});
}

TEST_CASE("pack_orm does not change its inputs") {
    const Pixels occlusion = random_pixels(5, 4, 1);
    const Pixels before = occlusion;
    REQUIRE(pack_orm(View(occlusion), std::nullopt, std::nullopt, 5, 4).ok());
    CHECK(occlusion == before);
}

TEST_CASE("pack_orm reports textures of different sizes with E-TEX-002") {
    const Pixels big = gray_image(4, 4, 1);
    const Pixels small = gray_image(2, 2, 2);
    const auto result = pack_orm(View(big), View(small), std::nullopt, 4, 4);
    CHECK_FALSE(result.ok());
    CHECK(result.error == TextureError::size_mismatch);
    CHECK_FALSE(result.message.empty());
    CHECK(result.pixels.empty());
    CHECK(pack_orm(View(small), View(big), std::nullopt, 4, 4).error ==
          TextureError::size_mismatch);
    const Pixels one_byte_over(4 * 4 * 4 + 1, 0);
    CHECK(pack_orm(View(one_byte_over), std::nullopt, std::nullopt, 4, 4).error ==
          TextureError::size_mismatch);
}

TEST_CASE("pack_orm rejects a zero size, and the limit comes first") {
    const Pixels pixels = gray_image(2, 2, 3);
    CHECK(pack_orm(View(pixels), std::nullopt, std::nullopt, 0, 2).error ==
          TextureError::invalid_pixels);
    CHECK(pack_orm(View(pixels), std::nullopt, std::nullopt, 2, 0).error ==
          TextureError::invalid_pixels);
    CHECK(pack_orm(View(pixels), std::nullopt, std::nullopt, 2, 2, 3).error ==
          TextureError::over_limit);
    CHECK(pack_orm(View(pixels), std::nullopt, std::nullopt, 2, 2, 4).ok());
    constexpr auto MAX = std::numeric_limits<std::uint32_t>::max();
    CHECK(pack_orm(View(pixels), std::nullopt, std::nullopt, MAX, MAX).error ==
          TextureError::over_limit);
    CHECK(pack_orm(View(pixels), std::nullopt, std::nullopt, 65536, 65536).error ==
          TextureError::over_limit);
}

TEST_CASE("unpack_orm splits the channels into three gray opaque images") {
    const Pixels packed = {10, 30, 50, 255, 20, 40, 60, 128};
    const auto result = unpack_orm(packed, 2, 1);
    REQUIRE(result.ok());
    CHECK(result.message.empty());
    CHECK(result.textures[0] == Pixels{10, 10, 10, 255, 20, 20, 20, 255});
    CHECK(result.textures[1] == Pixels{30, 30, 30, 255, 40, 40, 40, 255});
    CHECK(result.textures[2] == Pixels{50, 50, 50, 255, 60, 60, 60, 255});
    CHECK(result.translucent_pixels == 1);
}

TEST_CASE("unpack_orm rejects a wrong length, a zero size, and a size over the limit") {
    const Pixels packed(2 * 2 * 4, 1);
    CHECK(unpack_orm(std::span<const std::uint8_t>(packed).first(15), 2, 2).error ==
          TextureError::invalid_pixels);
    CHECK(unpack_orm(packed, 0, 2).error == TextureError::invalid_pixels);
    CHECK(unpack_orm(packed, 2, 2, 3).error == TextureError::over_limit);
    const auto failed = unpack_orm(packed, 2, 2, 3);
    CHECK(failed.textures[0].empty());
    CHECK(failed.textures[1].empty());
    CHECK(failed.textures[2].empty());
}

TEST_CASE("packing what unpack_orm gave restores red, green, and blue exactly (TC-008)") {
    const Pixels original = random_pixels(97, 61, 4242);
    const auto unpacked = unpack_orm(original, 97, 61);
    REQUIRE(unpacked.ok());
    const auto packed = pack_orm(View(unpacked.textures[0]), View(unpacked.textures[1]),
                                 View(unpacked.textures[2]), 97, 61);
    REQUIRE(packed.ok());
    REQUIRE(packed.pixels.size() == original.size());
    bool same = true;
    for (std::size_t i = 0; i < original.size(); i += 4) {
        same = same && packed.pixels[i] == original[i] && packed.pixels[i + 1] == original[i + 1] &&
               packed.pixels[i + 2] == original[i + 2] && packed.pixels[i + 3] == 255;
    }
    CHECK(same);
    CHECK(packed.non_gray_pixels == std::array<std::uint64_t, 3>{0, 0, 0});
}

TEST_CASE("unpacking what pack_orm gave restores the three gray images exactly (TC-008)") {
    const Pixels occlusion = gray_image(64, 48, 1);
    const Pixels roughness = gray_image(64, 48, 2);
    const Pixels metallic = gray_image(64, 48, 3);
    const auto packed = pack_orm(View(occlusion), View(roughness), View(metallic), 64, 48);
    REQUIRE(packed.ok());
    const auto unpacked = unpack_orm(packed.pixels, 64, 48);
    REQUIRE(unpacked.ok());
    CHECK(unpacked.textures[0] == occlusion);
    CHECK(unpacked.textures[1] == roughness);
    CHECK(unpacked.textures[2] == metallic);
    CHECK(unpacked.translucent_pixels == 0);
}
