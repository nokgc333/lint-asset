#include "lint_asset/obj_loader.hpp"

#include <array>
#include <charconv>
#include <cmath>
#include <cstring>
#include <limits>
#include <new>
#include <stdexcept>
#include <string_view>
#include <unordered_map>
#include <utility>

namespace lint_asset {
namespace {

struct Failure {
    LoadError error;
    const char *message;
};

void corrupt(const char *message) { throw Failure{LoadError::corrupt_file, message}; }

struct Fields {
    std::string_view text;
    std::size_t offset = 0;
    bool ended = false;

    std::string_view next() {
        if (ended) {
            return {};
        }
        while (offset < text.size()) {
            const char c = text[offset];
            if (c == '\0') {
                corrupt("the OBJ contains a NUL byte");
            }
            if (c == '\\' && offset + 1 < text.size()) {
                if (text[offset + 1] == '\n') {
                    offset += 2;
                    continue;
                }
                if (text[offset + 1] == '\r' && offset + 2 < text.size() &&
                    text[offset + 2] == '\n') {
                    offset += 3;
                    continue;
                }
            }
            if (c == '\n') {
                ++offset;
                ended = true;
                return {};
            }
            if (c == ' ' || c == '\t' || c == '\r') {
                ++offset;
                continue;
            }
            if (c == '#') {
                while (offset < text.size() && text[offset] != '\n') {
                    if (text[offset++] == '\0') {
                        corrupt("the OBJ contains a NUL byte");
                    }
                }
                continue;
            }
            const auto start = offset;
            while (offset < text.size()) {
                const char value = text[offset];
                if (value == '\0') {
                    corrupt("the OBJ contains a NUL byte");
                }
                if (value == ' ' || value == '\t' || value == '\r' || value == '\n' ||
                    value == '#' || value == '\\') {
                    break;
                }
                ++offset;
            }
            if (start == offset) {
                ++offset;
            }
            return text.substr(start, offset - start);
        }
        ended = true;
        return {};
    }
};

float number(std::string_view field) {
    if (field.starts_with('+')) {
        field.remove_prefix(1);
        if (field.starts_with('-') || field.starts_with('+')) {
            corrupt("an OBJ number is invalid");
        }
    }
    if (field.empty()) {
        corrupt("an OBJ statement has too few numbers");
    }
    float value = 0;
    const auto parsed = std::from_chars(field.data(), field.data() + field.size(), value);
    if (parsed.ec != std::errc{} || parsed.ptr != field.data() + field.size() ||
        !std::isfinite(value)) {
        corrupt("an OBJ number is invalid or not finite");
    }
    return value;
}

std::size_t index(std::string_view field, std::size_t count) {
    if (field.starts_with('+')) {
        field.remove_prefix(1);
        if (field.starts_with('-') || field.starts_with('+')) {
            corrupt("an OBJ index is invalid");
        }
    }
    if (field.empty()) {
        corrupt("an OBJ index is missing");
    }
    std::int64_t value = 0;
    const auto parsed = std::from_chars(field.data(), field.data() + field.size(), value);
    if (parsed.ec != std::errc{} || parsed.ptr != field.data() + field.size() || value == 0) {
        corrupt("an OBJ index is invalid");
    }
    const auto magnitude = value < 0 ? static_cast<std::uint64_t>(-(value + 1)) + 1
                                     : static_cast<std::uint64_t>(value);
    if (magnitude > count) {
        corrupt("an OBJ index is out of range");
    }
    return value < 0 ? count - magnitude : magnitude - 1;
}

constexpr auto ABSENT = std::numeric_limits<std::size_t>::max();
using Vertex = std::array<std::size_t, 3>;

struct VertexHash {
    std::size_t operator()(const Vertex &vertex) const noexcept {
        std::size_t hash = 0;
        for (const auto value : vertex) {
            hash ^= std::hash<std::size_t>{}(value) + (hash << 6) + (hash >> 2);
        }
        return hash;
    }
};

struct Parser {
    std::vector<std::array<float, 3>> positions;
    std::vector<std::array<float, 2>> uvs;
    std::vector<std::array<float, 3>> normals;
    std::unordered_map<Vertex, std::uint32_t, VertexHash> vertices;
    PrimitiveGeometry part;
    std::uint64_t triangles = 0;
    bool all_uvs = true;
    bool all_normals = true;
    bool recognized = false;

    Vertex vertex(std::string_view field) const {
        Vertex result{ABSENT, ABSENT, ABSENT};
        const auto slash = field.find('/');
        result[0] = index(field.substr(0, slash), positions.size());
        if (slash == std::string_view::npos) {
            return result;
        }
        field.remove_prefix(slash + 1);
        const auto second = field.find('/');
        if (second == std::string_view::npos) {
            result[1] = index(field, uvs.size());
            return result;
        }
        if (second != 0) {
            result[1] = index(field.substr(0, second), uvs.size());
        }
        result[2] = index(field.substr(second + 1), normals.size());
        return result;
    }

    std::uint32_t merge(const Vertex &vertex) {
        if (const auto found = vertices.find(vertex); found != vertices.end()) {
            return found->second;
        }
        if (vertices.size() > std::numeric_limits<std::uint32_t>::max()) {
            throw Failure{LoadError::limit_exceeded, "too many OBJ vertices"};
        }
        const auto output = static_cast<std::uint32_t>(vertices.size());
        vertices.emplace(vertex, output);
        const auto &position = positions[vertex[0]];
        part.positions.insert(part.positions.end(), position.begin(), position.end());
        if (vertex[1] == ABSENT) {
            all_uvs = false;
            part.uvs.clear();
        } else if (all_uvs) {
            const auto &uv = uvs[vertex[1]];
            part.uvs.insert(part.uvs.end(), uv.begin(), uv.end());
        }
        if (vertex[2] == ABSENT) {
            all_normals = false;
            part.normals.clear();
        } else if (all_normals) {
            const auto &normal = normals[vertex[2]];
            part.normals.insert(part.normals.end(), normal.begin(), normal.end());
        }
        return output;
    }

    void face(Fields &fields, const LoadLimits &limits) {
        const auto first_field = fields.next();
        if (first_field.empty()) {
            return;
        }
        const auto first = vertex(first_field);
        const auto second_field = fields.next();
        if (second_field.empty()) {
            return;
        }
        auto previous = vertex(second_field);
        for (auto field = fields.next(); !field.empty(); field = fields.next()) {
            if (triangles >= limits.max_triangles) {
                throw Failure{LoadError::limit_exceeded, "the OBJ exceeds the triangle limit"};
            }
            const auto current = vertex(field);
            const auto a = merge(first);
            const auto b = merge(previous);
            const auto c = merge(current);
            part.triangles.insert(part.triangles.end(), {a, b, c});
            ++triangles;
            previous = current;
        }
    }

    GeometryResult parse(std::string_view text, const LoadLimits &limits) {
        if (text.starts_with("\xEF\xBB\xBF")) {
            text.remove_prefix(3);
        }
        Fields fields{text};
        while (fields.offset < text.size()) {
            fields.ended = false;
            const auto keyword = fields.next();
            if (keyword == "v" || keyword == "vn") {
                std::array<float, 3> values{};
                for (auto &value : values) {
                    value = number(fields.next());
                }
                if (keyword == "v") {
                    positions.push_back(values);
                    recognized = true;
                } else {
                    normals.push_back(values);
                }
            } else if (keyword == "vt") {
                std::array<float, 2> values{number(fields.next()), 0};
                const auto v = fields.next();
                if (!v.empty()) {
                    values[1] = number(v);
                    const auto w = fields.next();
                    if (!w.empty()) {
                        number(w);
                    }
                }
                uvs.push_back(values);
            } else if (keyword == "f") {
                recognized = true;
                face(fields, limits);
            }
            while (!fields.next().empty()) {
            }
        }
        if (!recognized) {
            corrupt("the text has no OBJ position or face statement");
        }
        GeometryResult result;
        if (triangles != 0) {
            result.stats = {1, 1, triangles};
            result.geometry.primitives.push_back(std::move(part));
            result.geometry.instances.push_back(
                {0, {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}});
        }
        return result;
    }
};

GeometryResult failure(LoadError error, const char *message) {
    GeometryResult result;
    result.error = error;
    result.message = message;
    return result;
}

}

GeometryResult load_obj_geometry(std::span<const std::uint8_t> bytes, const LoadLimits &limits) {
    try {
        if (bytes.size() > limits.max_file_bytes) {
            return failure(LoadError::limit_exceeded, "the OBJ exceeds the size limit");
        }
        if (bytes.size() >= 4 && std::memcmp(bytes.data(), "glTF", 4) == 0) {
            return failure(LoadError::unsupported_format, "GLB bytes are not an OBJ");
        }
        if (bytes.empty()) {
            return failure(LoadError::corrupt_file, "the OBJ is empty");
        }
        Parser parser;
        return parser.parse({reinterpret_cast<const char *>(bytes.data()), bytes.size()}, limits);
    } catch (const Failure &error) {
        return failure(error.error, error.message);
    } catch (const std::bad_alloc &) {
        return failure(LoadError::limit_exceeded, "out of memory");
    } catch (const std::length_error &) {
        return failure(LoadError::limit_exceeded, "the OBJ exceeds the memory limit");
    }
}

LoadResult load_obj(std::span<const std::uint8_t> bytes, const LoadLimits &limits) {
    auto geometry = load_obj_geometry(bytes, limits);
    LoadResult result;
    result.error = geometry.error;
    result.message = std::move(geometry.message);
    result.stats = geometry.stats;
    return result;
}

}
