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
