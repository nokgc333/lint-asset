#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <cstddef>
#include <cstdint>
#include <limits>
#include <string>
#include <vector>

#include "lint_asset/glb_loader.hpp"
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

// loadGlb(bytes, maxFileBytes, maxTriangles) returns a plain JavaScript object.
// The contract is in web/src/wasm/lint_core.d.mts.
emscripten::val load_glb_js(const emscripten::val &bytes, double max_file_bytes,
                            double max_triangles) {
    const lint_asset::LoadLimits limits{limit_from_js(max_file_bytes),
                                        limit_from_js(max_triangles)};
    const std::vector<std::uint8_t> data = bytes_from_js(bytes);
    const lint_asset::LoadResult result = lint_asset::load_glb(data, limits);

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

}  // namespace

EMSCRIPTEN_BINDINGS(lint_core) {
    emscripten::function("version", &version_string);
    emscripten::function("loadGlb", &load_glb_js);
}
