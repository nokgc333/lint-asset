#include <doctest/doctest.h>

#include <cstdint>
#include <limits>
#include <string_view>

#include "lint_asset/inspection.hpp"
#include "lint_asset/uri_inspection.hpp"

TEST_CASE("external URI totals use 64-bit arithmetic") {
    lint_asset::Geometry geometry;
    geometry.external_images = {std::numeric_limits<std::uint32_t>::max(),
                                std::numeric_limits<std::uint32_t>::max()};
    const auto issues = lint_asset::inspect_external_uris(geometry);
    REQUIRE(issues.size() == 1);
    CHECK(issues[0].message ==
          "External image references: 8589934590 (web addresses: 4294967295, other: 4294967295).");
}

TEST_CASE("URI classification uses bounded ASCII comparisons") {
    using lint_asset::classify_uri;
    using lint_asset::UriKind;
    const char bytes[] = {'H', 'T', 'T', 'P', ':', '/', '/', '\0', 'x'};
    for (std::size_t length = 1; length < 7; ++length) {
        CHECK(classify_uri(std::string_view(bytes, length)) == UriKind::other);
    }
    CHECK(classify_uri(std::string_view(bytes, 7)) == UriKind::web_address);
    CHECK(classify_uri(std::string_view(bytes, sizeof(bytes))) == UriKind::web_address);
    CHECK(classify_uri("\xFF"
                       "http://x") == UriKind::other);
    CHECK(classify_uri(" https://x") == UriKind::other);
    CHECK(classify_uri("http:relative") == UriKind::other);
}

TEST_CASE("external URI issues follow scale issues") {
    lint_asset::Geometry geometry;
    geometry.external_images = {1, 0};
    lint_asset::PrimitiveGeometry primitive;
    primitive.positions = {0, 0, 0, 1500, 0, 0, 0, 1500, 0};
    primitive.triangles = {0, 1, 2};
    geometry.primitives.push_back(primitive);
    geometry.instances.push_back({0, {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}});
    const auto issues = lint_asset::inspect_geometry(geometry);
    REQUIRE(issues.size() >= 2);
    CHECK(issues[0].rule == lint_asset::RuleId::asset_scale_too_large);
    CHECK(issues[1].rule == lint_asset::RuleId::asset_external_uri);
}
