#include <doctest/doctest.h>

#include <cstdint>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/gltf_loader.hpp"
#include "lint_asset/inspection.hpp"

using lint_asset::GeometryResult;
using lint_asset::LoadError;
using lint_asset::LoadLimits;
using lint_asset::SuppliedFile;

namespace {

using Bytes = std::vector<std::uint8_t>;

Bytes read_fixture(const std::string &name) {
    const std::string path = std::string(LINT_ASSET_TEST_GLB_DIR) + "/" + name;
    std::ifstream file(path, std::ios::binary);
    REQUIRE_MESSAGE(file.is_open(), "missing generated file: " << path);
    return Bytes{std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}

// A supplied file: the fixture's bytes, under the name the user's browser would give.
struct Held {
    std::string name;
    Bytes bytes;
};

std::vector<SuppliedFile> as_files(const std::vector<Held> &held) {
    std::vector<SuppliedFile> files;
    for (const auto &item : held) {
        files.push_back({item.name, item.bytes});
    }
    return files;
}

GeometryResult load(const std::string &gltf, const std::vector<Held> &held,
                    const LoadLimits &limits = {}) {
    const Bytes json = read_fixture(gltf);
    const auto files = as_files(held);
    return lint_asset::load_gltf_geometry(json, files, limits);
}

}  // namespace

TEST_CASE("a split glTF loads the same geometry as the GLB with the same cube") {
    const auto split =
        load("split_cube.gltf", {{"split_cube.bin", read_fixture("split_cube.bin")}});
    REQUIRE(split.ok());
    const Bytes glb = read_fixture("cube.glb");
    const auto single = lint_asset::load_glb_geometry(glb);
    REQUIRE(single.ok());
    CHECK(split.stats.meshes == single.stats.meshes);
    CHECK(split.stats.primitives == single.stats.primitives);
    CHECK(split.stats.triangles == single.stats.triangles);
    REQUIRE(split.geometry.primitives.size() == single.geometry.primitives.size());
    CHECK(split.geometry.primitives[0].positions == single.geometry.primitives[0].positions);
    CHECK(split.geometry.primitives[0].triangles == single.geometry.primitives[0].triangles);
    CHECK(lint_asset::inspect_geometry(split.geometry) ==
          lint_asset::inspect_geometry(single.geometry));
}

TEST_CASE("load_gltf counts like load_glb") {
    const Bytes json = read_fixture("split_cube.gltf");
    const Bytes bin = read_fixture("split_cube.bin");
    const std::vector<SuppliedFile> files = {{"split_cube.bin", bin}};
    const auto result = lint_asset::load_gltf(json, files);
    REQUIRE(result.ok());
    CHECK(result.stats.meshes == 1);
    CHECK(result.stats.primitives == 1);
    CHECK(result.stats.triangles == 12);
}

TEST_CASE("a buffer that was not supplied is E-LOAD-005, with its name") {
    const auto result = load("split_cube.gltf", {});
    CHECK_FALSE(result.ok());
    CHECK(result.error == LoadError::missing_files);
    CHECK(lint_asset::load_error_code(result.error) == "E-LOAD-005");
    CHECK(result.missing_files == std::vector<std::string>{"split_cube.bin"});
    CHECK_FALSE(result.message.empty());
    CHECK(result.geometry.primitives.empty());
}

TEST_CASE("a file with another name does not stand in for the buffer") {
    const auto result = load("split_cube.gltf", {{"other.bin", read_fixture("split_cube.bin")}});
    CHECK(result.error == LoadError::missing_files);
    CHECK(result.missing_files == std::vector<std::string>{"split_cube.bin"});
}

TEST_CASE("a buffer in a sub folder matches by its path, or by its name when that is unique") {
    const Bytes bin = read_fixture("split_cube.bin");
    CHECK(load("split_cube_subfolder.gltf", {{"buffers/split_cube.bin", bin}}).ok());
    CHECK(load("split_cube_subfolder.gltf", {{"./buffers/split_cube.bin", bin}}).ok());
    CHECK(load("split_cube_subfolder.gltf", {{"buffers\\split_cube.bin", bin}}).ok());
    CHECK(load("split_cube_subfolder.gltf", {{"split_cube.bin", bin}}).ok());
}

TEST_CASE("a name that is not unique does not match by its last part alone") {
    const Bytes bin = read_fixture("split_cube.bin");
    const auto result =
        load("split_cube_subfolder.gltf", {{"a/split_cube.bin", bin}, {"b/split_cube.bin", bin}});
    CHECK(result.error == LoadError::missing_files);
    CHECK(result.missing_files == std::vector<std::string>{"buffers/split_cube.bin"});
}

TEST_CASE("a percent-encoded uri matches the file name with the characters in it") {
    const Bytes bin = read_fixture("split_cube.bin");
    CHECK(load("split_cube_encoded.gltf", {{"my cube.bin", bin}}).ok());
    const auto missing = load("split_cube_encoded.gltf", {});
    CHECK(missing.error == LoadError::missing_files);
    CHECK(missing.missing_files == std::vector<std::string>{"my cube.bin"});
}

TEST_CASE("a buffer written as a data: uri needs no other file") {
    const auto result = load("embedded_cube.gltf", {});
    REQUIRE(result.ok());
    CHECK(result.stats.triangles == 12);
}

TEST_CASE("a buffer at a web address is never fetched: it is E-LOAD-001") {
    const auto result = load("split_cube_web_buffer.gltf", {});
    CHECK(result.error == LoadError::unsupported_format);
    CHECK(lint_asset::load_error_code(result.error) == "E-LOAD-001");
    // Even when a file of that name is there, the address is not followed.
    const auto with_file =
        load("split_cube_web_buffer.gltf", {{"cube.bin", read_fixture("split_cube.bin")}});
    CHECK(with_file.error == LoadError::unsupported_format);
}

TEST_CASE("images that are missing or at web addresses do not stop the load") {
    const auto result =
        load("split_cube_images.gltf", {{"split_cube.bin", read_fixture("split_cube.bin")}});
    REQUIRE(result.ok());
    // One web address is counted; the relative path and the data: image are not.
    CHECK(result.geometry.external_images.web_addresses == 1);
    CHECK(result.geometry.external_images.other == 0);
    const auto issues = lint_asset::inspect_geometry(result.geometry);
    bool has_warning = false;
    for (const auto &issue : issues) {
        if (issue.rule == lint_asset::RuleId::asset_external_uri) {
            has_warning = true;
            CHECK(issue.message == "External image references: 1 (web addresses: 1, other: 0).");
        }
    }
    CHECK(has_warning);
}

TEST_CASE("an image given with the files is not needed, and not read") {
    const Bytes bin = read_fixture("split_cube.bin");
    const auto result = load("split_cube_images.gltf",
                             {{"split_cube.bin", bin}, {"textures/a.png", Bytes{1, 2, 3}}});
    REQUIRE(result.ok());
    CHECK(result.geometry.external_images.other == 0);
}

TEST_CASE("the size limit counts the .gltf and the files") {
    const Bytes bin = read_fixture("split_cube.bin");
    const Bytes json = read_fixture("split_cube.gltf");
    LoadLimits limits;
    limits.max_file_bytes = json.size() + bin.size() - 1;
    const auto over = load("split_cube.gltf", {{"split_cube.bin", bin}}, limits);
    CHECK(over.error == LoadError::limit_exceeded);
    limits.max_file_bytes = json.size() + bin.size();
    CHECK(load("split_cube.gltf", {{"split_cube.bin", bin}}, limits).ok());
}

TEST_CASE("the triangle limit applies as for a GLB") {
    LoadLimits limits;
    limits.max_triangles = 11;
    const auto result =
        load("split_cube.gltf", {{"split_cube.bin", read_fixture("split_cube.bin")}}, limits);
    CHECK(result.error == LoadError::limit_exceeded);
}

TEST_CASE("text that is not glTF JSON is E-LOAD-002") {
    const Bytes text = {'n', 'o', 't', ' ', 'j', 's', 'o', 'n'};
    const auto result = lint_asset::load_gltf_geometry(text, {});
    CHECK(result.error == LoadError::corrupt_file);
    const Bytes empty;
    CHECK_FALSE(lint_asset::load_gltf_geometry(empty, {}).ok());
}

TEST_CASE("a .gltf whose buffer is too short for its accessors is E-LOAD-002") {
    const auto result = load("split_cube.gltf", {{"split_cube.bin", Bytes(10, 0)}});
    CHECK_FALSE(result.ok());
    CHECK(result.error != LoadError::none);
}

TEST_CASE("GLB bytes given to load_gltf are loaded as a GLB, and the files are not used") {
    const Bytes glb = read_fixture("cube.glb");
    const auto result = lint_asset::load_gltf_geometry(glb, {});
    REQUIRE(result.ok());
    CHECK(result.stats.triangles == 12);
}

TEST_CASE("every missing buffer is reported once, in the order of the buffers") {
    const auto result = load("split_cube_two_buffers.gltf", {});
    CHECK(result.error == LoadError::missing_files);
    CHECK(result.missing_files == std::vector<std::string>{"part_a.bin", "part_b.bin"});
}

TEST_CASE("a GLB with an external buffer is still E-LOAD-001, as before") {
    const Bytes glb = read_fixture("external_buffer_uri.glb");
    CHECK(lint_asset::load_glb(glb).error == LoadError::unsupported_format);
}

TEST_CASE("a buffer of a .gltf with no uri is E-LOAD-002, not a missing file") {
    const std::string text = R"({"asset":{"version":"2.0"},"buffers":[{"byteLength":4}]})";
    const Bytes json(text.begin(), text.end());
    const auto result = lint_asset::load_gltf_geometry(json, {});
    CHECK(result.error == LoadError::corrupt_file);
    CHECK(result.missing_files.empty());
}
