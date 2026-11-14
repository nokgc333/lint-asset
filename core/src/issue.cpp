#include "lint_asset/issue.hpp"

namespace lint_asset {

std::string_view rule_name(RuleId rule) noexcept {
    switch (rule) {
    case RuleId::normal_flipped:
        return "normal.flipped";
    case RuleId::normal_missing:
        return "normal.missing";
    case RuleId::normal_unnormalized:
        return "normal.unnormalized";
    case RuleId::mesh_nonmanifold_edge:
        return "mesh.nonmanifold_edge";
    case RuleId::mesh_boundary_edge:
        return "mesh.boundary_edge";
    case RuleId::mesh_degenerate_triangle:
        return "mesh.degenerate_triangle";
    case RuleId::uv_missing:
        return "uv.missing";
    case RuleId::uv_out_of_range:
        return "uv.out_of_range";
    case RuleId::uv_overlap:
        return "uv.overlap";
    case RuleId::asset_triangle_count_exceeded:
        return "asset.triangle_count_exceeded";
    case RuleId::asset_scale_too_small:
        return "asset.scale_too_small";
    case RuleId::asset_scale_too_large:
        return "asset.scale_too_large";
    }
    return {};
}

std::string_view element_kind_name(ElementKind kind) noexcept {
    switch (kind) {
    case ElementKind::triangle:
        return "triangle";
    case ElementKind::asset:
        return "asset";
    }
    return {};
}

std::string_view severity_name(Severity severity) noexcept {
    switch (severity) {
    case Severity::error:
        return "error";
    case Severity::warning:
        return "warning";
    case Severity::info:
        return "info";
    }
    return {};
}

}  // namespace lint_asset
