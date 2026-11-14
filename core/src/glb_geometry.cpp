#include "lint_asset/glb_geometry.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <new>
#include <stdexcept>
#include <utility>

#include "glb_parse.hpp"
#include "lint_asset/uri_inspection.hpp"

namespace lint_asset {
namespace {
constexpr std::size_t MAX_NODE_DEPTH = 256;
constexpr std::size_t MAX_INSTANCES = 100000;
constexpr std::size_t MAX_VISITED_NODES = 1000000;
using Matrix = std::array<double, 16>;
constexpr Matrix IDENTITY = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

struct Failure {
    LoadError error;
    const char *message;
};

void corrupt(const char *message) { throw Failure{LoadError::corrupt_file, message}; }

std::uint64_t add(std::uint64_t a, std::uint64_t b) {
    if (b > std::numeric_limits<std::uint64_t>::max() - a) {
        corrupt("accessor offset overflow");
    }
    return a + b;
}

std::uint64_t multiply(std::uint64_t a, std::uint64_t b) {
    if (b != 0 && a > std::numeric_limits<std::uint64_t>::max() / b) {
        corrupt("accessor size overflow");
    }
    return a * b;
}

bool valid_index(std::int32_t index, std::uint32_t count) {
    return index >= 0 && static_cast<std::uint32_t>(index) < count;
}

std::int32_t attribute(const tg3_primitive &primitive, std::string_view name) {
    for (std::uint32_t i = 0; i < primitive.attributes_count; ++i) {
        const auto &item = primitive.attributes[i];
        if (std::string_view(item.key.data, item.key.len) == name) {
            return item.value;
        }
    }
    return -1;
}

struct Accessor {
    const tg3_accessor &source;
    const std::uint8_t *data;
    std::uint64_t stride;
    std::uint64_t width;
    std::uint64_t components;

    Accessor(const tg3_model &model, std::int32_t index, std::uint64_t component_count)
        : source(get(model, index)), data(nullptr), stride(0), width(0),
          components(component_count) {
        const bool indices = components == 1;
        if (source.sparse.is_sparse) {
            throw Failure{LoadError::unsupported_format, "sparse accessors are not supported"};
        }
        if (source.buffer_view < 0) {
            throw Failure{LoadError::unsupported_format,
                          "accessors without a buffer view are not supported"};
        }
        if (source.type != (indices           ? TG3_TYPE_SCALAR
                            : components == 2 ? TG3_TYPE_VEC2
                                              : TG3_TYPE_VEC3)) {
            corrupt("the accessor has an invalid type");
        }
        switch (source.component_type) {
        case 5120:
        case 5121:
            width = 1;
            break;
        case 5122:
        case 5123:
            width = 2;
            break;
        case 5125:
        case 5126:
            width = 4;
            break;
        default:
            corrupt("the accessor has an invalid component type");
        }
        if (indices && source.component_type != 5121 && source.component_type != 5123 &&
            source.component_type != 5125) {
            corrupt("the index accessor has an invalid component type");
        }
        if (!valid_index(source.buffer_view, model.buffer_views_count)) {
            corrupt("the accessor buffer view is invalid");
        }
        const auto &view = model.buffer_views[source.buffer_view];
        if (!valid_index(view.buffer, model.buffers_count)) {
            corrupt("the buffer view buffer is invalid");
        }
        const auto &buffer = model.buffers[view.buffer];
        const auto element_size = width * components;
        stride = view.byte_stride ? view.byte_stride : element_size;
        if (stride < element_size) {
            corrupt("the accessor stride is smaller than its element");
        }
        const auto length =
            source.count == 0 ? 0 : add(multiply(source.count - 1, stride), element_size);
        const auto end = add(source.byte_offset, length);
        if (end > view.byte_length || add(view.byte_offset, end) > buffer.data.count ||
            add(view.byte_offset, view.byte_length) > buffer.data.count) {
            corrupt("the accessor is outside its buffer or buffer view");
        }
        if (length != 0 && buffer.data.data == nullptr) {
            corrupt("the accessor buffer has no data");
        }
        if (buffer.data.data != nullptr) {
            data = buffer.data.data + add(view.byte_offset, source.byte_offset);
        }
    }

    static const tg3_accessor &get(const tg3_model &model, std::int32_t index) {
        if (!valid_index(index, model.accessors_count)) {
            corrupt("the accessor index is invalid");
        }
        return model.accessors[index];
    }

    template <typename T> static double read(const std::uint8_t *address) {
        T value;
        std::memcpy(&value, address, sizeof(value));
        return value;
    }

    double value(std::uint64_t element, std::uint64_t component = 0, bool normalize = true) const {
        const auto *address = data + element * stride + component * width;
        double result = 0;
        double divisor = 1;
        switch (source.component_type) {
        case 5120:
            result = read<std::int8_t>(address);
            divisor = 127;
            break;
        case 5121:
            result = read<std::uint8_t>(address);
            divisor = 255;
            break;
        case 5122:
            result = read<std::int16_t>(address);
            divisor = 32767;
            break;
        case 5123:
            result = read<std::uint16_t>(address);
            divisor = 65535;
            break;
        case 5125:
            result = read<std::uint32_t>(address);
            break;
        case 5126:
            result = read<float>(address);
            break;
        }
        return normalize && source.normalized && divisor != 1 ? std::max(-1.0, result / divisor)
                                                              : result;
    }

    std::vector<float> vectors() const {
        std::vector<float> out;
        const auto size = multiply(source.count, components);
        if (size > out.max_size()) {
            throw Failure{LoadError::limit_exceeded, "vertex data exceeds the memory limit"};
        }
        out.resize(static_cast<std::size_t>(size));
        for (std::uint64_t i = 0; i < source.count; ++i) {
            for (std::uint64_t j = 0; j < components; ++j) {
                out[i * components + j] = static_cast<float>(value(i, j));
            }
        }
        return out;
    }
};

Matrix multiply_matrix(const Matrix &a, const Matrix &b) {
    Matrix result{};
    for (std::size_t col = 0; col < 4; ++col) {
        for (std::size_t row = 0; row < 4; ++row) {
            for (std::size_t k = 0; k < 4; ++k) {
                result[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
            }
        }
    }
    return result;
}

Matrix local_matrix(const tg3_node &node) {
    Matrix result;
    if (node.has_matrix) {
        std::copy_n(node.matrix, result.size(), result.begin());
        return result;
    }
    const auto &q = node.rotation;
    const double norm = std::hypot(std::hypot(q[0], q[1]), std::hypot(q[2], q[3]));
    if (!(norm > 0) || !std::isfinite(norm)) {
        corrupt("the node rotation quaternion is invalid");
    }
    const double x = q[0] / norm, y = q[1] / norm, z = q[2] / norm, w = q[3] / norm;
    result = {1 - 2 * (y * y + z * z), 2 * (x * y + z * w),     2 * (x * z - y * w),     0,
              2 * (x * y - z * w),     1 - 2 * (x * x + z * z), 2 * (y * z + x * w),     0,
              2 * (x * z + y * w),     2 * (y * z - x * w),     1 - 2 * (x * x + y * y), 0,
              node.translation[0],     node.translation[1],     node.translation[2],     1};
    for (std::size_t col = 0; col < 3; ++col) {
        for (std::size_t row = 0; row < 3; ++row) {
            result[col * 4 + row] *= node.scale[col];
        }
    }
    return result;
}

void extract_parts(const tg3_model &model, Geometry &geometry) {
    for (std::uint32_t m = 0; m < model.meshes_count; ++m) {
        const auto &mesh = model.meshes[m];
        for (std::uint32_t p = 0; p < mesh.primitives_count; ++p) {
            const auto &primitive = mesh.primitives[p];
            const auto mode = primitive.mode < 0 ? TG3_MODE_TRIANGLES : primitive.mode;
            const auto count = detail::element_count(model, primitive);
            const auto triangles = detail::triangle_count(mode, count);
            const auto position = attribute(primitive, "POSITION");
            if (position < 0 || triangles == 0) {
                continue;
            }
            Accessor vertices(model, position, 3);
            PrimitiveGeometry part;
            part.mesh = m;
            part.primitive = p;
            part.positions = vertices.vectors();
            const auto normal = attribute(primitive, "NORMAL");
            if (normal >= 0) {
                Accessor normals(model, normal, 3);
                if (normals.source.count != vertices.source.count) {
                    corrupt("the normal count differs from the position count");
                }
                part.normals = normals.vectors();
            }
            const auto uv = attribute(primitive, "TEXCOORD_0");
            if (uv >= 0) {
                Accessor uvs(model, uv, 2);
                if (uvs.source.count != vertices.source.count) {
                    corrupt("the UV count differs from the position count");
                }
                part.uvs = uvs.vectors();
            }
            std::vector<std::uint32_t> indices;
            if (primitive.indices >= 0) {
                Accessor source(model, primitive.indices, 1);
                if (count > indices.max_size()) {
                    throw Failure{LoadError::limit_exceeded, "index data exceeds the memory limit"};
                }
                indices.reserve(static_cast<std::size_t>(count));
                for (std::uint64_t i = 0; i < count; ++i) {
                    const auto index = static_cast<std::uint32_t>(source.value(i, 0, false));
                    if (index >= vertices.source.count) {
                        corrupt("a vertex index is outside the vertex data");
                    }
                    indices.push_back(index);
                }
            } else if (count > std::numeric_limits<std::uint32_t>::max()) {
                throw Failure{LoadError::limit_exceeded, "vertex count exceeds the index limit"};
            }
            const auto index_at = [&](std::uint64_t i) {
                return primitive.indices >= 0 ? indices[i] : static_cast<std::uint32_t>(i);
            };
            const auto size = multiply(triangles, 3);
            if (size > part.triangles.max_size()) {
                throw Failure{LoadError::limit_exceeded, "triangle data exceeds the memory limit"};
            }
            part.triangles.reserve(static_cast<std::size_t>(size));
            for (std::uint64_t t = 0; t < triangles; ++t) {
                std::uint64_t a = t * 3, b = a + 1, c = a + 2;
                if (mode == TG3_MODE_TRIANGLE_STRIP) {
                    a = t + t % 2;
                    b = t + 1 - t % 2;
                    c = t + 2;
                } else if (mode == TG3_MODE_TRIANGLE_FAN) {
                    a = 0;
                    b = t + 1;
                    c = t + 2;
                }
                part.triangles.insert(part.triangles.end(),
                                      {index_at(a), index_at(b), index_at(c)});
            }
            geometry.primitives.push_back(std::move(part));
        }
    }
}

void extract_instances(const tg3_model &model, Geometry &geometry) {
    std::size_t visited = 0;
    const auto visit = [&](auto &&self, std::int32_t index, const Matrix &parent,
                           std::size_t depth) -> void {
        if (depth > MAX_NODE_DEPTH) {
            corrupt("the node hierarchy is cyclic or too deep");
        }
        if (++visited > MAX_VISITED_NODES) {
            throw Failure{LoadError::limit_exceeded, "the node visit limit was exceeded"};
        }
        if (!valid_index(index, model.nodes_count)) {
            corrupt("the node index is invalid");
        }
        const auto &node = model.nodes[index];
        const auto world = multiply_matrix(parent, local_matrix(node));
        if (node.mesh >= 0) {
            if (!valid_index(node.mesh, model.meshes_count)) {
                corrupt("the node mesh index is invalid");
            }
            if (geometry.instances.size() >= MAX_INSTANCES) {
                throw Failure{LoadError::limit_exceeded, "the mesh instance limit was exceeded"};
            }
            MeshInstance instance;
            instance.mesh = static_cast<std::uint32_t>(node.mesh);
            std::transform(world.begin(), world.end(), instance.world.begin(),
                           [](double value) { return static_cast<float>(value); });
            geometry.instances.push_back(instance);
        }
        for (std::uint32_t i = 0; i < node.children_count; ++i) {
            self(self, node.children[i], world, depth + 1);
        }
    };
    if (model.default_scene >= 0 || model.scenes_count > 0) {
        const auto scene = model.default_scene >= 0 ? model.default_scene : 0;
        if (!valid_index(scene, model.scenes_count)) {
            corrupt("the default scene index is invalid");
        }
        const auto &roots = model.scenes[scene];
        for (std::uint32_t i = 0; i < roots.nodes_count; ++i) {
            visit(visit, roots.nodes[i], IDENTITY, 1);
        }
    } else {
        std::vector<bool> child(model.nodes_count, false);
        for (std::uint32_t n = 0; n < model.nodes_count; ++n) {
            const auto &node = model.nodes[n];
            for (std::uint32_t i = 0; i < node.children_count; ++i) {
                if (!valid_index(node.children[i], model.nodes_count)) {
                    corrupt("the child node index is invalid");
                }
                child[node.children[i]] = true;
            }
        }
        for (std::uint32_t n = 0; n < model.nodes_count; ++n) {
            if (!child[n]) {
                visit(visit, static_cast<std::int32_t>(n), IDENTITY, 1);
            }
        }
    }
}
}  // namespace

GeometryResult detail::extract_geometry(const tg3_model &model, const LoadResult &counted,
                                        bool split) {
    GeometryResult result;
    try {
        if (!counted.ok()) {
            result.error = counted.error;
            result.message = counted.message;
            result.missing_files = counted.missing_files;
            return result;
        }
        for (std::uint32_t i = 0; i < model.images_count; ++i) {
            const auto &uri = model.images[i].uri;
            const auto kind = classify_uri(uri.len == 0 ? std::string_view{}
                                                        : std::string_view(uri.data, uri.len));
            if (kind == UriKind::embedded || (split && kind != UriKind::web_address)) {
                continue;
            }
            auto &count = kind == UriKind::web_address
                              ? result.geometry.external_images.web_addresses
                              : result.geometry.external_images.other;
            if (count < std::numeric_limits<std::uint32_t>::max()) {
                ++count;
            }
        }
        extract_parts(model, result.geometry);
        extract_instances(model, result.geometry);
        result.stats = counted.stats;
        return result;
    } catch (const Failure &failure) {
        result = GeometryResult{};
        result.error = failure.error;
        result.message = failure.message;
    } catch (const std::bad_alloc &) {
        result = GeometryResult{};
        result.error = LoadError::limit_exceeded;
        result.message = "out of memory";
    } catch (const std::length_error &) {
        result = GeometryResult{};
        result.error = LoadError::limit_exceeded;
        result.message = "geometry exceeds the memory limit";
    }
    return result;
}

GeometryResult load_glb_geometry(std::span<const std::uint8_t> bytes, const LoadLimits &limits) {
    try {
        detail::ParsedModel parsed;
        const auto counted = detail::parse_glb(parsed, bytes, limits);
        return detail::extract_geometry(parsed.model, counted, false);
    } catch (const std::bad_alloc &) {
        GeometryResult result;
        result.error = LoadError::limit_exceeded;
        result.message = "out of memory";
        return result;
    }
}
}  // namespace lint_asset
