#include <doctest/doctest.h>

#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

#include "lint_asset/inspection.hpp"
#include "lint_asset/obj_loader.hpp"

using lint_asset::GeometryResult;
using lint_asset::LoadError;
using lint_asset::LoadLimits;

namespace {

using Bytes = std::vector<std::uint8_t>;

Bytes bytes_of(const std::string &text) { return Bytes(text.begin(), text.end()); }

GeometryResult load(const std::string &text, const LoadLimits &limits = {}) {
    const Bytes bytes = bytes_of(text);
    return lint_asset::load_obj_geometry(bytes, limits);
}

// A unit cube: 8 positions, 6 quads, outward and counter-clockwise.
const std::string CUBE_POSITIONS =
    "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\n";
const char *const CUBE_QUADS[6][4] = {{"1", "4", "3", "2"}, {"5", "6", "7", "8"},
                                      {"1", "2", "6", "5"}, {"4", "8", "7", "3"},
                                      {"1", "5", "8", "4"}, {"2", "3", "7", "6"}};

// Positions only: `f a b c d`.
std::string cube_plain() {
    std::string text = CUBE_POSITIONS;
    for (const auto &quad : CUBE_QUADS) {
        text += std::string("f ") + quad[0] + " " + quad[1] + " " + quad[2] + " " + quad[3] + "\n";
    }
    return text;
}

// With one vt per quad corner and one vn per face: `f a/1/n b/2/n c/3/n d/4/n`.
std::string cube_full(float normal_sign = 1.0F) {
    const char *const outward[6] = {"0 0 -1", "0 0 1", "0 -1 0", "0 1 0", "-1 0 0", "1 0 0"};
    const char *const inward[6] = {"0 0 1", "0 0 -1", "0 1 0", "0 -1 0", "1 0 0", "-1 0 0"};
    std::string text = CUBE_POSITIONS + "vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n";
    for (const char *normal : normal_sign > 0 ? outward : inward) {
        text += std::string("vn ") + normal + "\n";
    }
    for (int face = 0; face < 6; ++face) {
        text += "f";
        for (int corner = 0; corner < 4; ++corner) {
            text += std::string(" ") + CUBE_QUADS[face][corner] + "/" + std::to_string(corner + 1) +
                    "/" + std::to_string(face + 1);
        }
        text += "\n";
    }
    return text;
}

bool has_rule(const std::vector<lint_asset::Issue> &issues, lint_asset::RuleId rule) {
    return std::any_of(issues.begin(), issues.end(),
                       [rule](const auto &issue) { return issue.rule == rule; });
}

}  // namespace

TEST_CASE("an OBJ cube of quads loads as 12 triangles in one mesh and one primitive") {
    const auto result = load(cube_plain());
    REQUIRE(result.ok());
    CHECK(result.stats.meshes == 1);
    CHECK(result.stats.primitives == 1);
    CHECK(result.stats.triangles == 12);
    REQUIRE(result.geometry.primitives.size() == 1);
    const auto &part = result.geometry.primitives[0];
    CHECK(part.mesh == 0);
    CHECK(part.primitive == 0);
    CHECK(part.positions.size() == 8 * 3);
    CHECK(part.triangles.size() == 12 * 3);
    CHECK(part.normals.empty());
    CHECK(part.uvs.empty());
    REQUIRE(result.geometry.instances.size() == 1);
    CHECK(result.geometry.instances[0].mesh == 0);
    CHECK(result.geometry.instances[0].world[0] == 1.0F);
    CHECK(result.geometry.instances[0].world[5] == 1.0F);
    CHECK(result.geometry.instances[0].world[10] == 1.0F);
    CHECK(result.geometry.instances[0].world[15] == 1.0F);
    CHECK(result.geometry.external_images.web_addresses == 0);
    CHECK(result.geometry.external_images.other == 0);
}

TEST_CASE("a quad is split as a fan and keeps its winding") {
    const auto result = load("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n");
    REQUIRE(result.ok());
    CHECK(result.geometry.primitives[0].triangles == std::vector<std::uint32_t>{0, 1, 2, 0, 2, 3});
}

TEST_CASE("a pentagon makes three triangles") {
    const auto result = load("v 0 0 0\nv 1 0 0\nv 2 1 0\nv 1 2 0\nv 0 1 0\nf 1 2 3 4 5\n");
    REQUIRE(result.ok());
    CHECK(result.stats.triangles == 3);
    CHECK(result.geometry.primitives[0].triangles ==
          std::vector<std::uint32_t>{0, 1, 2, 0, 2, 3, 0, 3, 4});
}

TEST_CASE("each distinct (v, vt, vn) triple is one vertex, so a flat cube has 24") {
    const auto result = load(cube_full());
    REQUIRE(result.ok());
    const auto &part = result.geometry.primitives[0];
    CHECK(part.positions.size() == 24 * 3);
    CHECK(part.normals.size() == 24 * 3);
    CHECK(part.uvs.size() == 24 * 2);
    CHECK(part.triangles.size() == 12 * 3);
    // The first face is "1/1/1 4/2/1 3/3/1 2/4/1": the second vertex is position 4, with vt 2.
    CHECK(part.positions[3] == 0.0F);
    CHECK(part.positions[4] == 1.0F);
    CHECK(part.positions[5] == 0.0F);
    CHECK(part.uvs[2] == 1.0F);
    CHECK(part.uvs[3] == 0.0F);
    CHECK(part.normals[2] == -1.0F);
}

TEST_CASE("positions that no face uses make no vertex") {
    const auto result = load("v 9 9 9\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 2 3 4\n");
    REQUIRE(result.ok());
    CHECK(result.geometry.primitives[0].positions.size() == 3 * 3);
}

TEST_CASE("the form v//vn gives normals and no uvs") {
    const auto result = load("v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1\n");
    REQUIRE(result.ok());
    CHECK(result.geometry.primitives[0].normals.size() == 9);
    CHECK(result.geometry.primitives[0].uvs.empty());
}

TEST_CASE("normals and uvs are kept only when every face vertex has them") {
    const auto result = load("v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nvt 0 0\nvn 0 0 1\n"
                             "f 1/1/1 2/1/1 3/1/1\nf 1 3 4\n");
    REQUIRE(result.ok());
    CHECK(result.geometry.primitives[0].normals.empty());
    CHECK(result.geometry.primitives[0].uvs.empty());
}

TEST_CASE("a negative index counts back from the last element defined so far") {
    const auto positive = load("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    const auto negative = load("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n");
    REQUIRE(negative.ok());
    CHECK(negative.geometry.primitives[0].positions == positive.geometry.primitives[0].positions);
    CHECK(negative.geometry.primitives[0].triangles == positive.geometry.primitives[0].triangles);
    // "Last defined so far": a v line after the face does not move it.
    const auto later = load("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -1 -2 -3\nv 5 5 5\n");
    REQUIRE(later.ok());
    CHECK(later.geometry.primitives[0].triangles == std::vector<std::uint32_t>{0, 1, 2});
    CHECK(later.geometry.primitives[0].positions[0] == 0.0F);
    CHECK(later.geometry.primitives[0].positions[3] == 1.0F);
}

TEST_CASE("statements that are not geometry are skipped without a file read") {
    const std::string text =
        "\xEF\xBB\xBF# comment\r\nmtllib scene.mtl\r\no thing\r\ng a b\r\ns off\r\n"
        "usemtl red\r\nv 0 0 0\r\nv\t1\t0\t0\r\nv 0 1 0\r\nl 1 2\r\np 1\r\ncurv 0 1 1 2\r\n"
        "f 1 2 \\\r\n 3\r\n";
    const auto result = load(text);
    REQUIRE(result.ok());
    CHECK(result.stats.triangles == 1);
}

TEST_CASE("v lines may carry w or colours; vt may be u only") {
    const auto result = load("v 0 0 0 1\nv 1 0 0 0.5 0.5 0.5\nv 0 1 0\nvt 0.25\nvt 1 0 0\nvt 0 1\n"
                             "f 1/1 2/2 3/3\n");
    REQUIRE(result.ok());
    const auto &uvs = result.geometry.primitives[0].uvs;
    REQUIRE(uvs.size() == 6);
    CHECK(uvs[0] == 0.25F);
    CHECK(uvs[1] == 0.0F);
}

TEST_CASE("a file with vertices but no faces loads with nothing to draw") {
    const auto result = load("v 0 0 0\nv 1 0 0\n");
    REQUIRE(result.ok());
    CHECK(result.stats.meshes == 0);
    CHECK(result.stats.primitives == 0);
    CHECK(result.stats.triangles == 0);
    CHECK(result.geometry.primitives.empty());
    CHECK(result.geometry.instances.empty());
}

TEST_CASE("a face with fewer than three vertices is skipped") {
    const auto result = load("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2\nf 1 2 3\n");
    REQUIRE(result.ok());
    CHECK(result.stats.triangles == 1);
}

TEST_CASE("load_obj gives the same counts as load_obj_geometry") {
    const Bytes bytes = bytes_of(cube_plain());
    const auto result = lint_asset::load_obj(bytes);
    REQUIRE(result.ok());
    CHECK(result.stats.meshes == 1);
    CHECK(result.stats.primitives == 1);
    CHECK(result.stats.triangles == 12);
}

TEST_CASE("bad input is E-LOAD-002, and never throws") {
    const std::vector<std::string> bad = {
        "",                                         // empty
        "hello world\n",                            // not an OBJ at all
        "v 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",       // v with two numbers
        "v 0 0 x\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",     // not a number
        "v 0 0 nan\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",   // not finite
        "v 0 0 inf\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",   // not finite
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 0 1 2\n",     // index 0
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 4\n",     // past the end
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf -4 -2 -1\n",  // before the start
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 a\n",     // not a number
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1/2 2 3\n",   // vt past the end
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1//1 2 3\n",  // vn past the end
        std::string("v 0 0 0\0v 1 0 0\n", 16),      // NUL byte
        "vt 0 0\nvn 0 0 1\n",                       // no v and no f
    };
    for (const auto &text : bad) {
        INFO("input: " << text);
        const auto result = load(text);
        CHECK(result.error == LoadError::corrupt_file);
        CHECK(lint_asset::load_error_code(result.error) == "E-LOAD-002");
        CHECK_FALSE(result.message.empty());
        CHECK(result.geometry.primitives.empty());
    }
}

TEST_CASE("GLB bytes are E-LOAD-001") {
    const auto result = load(std::string("glTF\x02\0\0\0", 8));
    CHECK(result.error == LoadError::unsupported_format);
}

TEST_CASE("the byte limit and the triangle limit are E-LOAD-003") {
    const std::string text = cube_plain();
    LoadLimits limits;
    limits.max_file_bytes = text.size() - 1;
    CHECK(load(text, limits).error == LoadError::limit_exceeded);
    limits.max_file_bytes = text.size();
    CHECK(load(text, limits).ok());
    limits = {};
    limits.max_triangles = 11;
    CHECK(load(text, limits).error == LoadError::limit_exceeded);
    limits.max_triangles = 12;
    CHECK(load(text, limits).ok());
}

TEST_CASE("one huge face is stopped by the triangle limit before the triangles are made") {
    std::string text;
    for (int i = 0; i < 5000; ++i) {
        text += "v " + std::to_string(i) + " 0 0\n";
    }
    text += "f";
    for (int i = 1; i <= 5000; ++i) {
        text += " " + std::to_string(i);
    }
    text += "\n";
    LoadLimits limits;
    limits.max_triangles = 100;
    CHECK(load(text, limits).error == LoadError::limit_exceeded);
}

TEST_CASE("outward normals are fine and inverted normals are reported as flipped") {
    const auto good = load(cube_full(1.0F));
    REQUIRE(good.ok());
    const auto good_issues = lint_asset::inspect_geometry(good.geometry);
    CHECK_FALSE(has_rule(good_issues, lint_asset::RuleId::normal_flipped));
    CHECK_FALSE(has_rule(good_issues, lint_asset::RuleId::normal_missing));

    const auto flipped = load(cube_full(-1.0F));
    REQUIRE(flipped.ok());
    CHECK(has_rule(lint_asset::inspect_geometry(flipped.geometry),
                   lint_asset::RuleId::normal_flipped));
}

TEST_CASE("a cube without vn is reported as missing normals, and is a closed solid") {
    const auto result = load(cube_plain());
    REQUIRE(result.ok());
    const auto issues = lint_asset::inspect_geometry(result.geometry);
    CHECK(has_rule(issues, lint_asset::RuleId::normal_missing));
    CHECK_FALSE(has_rule(issues, lint_asset::RuleId::mesh_boundary_edge));
    CHECK_FALSE(has_rule(issues, lint_asset::RuleId::mesh_nonmanifold_edge));
}

TEST_CASE("the numbers are used as metres, so a model in centimetres is too large") {
    const auto result = load("v 0 0 0\nv 5000 0 0\nv 0 5000 0\nf 1 2 3\n");
    REQUIRE(result.ok());
    CHECK(has_rule(lint_asset::inspect_geometry(result.geometry),
                   lint_asset::RuleId::asset_scale_too_large));
}
