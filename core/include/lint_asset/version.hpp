#pragma once

#include <string_view>

namespace lint_asset {

// Returns the library version, such as "0.0.0". The value comes from project() in CMake.
std::string_view version() noexcept;

}  // namespace lint_asset
