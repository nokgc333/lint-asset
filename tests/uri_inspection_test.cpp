#include <doctest/doctest.h>

#include <cstdint>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "lint_asset/inspection.hpp"
#include "lint_asset/uri_inspection.hpp"

using lint_asset::classify_uri;
using lint_asset::ElementKind;
using lint_asset::Geometry;
using lint_asset::inspect_external_uris;
using lint_asset::Issue;
using lint_asset::RuleId;
using lint_asset::Severity;
using lint_asset::UriKind;

namespace {

Geometry with_counts(std::uint32_t web, std::uint32_t other) {
    Geometry geometry;
    geometry.external_images.web_addresses = web;
    geometry.external_images.other = other;
    return geometry;
}

Geometry load_fixture(const std::string &name) {
    const std::string path = std::string(LINT_ASSET_TEST_GLB_DIR) + "/" + name + ".glb";
    std::ifstream file(path, std::ios::binary);
    REQUIRE_MESSAGE(file.is_open(), "missing generated file: " << path);
    const std::vector<std::uint8_t> bytes{std::istreambuf_iterator<char>(file),
                                          std::istreambuf_iterator<char>()};
    const auto result = lint_asset::load_glb_geometry(bytes);
    REQUIRE(result.ok());
    return result.geometry;
}

}  // namespace

TEST_CASE("the rule is named asset.external_uri") {
    CHECK(lint_asset::rule_name(RuleId::asset_external_uri) == "asset.external_uri");
}

TEST_CASE("classify_uri: bytes inside the file") {
    CHECK(classify_uri("") == UriKind::embedded);
    CHECK(classify_uri("data:image/png;base64,iVBORw0KGgo=") == UriKind::embedded);
    CHECK(classify_uri("DATA:image/png;base64,AAAA") == UriKind::embedded);
    CHECK(classify_uri("Data:,x") == UriKind::embedded);
}

TEST_CASE("classify_uri: web addresses") {
    CHECK(classify_uri("http://example.invalid/a.png") == UriKind::web_address);
    CHECK(classify_uri("https://example.invalid/a.png") == UriKind::web_address);
    CHECK(classify_uri("HTTPS://EXAMPLE.invalid/a.png") == UriKind::web_address);
    CHECK(classify_uri("HtTp://example.invalid/") == UriKind::web_address);
    CHECK(classify_uri("ftp://example.invalid/a.png") == UriKind::web_address);
    CHECK(classify_uri("ftps://example.invalid/a.png") == UriKind::web_address);
    CHECK(classify_uri("//cdn.example.invalid/a.png") == UriKind::web_address);
}

TEST_CASE("classify_uri: everything else is other") {
    CHECK(classify_uri("a.png") == UriKind::other);
    CHECK(classify_uri("textures/a.png") == UriKind::other);
    CHECK(classify_uri("../a.png") == UriKind::other);
    CHECK(classify_uri("/etc/passwd") == UriKind::other);
    CHECK(classify_uri("C:\\Users\\me\\a.png") == UriKind::other);
    CHECK(classify_uri("file:///tmp/a.png") == UriKind::other);
    CHECK(classify_uri("blob:https://example.invalid/uuid") == UriKind::other);
    CHECK(classify_uri("javascript:alert(1)") == UriKind::other);
}

TEST_CASE("classify_uri: a scheme must be complete, not just a prefix of a word") {
    CHECK(classify_uri("http") == UriKind::other);
    CHECK(classify_uri("http:/x.png") == UriKind::other);
    CHECK(classify_uri("https.png") == UriKind::other);
    CHECK(classify_uri("database.png") == UriKind::other);
    CHECK(classify_uri("data") == UriKind::other);
    CHECK(classify_uri("/") == UriKind::other);
}

TEST_CASE("inspect_external_uris: nothing external, no issue") {
    CHECK(inspect_external_uris(Geometry{}).empty());
    CHECK(inspect_external_uris(with_counts(0, 0)).empty());
}

TEST_CASE("inspect_external_uris: one asset warning with the counts and no uri text") {
    const std::vector<Issue> expected = {
        {RuleId::asset_external_uri,
         Severity::warning,
         "External image references: 3 (web addresses: 1, other: 2).",
         0,
         0,
         1,
         {},
         false,
         ElementKind::asset},
    };
    CHECK(inspect_external_uris(with_counts(1, 2)) == expected);
}

TEST_CASE("inspect_external_uris: zero in one kind is still written") {
    CHECK(inspect_external_uris(with_counts(4, 0)).at(0).message ==
          "External image references: 4 (web addresses: 4, other: 0).");
    CHECK(inspect_external_uris(with_counts(0, 1)).at(0).message ==
          "External image references: 1 (web addresses: 0, other: 1).");
}

TEST_CASE("load_glb_geometry counts the images that are stored outside the file") {
    const Geometry web = load_fixture("external_image_uri");
    CHECK(web.external_images.web_addresses == 1);
    CHECK(web.external_images.other == 0);

    const Geometry mixed = load_fixture("external_image_uris_mixed");
    CHECK(mixed.external_images.web_addresses == 3);
    CHECK(mixed.external_images.other == 2);

    const Geometry embedded = load_fixture("embedded_image_uri");
    CHECK(embedded.external_images.web_addresses == 0);
    CHECK(embedded.external_images.other == 0);

    const Geometry plain = load_fixture("cube");
    CHECK(plain.external_images.web_addresses == 0);
    CHECK(plain.external_images.other == 0);
}

TEST_CASE("the external image warning comes before the triangle issues in the report") {
    const auto issues = lint_asset::inspect_geometry(load_fixture("external_image_uri"));
    REQUIRE(issues.size() == 2);
    CHECK(issues[0].rule == RuleId::asset_external_uri);
    CHECK(issues[0].element_kind == ElementKind::asset);
    CHECK(issues[1].rule == RuleId::uv_missing);
}

TEST_CASE("an image stored outside the file does not stop the file from loading") {
    // SEC-002: the uri is never opened, and the model is still inspected.
    const auto issues = lint_asset::inspect_geometry(load_fixture("external_image_uris_mixed"));
    CHECK_FALSE(issues.empty());
}
