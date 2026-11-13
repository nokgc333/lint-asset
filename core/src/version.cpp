#include "lint_asset/version.hpp"

#ifndef LINT_ASSET_VERSION
#error "LINT_ASSET_VERSION must be defined by the build system"
#endif

namespace lint_asset {

std::string_view version() noexcept { return LINT_ASSET_VERSION; }

}  // namespace lint_asset
