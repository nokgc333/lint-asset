#include <doctest/doctest.h>

#include <cstdint>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "lint_asset/inspection.hpp"

static std::vector<std::uint8_t> read_sample(const std::string &path) {
    std::ifstream file(path, std::ios::binary);
    REQUIRE_MESSAGE(file.is_open(), "missing sample: " << path);
    return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}

static void check_sample(const std::string &variant, std::size_t triangles, std::size_t issues) {
    const auto committed =
        read_sample(std::string(LINT_ASSET_SAMPLES_DIR) + "/toy-house-" + variant + ".glb");
    const auto generated =
        read_sample(std::string(LINT_ASSET_TEST_GLB_DIR) + "/sample_toy_house_" + variant + ".glb");
    CHECK(committed == generated);
    for (const auto &bytes : {committed, generated}) {
        const auto result = lint_asset::load_glb_geometry(bytes);
        REQUIRE(result.ok());
        std::size_t triangle_count = 0;
        for (const auto &primitive : result.geometry.primitives) {
            triangle_count += primitive.triangles.size() / 3;
        }
        CHECK(triangle_count == triangles);
        CHECK(lint_asset::inspect_geometry(result.geometry).size() == issues);
    }
}

TEST_CASE("samples: clean matches generator and inspection counts") {
    check_sample("clean", 28, 0);
}

TEST_CASE("samples: broken matches generator and inspection counts") {
    check_sample("broken", 27, 6);
}
