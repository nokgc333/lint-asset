#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace fuzz {

// Splits a fuzz input into chunks. Each chunk is a 2-byte little-endian length followed by that
// many bytes; a length that runs past the end takes whatever is left. The input is read until it is
// used up, and at most `max_chunks` chunks are made. A flat framing like this keeps the seed
// files simple to write and lets the fuzzer mutate every chunk on its own.
inline std::vector<std::span<const std::uint8_t>>
split_chunks(const std::uint8_t *data, std::size_t size, std::size_t max_chunks) {
    std::vector<std::span<const std::uint8_t>> chunks;
    std::size_t offset = 0;
    while (offset < size && chunks.size() < max_chunks) {
        std::size_t length = 0;
        if (size - offset >= 2) {
            length = static_cast<std::size_t>(data[offset]) |
                     (static_cast<std::size_t>(data[offset + 1]) << 8U);
            offset += 2;
        } else {
            offset = size;
        }
        if (length > size - offset) {
            length = size - offset;
        }
        chunks.emplace_back(data + offset, length);
        offset += length;
    }
    return chunks;
}

}  // namespace fuzz
