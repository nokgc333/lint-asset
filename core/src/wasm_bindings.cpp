#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <span>
#include <string>
#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/glb_loader.hpp"
#include "lint_asset/gltf_loader.hpp"
#include "lint_asset/inspection.hpp"
#include "lint_asset/normal_map.hpp"
#include "lint_asset/orm.hpp"
#include "lint_asset/version.hpp"

namespace {

// Embind converts std::string to a JavaScript string; std::string_view is not supported.
std::string version_string() { return std::string(lint_asset::version()); }

// JavaScript numbers are doubles. Casting a negative or NaN double to an unsigned integer is
// undefined behaviour, so out-of-range input is clamped first.
std::uint64_t limit_from_js(double value) {
    constexpr double MAX_EXACT =
        9007199254740992.0;  // 2^53, the largest exactly-representable integer
    if (!(value > 0)) {
        return 0;
    }
    if (value >= MAX_EXACT) {
        return std::numeric_limits<std::uint64_t>::max();
    }
    return static_cast<std::uint64_t>(value);
}

// Copies a Uint8Array into WASM memory once, so the loader can read it as plain bytes.
std::vector<std::uint8_t> bytes_from_js(const emscripten::val &bytes) {
    const auto length = bytes["length"].as<std::size_t>();
    std::vector<std::uint8_t> data(length);
    emscripten::val view(emscripten::typed_memory_view(length, data.data()));
    view.call<void>("set", bytes);
    return data;
}

std::uint32_t dimension_from_js(double value) {
    if (!std::isfinite(value) || value < 0 || std::floor(value) != value) {
        return 0;
    }
    constexpr auto MAX = std::numeric_limits<std::uint32_t>::max();
    if (value > static_cast<double>(MAX)) {
        // Preserve oversized dimensions for the pixel-limit check instead of wrapping to zero.
        return MAX;
    }
    return static_cast<std::uint32_t>(value);
}

emscripten::val flip_normal_map_green_js(const emscripten::val &rgba, double width, double height,
                                         double max_pixels) {
    auto data = bytes_from_js(rgba);
    const auto result = lint_asset::flip_normal_map_green(
        data, dimension_from_js(width), dimension_from_js(height), limit_from_js(max_pixels));
    if (result.ok()) {
        const emscripten::val view(emscripten::typed_memory_view(data.size(), data.data()));
        rgba.call<void>("set", view);
    }
    auto out = emscripten::val::object();
    out.set("ok", result.ok());
    out.set("code", std::string(lint_asset::texture_error_code(result.error)));
    out.set("message", result.message);
    out.set("translucent_pixels", static_cast<double>(result.translucent_pixels));
    return out;
}

template <typename Result> emscripten::val load_result_to_js(const Result &result) {
    emscripten::val out = emscripten::val::object();
    out.set("ok", result.ok());
    out.set("code", std::string(lint_asset::load_error_code(result.error)));
    out.set("message", result.message);
    if (!result.ok()) {
        auto missing = emscripten::val::array();
        for (const auto &name : result.missing_files) {
            missing.call<void>("push", name);
        }
        out.set("missing_files", missing);
    }
    out.set("meshes", result.stats.meshes);
    out.set("primitives", result.stats.primitives);
    // At most the triangle limit, which is far below 2^53, so a JavaScript number is exact.
    out.set("triangles", static_cast<double>(result.stats.triangles));
    return out;
}

// loadGlb(bytes, maxFileBytes, maxTriangles) returns a plain JavaScript object.
// The contract is in web/src/wasm/lint_core.d.mts.
emscripten::val load_glb_js(const emscripten::val &bytes, double max_file_bytes,
                            double max_triangles) {
    const lint_asset::LoadLimits limits{limit_from_js(max_file_bytes),
                                        limit_from_js(max_triangles)};
    const std::vector<std::uint8_t> data = bytes_from_js(bytes);
    const lint_asset::LoadResult result = lint_asset::load_glb(data, limits);

    return load_result_to_js(result);
}

template <typename Container>
emscripten::val copy_array(const char *type, const Container &values) {
    return emscripten::val::global(type).new_(
        emscripten::val(emscripten::typed_memory_view(values.size(), values.data())));
}

bool valid_pixels_from_js(const emscripten::val &value) {
    if (value.isNull() || value.isUndefined() || value.typeOf().as<std::string>() != "object") {
        return false;
    }
    const auto length = value["length"];
    if (length.typeOf().as<std::string>() != "number") {
        return false;
    }
    const auto size = length.as<double>();
    return std::isfinite(size) && size >= 0 && std::floor(size) == size &&
           size <= static_cast<double>(std::numeric_limits<std::size_t>::max()) &&
           (value.instanceof(emscripten::val::global("Uint8Array")) ||
            value.instanceof(emscripten::val::global("Uint8ClampedArray")));
}

template <typename Result> emscripten::val texture_result_to_js(const Result &result) {
    auto out = emscripten::val::object();
    out.set("ok", result.ok());
    out.set("code", std::string(lint_asset::texture_error_code(result.error)));
    out.set("message", result.message);
    out.set("translucent_pixels", static_cast<double>(result.translucent_pixels));
    return out;
}

emscripten::val pack_orm_js(double width, double height, const emscripten::val &occlusion,
                            const emscripten::val &roughness, const emscripten::val &metallic,
                            double max_pixels) {
    auto result = [&]() -> lint_asset::PackOrmResult {
        const std::array values{occlusion, roughness, metallic};
        for (const auto &value : values) {
            if (!value.isNull() && !value.isUndefined() && !valid_pixels_from_js(value)) {
                lint_asset::PackOrmResult invalid;
                invalid.error = lint_asset::TextureError::invalid_pixels;
                invalid.message = "Each texture must be an RGBA byte array.";
                return invalid;
            }
        }
        std::array<std::vector<std::uint8_t>, 3> data;
        std::array<std::optional<std::span<const std::uint8_t>>, 3> inputs;
        for (std::size_t channel = 0; channel < values.size(); ++channel) {
            if (!values[channel].isNull() && !values[channel].isUndefined()) {
                data[channel] = bytes_from_js(values[channel]);
                inputs[channel] = std::span<const std::uint8_t>(data[channel]);
            }
        }
        return lint_asset::pack_orm(inputs[0], inputs[1], inputs[2], dimension_from_js(width),
                                    dimension_from_js(height), limit_from_js(max_pixels));
    }();
    auto out = texture_result_to_js(result);
    out.set("pixels", copy_array("Uint8ClampedArray", result.pixels));
    std::vector<std::uint8_t>().swap(result.pixels);
    auto non_gray_pixels = emscripten::val::array();
    for (const auto count : result.non_gray_pixels) {
        non_gray_pixels.call<void>("push", static_cast<double>(count));
    }
    out.set("non_gray_pixels", non_gray_pixels);
    return out;
}

emscripten::val unpack_orm_js(const emscripten::val &rgba, double width, double height,
                              double max_pixels) {
    auto result = [&]() -> lint_asset::UnpackOrmResult {
        if (!valid_pixels_from_js(rgba)) {
            lint_asset::UnpackOrmResult invalid;
            invalid.error = lint_asset::TextureError::invalid_pixels;
            invalid.message = "The texture must be an RGBA byte array.";
            return invalid;
        }
        const auto data = bytes_from_js(rgba);
        return lint_asset::unpack_orm(data, dimension_from_js(width), dimension_from_js(height),
                                      limit_from_js(max_pixels));
    }();
    auto out = texture_result_to_js(result);
    constexpr std::array names{"occlusion", "roughness", "metallic"};
    for (std::size_t channel = 0; channel < names.size(); ++channel) {
        out.set(names[channel], copy_array("Uint8ClampedArray", result.textures[channel]));
        std::vector<std::uint8_t>().swap(result.textures[channel]);
    }
    return out;
}

lint_asset::GeometryResult geometry_from_js(const emscripten::val &bytes, double max_file_bytes,
                                            double max_triangles) {
    const lint_asset::LoadLimits limits{limit_from_js(max_file_bytes),
                                        limit_from_js(max_triangles)};
    const auto data = bytes_from_js(bytes);
    return lint_asset::load_glb_geometry(data, limits);
}

void add_geometry(emscripten::val &out, const lint_asset::GeometryResult &result) {
    auto parts = emscripten::val::array();
    for (const auto &part : result.geometry.primitives) {
        auto item = emscripten::val::object();
        item.set("mesh", part.mesh);
        item.set("primitive", part.primitive);
        item.set("positions", copy_array("Float32Array", part.positions));
        item.set("normals", copy_array("Float32Array", part.normals));
        item.set("triangles", copy_array("Uint32Array", part.triangles));
        parts.call<void>("push", item);
    }
    auto instances = emscripten::val::array();
    for (const auto &instance : result.geometry.instances) {
        auto item = emscripten::val::object();
        item.set("mesh", instance.mesh);
        item.set("world", copy_array("Float32Array", instance.world));
        instances.call<void>("push", item);
    }
    out.set("parts", parts);
    out.set("instances", instances);
}

void add_issues(emscripten::val &out, const lint_asset::GeometryResult &result,
                const lint_asset::InspectionThresholds &thresholds = {}) {
    auto issues = emscripten::val::array();
    if (result.ok()) {
        for (const auto &issue : lint_asset::inspect_geometry(result.geometry, thresholds)) {
            auto item = emscripten::val::object();
            item.set("rule", std::string(lint_asset::rule_name(issue.rule)));
            item.set("severity", std::string(lint_asset::severity_name(issue.severity)));
            item.set("message", issue.message);
            item.set("element_kind",
                     std::string(lint_asset::element_kind_name(issue.element_kind)));
            if (issue.element_kind == lint_asset::ElementKind::triangle) {
                auto target = emscripten::val::object();
                target.set("mesh", issue.mesh);
                target.set("primitive", issue.primitive);
                item.set("target", target);
            }
            item.set("count", static_cast<double>(issue.count));
            auto elements = emscripten::val::array();
            for (const auto element : issue.elements) {
                elements.call<void>("push", element);
            }
            item.set("elements", elements);
            item.set("truncated", issue.truncated);
            issues.call<void>("push", item);
        }
    }
    out.set("issues", issues);
}

emscripten::val load_glb_geometry_js(const emscripten::val &bytes, double max_file_bytes,
                                     double max_triangles) {
    const auto result = geometry_from_js(bytes, max_file_bytes, max_triangles);
    auto out = load_result_to_js(result);
    add_geometry(out, result);
    return out;
}

lint_asset::InspectionThresholds thresholds_from_js(const emscripten::val &value) {
    if (value.isNull() || value.typeOf().as<std::string>() != "object") {
        return {};
    }
    const auto triangles = value["max_triangles"];
    const auto minimum = value["min_extent_m"];
    const auto maximum = value["max_extent_m"];
    for (const auto &field : {triangles, minimum, maximum}) {
        if (field.typeOf().as<std::string>() != "number") {
            return {};
        }
    }
    const auto count = triangles.as<double>();
    const auto low = minimum.as<double>();
    const auto high = maximum.as<double>();
    constexpr double MAX_EXACT = 9007199254740992.0;
    if (!std::isfinite(count) || count < 0 || count > MAX_EXACT || std::floor(count) != count ||
        !std::isfinite(low) || !std::isfinite(high) || low <= 0 || high <= low) {
        return {};
    }
    return {static_cast<std::uint64_t>(count), low, high};
}

lint_asset::GeometryResult gltf_geometry_from_js(const emscripten::val &json,
                                                 const emscripten::val &files,
                                                 double max_file_bytes, double max_triangles) {
    const lint_asset::LoadLimits limits{limit_from_js(max_file_bytes),
                                        limit_from_js(max_triangles)};
    const auto data = bytes_from_js(json);
    std::vector<std::vector<std::uint8_t>> storage;
    std::vector<lint_asset::SuppliedFile> supplied;
    if (emscripten::val::global("Array").call<bool>("isArray", files)) {
        const auto length = files["length"].as<std::size_t>();
        for (std::size_t i = 0; i < length; ++i) {
            const auto item = files[i];
            if (item.isNull() || item.typeOf().as<std::string>() != "object") {
                continue;
            }
            const auto name = item["name"];
            const auto bytes = item["bytes"];
            if (name.typeOf().as<std::string>() != "string" || bytes.isNull() ||
                bytes.isUndefined() || !bytes.instanceof(emscripten::val::global("Uint8Array"))) {
                continue;
            }
            storage.push_back(bytes_from_js(bytes));
            supplied.push_back({name.as<std::string>(), storage.back()});
        }
    }
    return lint_asset::load_gltf_geometry(data, supplied, limits);
}

emscripten::val inspect_js(const emscripten::val &bytes, double max_file_bytes,
                           double max_triangles, const emscripten::val &settings) {
    const auto result = geometry_from_js(bytes, max_file_bytes, max_triangles);
    auto out = load_result_to_js(result);
    add_issues(out, result, thresholds_from_js(settings));
    return out;
}

emscripten::val analyze_result_to_js(const lint_asset::GeometryResult &result,
                                     const emscripten::val &settings) {
    auto out = load_result_to_js(result);
    add_geometry(out, result);
    const auto thresholds = thresholds_from_js(settings);
    auto limits = emscripten::val::object();
    limits.set("max_triangles", static_cast<double>(thresholds.max_triangles));
    limits.set("min_extent_m", thresholds.min_extent_m);
    limits.set("max_extent_m", thresholds.max_extent_m);
    out.set("thresholds", limits);
    add_issues(out, result, thresholds);
    return out;
}

emscripten::val analyze_js(const emscripten::val &bytes, double max_file_bytes,
                           double max_triangles, const emscripten::val &settings) {
    const auto result = geometry_from_js(bytes, max_file_bytes, max_triangles);
    return analyze_result_to_js(result, settings);
}

emscripten::val analyze_gltf_js(const emscripten::val &json, const emscripten::val &files,
                                double max_file_bytes, double max_triangles,
                                const emscripten::val &settings) {
    return analyze_result_to_js(gltf_geometry_from_js(json, files, max_file_bytes, max_triangles),
                                settings);
}

emscripten::val inspect_gltf_js(const emscripten::val &json, const emscripten::val &files,
                                double max_file_bytes, double max_triangles,
                                const emscripten::val &settings) {
    const auto result = gltf_geometry_from_js(json, files, max_file_bytes, max_triangles);
    auto out = load_result_to_js(result);
    add_issues(out, result, thresholds_from_js(settings));
    return out;
}

}  // namespace

EMSCRIPTEN_BINDINGS(lint_core) {
    emscripten::function("analyzeGltf", &analyze_gltf_js);
    emscripten::function(
        "analyzeGltf",
        emscripten::optional_override([](const emscripten::val &json, const emscripten::val &files,
                                         double max_file_bytes, double max_triangles) {
            return analyze_gltf_js(json, files, max_file_bytes, max_triangles,
                                   emscripten::val::undefined());
        }));
    emscripten::function("inspectGltf", &inspect_gltf_js);
    emscripten::function(
        "inspectGltf",
        emscripten::optional_override([](const emscripten::val &json, const emscripten::val &files,
                                         double max_file_bytes, double max_triangles) {
            return inspect_gltf_js(json, files, max_file_bytes, max_triangles,
                                   emscripten::val::undefined());
        }));
    emscripten::function("flipNormalMapGreen", &flip_normal_map_green_js);
    emscripten::function("packOrm", &pack_orm_js);
    emscripten::function("unpackOrm", &unpack_orm_js);
    emscripten::function("version", &version_string);
    emscripten::function("loadGlb", &load_glb_js);
    emscripten::function("loadGlbGeometry", &load_glb_geometry_js);
    emscripten::function("inspect", &inspect_js);
    emscripten::function(
        "inspect", emscripten::optional_override([](const emscripten::val &bytes,
                                                    double max_file_bytes, double max_triangles) {
            return inspect_js(bytes, max_file_bytes, max_triangles, emscripten::val::undefined());
        }));
    emscripten::function("analyze", &analyze_js);
    emscripten::function(
        "analyze", emscripten::optional_override([](const emscripten::val &bytes,
                                                    double max_file_bytes, double max_triangles) {
            return analyze_js(bytes, max_file_bytes, max_triangles, emscripten::val::undefined());
        }));
}
