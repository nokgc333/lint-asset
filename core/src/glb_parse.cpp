#include "glb_parse.hpp"

#include <array>
#include <cstring>
#include <string_view>
#include <utility>

#include "tiny_gltf_v3.h"

namespace lint_asset::detail {

namespace {

constexpr std::array<std::uint8_t, 4> GLB_MAGIC = {'g', 'l', 'T', 'F'};
constexpr std::size_t GLB_HEADER_BYTES = 12;
constexpr std::size_t GLB_VERSION_OFFSET = 4;
constexpr std::uint32_t SUPPORTED_GLB_VERSION = 2;

constexpr std::array<std::string_view, 4> SUPPORTED_REQUIRED_EXTENSIONS = {
    "KHR_mesh_quantization", "KHR_texture_transform", "KHR_materials_unlit", "KHR_texture_basisu"};

LoadResult failure(LoadError error, std::string message) {
    LoadResult result;
    result.error = error;
    result.message = std::move(message);
    return result;
}

const tg3_error_entry *first_error(const tg3_error_stack &errors) {
    for (std::uint32_t i = 0; i < errors.count; ++i) {
        if (errors.entries[i].severity == TG3_SEVERITY_ERROR) {
            return &errors.entries[i];
        }
    }
    return nullptr;
}

}  // namespace

LoadResult parse_failure(tg3_error_code returned_code, const tg3_error_stack &errors) {
    const tg3_error_entry *root = first_error(errors);

    std::string message = (root != nullptr && root->message != nullptr)
                              ? root->message
                              : "the file could not be parsed";
    switch (root != nullptr ? root->code : returned_code) {
    case TG3_ERR_OUT_OF_MEMORY:
        return failure(LoadError::limit_exceeded, "out of memory: " + message);
    case TG3_ERR_FS_NOT_AVAILABLE:
    case TG3_ERR_EXTERNAL_RESOURCE:

        return failure(LoadError::unsupported_format,
                       "the file refers to an external resource, which is not supported: " +
                           message);
    default:
        return failure(LoadError::corrupt_file, std::move(message));
    }
}

namespace {

bool is_supported_required_extension(const tg3_str &name) {
    const std::string_view view(name.data, name.len);
    for (const auto supported : SUPPORTED_REQUIRED_EXTENSIONS) {
        if (view == supported) {
            return true;
        }
    }
    return false;
}

std::string find_unsupported_required_extension(const tg3_model &model) {
    for (std::uint32_t i = 0; i < model.extensions_required_count; ++i) {
        const tg3_str &name = model.extensions_required[i];
        if (!is_supported_required_extension(name)) {
            return std::string(name.data, name.len);
        }
    }
    return {};
}

}  // namespace

std::uint64_t element_count(const tg3_model &model, const tg3_primitive &primitive) {
    if (primitive.indices >= 0) {
        return model.accessors[primitive.indices].count;
    }
    for (std::uint32_t i = 0; i < primitive.attributes_count; ++i) {
        const tg3_str_int_pair &attribute = primitive.attributes[i];
        if (std::string_view(attribute.key.data, attribute.key.len) == "POSITION") {
            return model.accessors[attribute.value].count;
        }
    }
    return 0;
}

std::uint64_t triangle_count(std::int32_t mode, std::uint64_t elements) {
    switch (mode) {
    case TG3_MODE_TRIANGLES:
        return elements / 3;
    case TG3_MODE_TRIANGLE_STRIP:
    case TG3_MODE_TRIANGLE_FAN:
        return elements >= 3 ? elements - 2 : 0;
    default:
        return 0;
    }
}

LoadResult parse_glb(ParsedModel &parsed, std::span<const std::uint8_t> bytes,
                     const LoadLimits &limits) {
    if (bytes.size() > limits.max_file_bytes) {
        return failure(LoadError::limit_exceeded, "the file is larger than the size limit");
    }
    if (bytes.size() < GLB_MAGIC.size() ||
        std::memcmp(bytes.data(), GLB_MAGIC.data(), GLB_MAGIC.size()) != 0) {
        return failure(LoadError::unsupported_format, "the file is not a GLB (binary glTF)");
    }
    if (bytes.size() < GLB_HEADER_BYTES) {
        return failure(LoadError::corrupt_file, "the GLB header is cut off");
    }
    std::uint32_t version = 0;
    std::memcpy(&version, bytes.data() + GLB_VERSION_OFFSET, sizeof(version));

    if (version != SUPPORTED_GLB_VERSION) {
        return failure(LoadError::unsupported_format, "only GLB version 2 is supported");
    }

    tg3_parse_options options;
    tg3_parse_options_init(&options);
    options.images_as_is = 1;
    options.borrow_input_buffers = 1;

    const tg3_error_code code = tg3_parse_glb(&parsed.model, &parsed.errors, bytes.data(),
                                              bytes.size(), nullptr, 0, &options);
    if (code != TG3_OK) {
        return parse_failure(code, parsed.errors);
    }

    return count_model(parsed.model, limits);
}

LoadResult count_model(const tg3_model &model, const LoadLimits &limits) {
    if (const std::string name = find_unsupported_required_extension(model); !name.empty()) {
        return failure(LoadError::unsupported_extension,
                       "the file requires an unsupported extension: " + name);
    }

    LoadResult result;
    result.stats.meshes = model.meshes_count;
    for (std::uint32_t m = 0; m < model.meshes_count; ++m) {
        const tg3_mesh &mesh = model.meshes[m];
        result.stats.primitives += mesh.primitives_count;
        for (std::uint32_t p = 0; p < mesh.primitives_count; ++p) {
            const tg3_primitive &primitive = mesh.primitives[p];
            const std::int32_t mode = primitive.mode < 0 ? TG3_MODE_TRIANGLES : primitive.mode;
            const std::uint64_t triangles = triangle_count(mode, element_count(model, primitive));

            if (triangles > limits.max_triangles - result.stats.triangles) {
                return failure(LoadError::limit_exceeded,
                               "the model has more triangles than the limit");
            }
            result.stats.triangles += triangles;
        }
    }
    return result;
}

}  // namespace lint_asset::detail
