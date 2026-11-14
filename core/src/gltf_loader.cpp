#include "lint_asset/gltf_loader.hpp"

#include <algorithm>
#include <cstring>
#include <new>
#include <stdexcept>
#include <utility>

#include "glb_parse.hpp"
#include "lint_asset/uri_inspection.hpp"

namespace lint_asset {
namespace {

LoadResult failure(LoadError error, std::string message) {
    LoadResult result;
    result.error = error;
    result.message = std::move(message);
    return result;
}

bool is_glb(std::span<const std::uint8_t> bytes) {
    return bytes.size() >= 4 && std::memcmp(bytes.data(), "glTF", 4) == 0;
}

int hex_digit(char value) {
    if (value >= '0' && value <= '9') {
        return value - '0';
    }
    if (value >= 'a' && value <= 'f') {
        return value - 'a' + 10;
    }
    if (value >= 'A' && value <= 'F') {
        return value - 'A' + 10;
    }
    return -1;
}

std::string decode(std::string_view text) {
    std::string result;
    for (std::size_t i = 0; i < text.size(); ++i) {
        if (text[i] == '%' && text.size() - i >= 3) {
            const int high = hex_digit(text[i + 1]);
            const int low = hex_digit(text[i + 2]);
            if (high >= 0 && low >= 0) {
                result.push_back(static_cast<char>(high * 16 + low));
                i += 2;
                continue;
            }
        }
        result.push_back(text[i]);
    }
    return result;
}

std::string clean(std::string_view name) {
    auto result = decode(name);
    std::replace(result.begin(), result.end(), '\\', '/');
    if (result.starts_with("./")) {
        result.erase(0, 2);
    }
    return result;
}

std::string_view basename(std::string_view name) {
    const auto slash = name.find_last_of('/');
    return slash == std::string_view::npos ? name : name.substr(slash + 1);
}

std::size_t match(std::string_view uri, const std::vector<std::string> &names) {
    std::size_t candidate = names.size();
    std::size_t count = 0;
    for (std::size_t i = 0; i < names.size(); ++i) {
        if (names[i] == uri) {
            return i;
        }
        if (basename(names[i]) == basename(uri)) {
            candidate = i;
            ++count;
        }
    }
    return count == 1 ? candidate : names.size();
}

LoadResult parse_gltf(detail::ParsedModel &parsed, std::span<const std::uint8_t> json,
                      std::span<const SuppliedFile> files, const LoadLimits &limits) {
    if (json.size() > limits.max_file_bytes) {
        return failure(LoadError::limit_exceeded, "the files are larger than the size limit");
    }
    tg3_parse_options options;
    tg3_parse_options_init(&options);
    options.images_as_is = 1;
    const auto code =
        tg3_parse(&parsed.model, &parsed.errors, json.data(), json.size(), nullptr, 0, &options);
    LoadResult invalid;
    for (std::uint32_t i = 0; i < parsed.errors.count; ++i) {
        const auto &entry = parsed.errors.entries[i];
        if (entry.severity == TG3_SEVERITY_ERROR && entry.code != TG3_ERR_FS_NOT_AVAILABLE) {
            tg3_error_stack errors{};
            errors.entries = &parsed.errors.entries[i];
            errors.count = 1;
            if (entry.code == TG3_ERR_JSON_PARSE || entry.code == TG3_ERR_OUT_OF_MEMORY) {
                return detail::parse_failure(entry.code, errors);
            }
            if (invalid.ok()) {
                invalid = detail::parse_failure(entry.code, errors);
            }
        }
    }
    if (code != TG3_OK && !parsed.errors.has_error) {
        return detail::parse_failure(code, parsed.errors);
    }

    for (std::uint32_t i = 0; i < parsed.model.buffers_count; ++i) {
        parsed.buffers.push_back(parsed.model.buffers[i]);
    }
    parsed.model.buffers = parsed.buffers.data();
    std::vector<std::string> names;
    for (const auto &file : files) {
        names.push_back(clean(file.name));
    }
    std::vector<bool> used(files.size(), false);
    std::uint64_t total = json.size();
    LoadResult missing;
    bool short_buffer = false;
    for (std::uint32_t i = 0; i < parsed.model.buffers_count; ++i) {
        auto &buffer = parsed.buffers[i];
        const std::string_view uri = buffer.uri.len == 0
                                         ? std::string_view{}
                                         : std::string_view(buffer.uri.data, buffer.uri.len);
        if (uri.empty()) {
            return failure(LoadError::corrupt_file, "a buffer of a .gltf has no uri");
        }
        const auto decoded = decode(uri);
        if (classify_uri(decoded) == UriKind::web_address ||
            classify_uri(clean(uri)) == UriKind::web_address) {
            return failure(LoadError::unsupported_format, "web-address buffers are not supported");
        }
        if (tg3_is_data_uri(uri.data(), uri.size())) {
            short_buffer = short_buffer || buffer.data.count < buffer.byte_length;
            continue;
        }
        const auto index = match(clean(uri), names);
        if (index == files.size()) {
            if (std::find(missing.missing_files.begin(), missing.missing_files.end(), decoded) ==
                missing.missing_files.end()) {
                missing.missing_files.push_back(decoded);
            }
            continue;
        }
        if (!used[index]) {
            if (files[index].bytes.size() > limits.max_file_bytes - total) {
                return failure(LoadError::limit_exceeded,
                               "the files are larger than the size limit");
            }
            total += files[index].bytes.size();
            used[index] = true;
        }
        buffer.data.data = files[index].bytes.data();
        buffer.data.count = files[index].bytes.size();
        short_buffer = short_buffer || buffer.data.count < buffer.byte_length;
    }
    if (!missing.missing_files.empty()) {
        missing.error = LoadError::missing_files;
        missing.message = "required buffer files were not supplied";
        return missing;
    }
    if (!invalid.ok()) {
        return invalid;
    }
    if (short_buffer) {
        return failure(LoadError::corrupt_file, "a buffer is shorter than its declared length");
    }
    return detail::count_model(parsed.model, limits);
}

}  // namespace

LoadResult load_gltf(std::span<const std::uint8_t> json, std::span<const SuppliedFile> files,
                     const LoadLimits &limits) {
    if (is_glb(json)) {
        return load_glb(json, limits);
    }
    try {
        detail::ParsedModel parsed;
        return parse_gltf(parsed, json, files, limits);
    } catch (const std::bad_alloc &) {
        return failure(LoadError::limit_exceeded, "out of memory");
    } catch (const std::length_error &) {
        return failure(LoadError::limit_exceeded, "the files exceed the memory limit");
    }
}

GeometryResult load_gltf_geometry(std::span<const std::uint8_t> json,
                                  std::span<const SuppliedFile> files, const LoadLimits &limits) {
    if (is_glb(json)) {
        return load_glb_geometry(json, limits);
    }
    try {
        detail::ParsedModel parsed;
        const auto counted = parse_gltf(parsed, json, files, limits);
        return detail::extract_geometry(parsed.model, counted, true);
    } catch (const std::bad_alloc &) {
        GeometryResult result;
        result.error = LoadError::limit_exceeded;
        result.message = "out of memory";
        return result;
    } catch (const std::length_error &) {
        GeometryResult result;
        result.error = LoadError::limit_exceeded;
        result.message = "the files exceed the memory limit";
        return result;
    }
}

}  // namespace lint_asset
