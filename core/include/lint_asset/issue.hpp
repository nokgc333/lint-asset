#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace lint_asset {

enum class Severity : std::uint8_t { error, warning, info };

// The checks that exist so far. Each value maps to one rule id in the report schema.
enum class RuleId : std::uint8_t {
    normal_flipped,                 // "normal.flipped"
    normal_missing,                 // "normal.missing"
    normal_unnormalized,            // "normal.unnormalized"
    mesh_nonmanifold_edge,          // "mesh.nonmanifold_edge"
    mesh_boundary_edge,             // "mesh.boundary_edge"
    mesh_degenerate_triangle,       // "mesh.degenerate_triangle"
    asset_triangle_count_exceeded,  // "asset.triangle_count_exceeded"
    asset_scale_too_small,          // "asset.scale_too_small"
    asset_scale_too_large,          // "asset.scale_too_large"
};

// What an issue points at: the triangles of one primitive, or the whole asset.
enum class ElementKind : std::uint8_t { triangle, asset };

// "triangle" or "asset", as written in the report.
std::string_view element_kind_name(ElementKind kind) noexcept;

// The rule id as written in the report, for example "normal.flipped".
std::string_view rule_name(RuleId rule) noexcept;

// "error", "warning", or "info", as written in the report.
std::string_view severity_name(Severity severity) noexcept;

// A report lists at most this many elements per issue; `count` still holds the total.
constexpr std::size_t MAX_ISSUE_ELEMENTS = 1000;

// One finding. The fields follow the report schema.
//
// - element_kind triangle (the default): the issue is about triangles of one primitive. `mesh` and
//   `primitive` say which, `elements` lists the triangles, and `count` is how many there are.
// - element_kind asset: the issue is about the whole asset. `mesh` and `primitive` are 0 and not
//   meaningful, `count` is 1, `elements` is empty, and `truncated` is false.
struct Issue {
    RuleId rule = RuleId::normal_flipped;
    Severity severity = Severity::error;
    std::string message;                  // a short English description
    std::uint32_t mesh = 0;               // target: the mesh index in the file
    std::uint32_t primitive = 0;          // target: the primitive index in that mesh
    std::uint64_t count = 0;              // how many triangles are affected, in total
    std::vector<std::uint32_t> elements;  // triangle numbers, ascending, at most MAX_ISSUE_ELEMENTS
    bool truncated = false;               // true when `elements` leaves some of the `count` out
    ElementKind element_kind = ElementKind::triangle;

    bool operator==(const Issue &) const = default;
};

}  // namespace lint_asset
