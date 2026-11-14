#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <cstddef>
#include <cstdint>
#include <limits>
#include <string>
#include <vector>

#include "lint_asset/glb_geometry.hpp"
#include "lint_asset/glb_loader.hpp"
#include "lint_asset/inspection.hpp"
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

template <typename Result> emscripten::val load_result_to_js(const Result &result) {
    emscripten::val out = emscripten::val::object();
    out.set("ok", result.ok());
    out.set("code", std::string(lint_asset::load_error_code(result.error)));
    out.set("message", result.message);
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

void add_issues(emscripten::val &out, const lint_asset::GeometryResult &result) {
    auto issues = emscripten::val::array();
    if (result.ok()) {
        for (const auto &issue : lint_asset::inspect_geometry(result.geometry)) {
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

emscripten::val inspect_js(const emscripten::val &bytes, double max_file_bytes,
                           double max_triangles) {
    const auto result = geometry_from_js(bytes, max_file_bytes, max_triangles);
    auto out = load_result_to_js(result);
    add_issues(out, result);
    return out;
}

emscripten::val analyze_js(const emscripten::val &bytes, double max_file_bytes,
                           double max_triangles) {
    const auto result = geometry_from_js(bytes, max_file_bytes, max_triangles);
    auto out = load_result_to_js(result);
    add_geometry(out, result);
    add_issues(out, result);
    return out;
}

}  // namespace

EMSCRIPTEN_BINDINGS(lint_core) {
    emscripten::function("version", &version_string);
    emscripten::function("loadGlb", &load_glb_js);
    emscripten::function("loadGlbGeometry", &load_glb_geometry_js);
    emscripten::function("inspect", &inspect_js);
    emscripten::function("analyze", &analyze_js);
}
