#include <emscripten/bind.h>

#include <string>

#include "lint_asset/version.hpp"

namespace {

// Embind converts std::string to a JavaScript string; std::string_view is not supported.
std::string version_string() { return std::string(lint_asset::version()); }

}  // namespace

EMSCRIPTEN_BINDINGS(lint_core) { emscripten::function("version", &version_string); }
