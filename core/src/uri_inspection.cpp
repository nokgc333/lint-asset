#include "lint_asset/uri_inspection.hpp"

#include <string>

namespace lint_asset {
namespace {

bool starts_with_ascii_case_insensitive(std::string_view text, std::string_view prefix) noexcept {
    if (text.size() < prefix.size()) {
        return false;
    }
    for (std::size_t i = 0; i < prefix.size(); ++i) {
        const char c = text[i];
        const char lower = c >= 'A' && c <= 'Z' ? static_cast<char>(c + ('a' - 'A')) : c;
        if (lower != prefix[i]) {
            return false;
        }
    }
    return true;
}

}  // namespace

UriKind classify_uri(std::string_view uri) noexcept {
    if (uri.empty() || starts_with_ascii_case_insensitive(uri, "data:")) {
        return UriKind::embedded;
    }
    if (uri.starts_with("//") || starts_with_ascii_case_insensitive(uri, "http://") ||
        starts_with_ascii_case_insensitive(uri, "https://") ||
        starts_with_ascii_case_insensitive(uri, "ftp://") ||
        starts_with_ascii_case_insensitive(uri, "ftps://")) {
        return UriKind::web_address;
    }
    return UriKind::other;
}

std::vector<Issue> inspect_external_uris(const Geometry &geometry) {
    const auto &counts = geometry.external_images;
    const auto total = static_cast<std::uint64_t>(counts.web_addresses) + counts.other;
    if (total == 0) {
        return {};
    }
    return {{RuleId::asset_external_uri,
             Severity::warning,
             "External image references: " + std::to_string(total) +
                 " (web addresses: " + std::to_string(counts.web_addresses) +
                 ", other: " + std::to_string(counts.other) + ").",
             0,
             0,
             1,
             {},
             false,
             ElementKind::asset}};
}

}  // namespace lint_asset
