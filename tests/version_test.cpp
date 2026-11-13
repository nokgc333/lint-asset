#include <doctest/doctest.h>

#include <algorithm>

#include "lint_asset/version.hpp"

TEST_CASE("version() returns a non-empty MAJOR.MINOR.PATCH string") {
    const auto version = lint_asset::version();

    CHECK_FALSE(version.empty());
    CHECK(std::count(version.begin(), version.end(), '.') == 2);
}
