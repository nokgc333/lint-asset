// Fuzz target: the texture conversions (normal map flip, ORM pack and unpack). The first bytes pick
// the sizes and the pixel limit; the rest is split into pixel buffers.
#include <fuzzer/FuzzedDataProvider.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <vector>

#include "lint_asset/normal_map.hpp"
#include "lint_asset/orm.hpp"

namespace {
// The pixel limit is kept small so that one run stays fast; the code that checks it is the same.
constexpr std::uint64_t MAX_FUZZ_PIXELS = 1U << 16U;

std::vector<std::uint8_t> take_pixels(FuzzedDataProvider &input, std::uint64_t pixels) {
    // Usually the right length, sometimes not, so that the length check is exercised too.
    const std::size_t exact = static_cast<std::size_t>(std::min<std::uint64_t>(pixels, 4096) * 4);
    const std::size_t length =
        input.ConsumeBool() ? exact : input.ConsumeIntegralInRange<std::size_t>(0, 64);
    return input.ConsumeBytes<std::uint8_t>(length);
}
}  // namespace

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
    FuzzedDataProvider input(data, size);
    const bool small = input.ConsumeBool();
    const auto width = small ? input.ConsumeIntegralInRange<std::uint32_t>(0, 64)
                             : input.ConsumeIntegral<std::uint32_t>();
    const auto height = small ? input.ConsumeIntegralInRange<std::uint32_t>(0, 64)
                              : input.ConsumeIntegral<std::uint32_t>();
    const auto max_pixels = input.ConsumeIntegralInRange<std::uint64_t>(0, MAX_FUZZ_PIXELS);
    const std::uint64_t pixels = static_cast<std::uint64_t>(width) * height;

    auto flip = take_pixels(input, pixels);
    (void)lint_asset::flip_normal_map_green(flip, width, height, max_pixels);

    auto unpack = take_pixels(input, pixels);
    (void)lint_asset::unpack_orm(unpack, width, height, max_pixels);

    std::vector<std::uint8_t> inputs[3];
    std::optional<std::span<const std::uint8_t>> views[3];
    for (int i = 0; i < 3; ++i) {
        if (input.ConsumeBool()) {
            inputs[i] = take_pixels(input, pixels);
            views[i] = std::span<const std::uint8_t>(inputs[i]);
        }
    }
    (void)lint_asset::pack_orm(views[0], views[1], views[2], width, height, max_pixels);
    return 0;
}
