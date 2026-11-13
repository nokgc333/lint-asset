#pragma once

#include "lint_asset/glb_loader.hpp"
#include "tiny_gltf_v3.h"

namespace lint_asset::detail {
struct ParsedModel {
    tg3_model model{};
    tg3_error_stack errors{};
    ParsedModel() { tg3_error_stack_init(&errors); }
    ~ParsedModel() {
        tg3_model_free(&model);
        tg3_error_stack_free(&errors);
    }
    ParsedModel(const ParsedModel &) = delete;
    ParsedModel &operator=(const ParsedModel &) = delete;
};
LoadResult parse_glb(ParsedModel &parsed, std::span<const std::uint8_t> bytes,
                     const LoadLimits &limits);
std::uint64_t element_count(const tg3_model &model, const tg3_primitive &primitive);
std::uint64_t triangle_count(std::int32_t mode, std::uint64_t elements);
}  // namespace lint_asset::detail
