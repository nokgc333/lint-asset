#pragma once

#include <cstdint>
#include <string_view>
#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/issue.hpp"

namespace lint_asset {

// Where a glTF "uri" points.
enum class UriKind : std::uint8_t {
    embedded,     // no uri, or a data: URI: the bytes are inside the file
    web_address,  // http://, https://, ftp://, ftps://, or a protocol-relative //host/path
    other  // anything else: a relative or absolute file path, file:, blob:, a drive letter...
};

// Sorts a uri string into one of the kinds above. The scheme is compared without regard to case.
// It looks only at the start of the string and never opens, resolves, or fetches anything
// (SEC-002).
UriKind classify_uri(std::string_view uri) noexcept;

// asset.external_uri (warning, one issue for the whole asset, element_kind asset, count 1): the
// file lists images whose data is not inside it. Every entry of the glTF "images" array counts,
// also one that no texture uses, because a viewer or an engine may still try to load it.
//
// Geometry::external_images holds the counts. The message holds only counts, never the uri
// itself, because a path can contain the author's folder names and a report can be shared:
// "External image references: 3 (web addresses: 1, other: 2)."
// There is no issue when the total is 0.
std::vector<Issue> inspect_external_uris(const Geometry &geometry);

}  // namespace lint_asset
