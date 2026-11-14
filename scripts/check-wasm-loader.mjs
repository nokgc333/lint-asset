// Runs the built WASM module in Node.js and checks loadGlb() against the same fixtures and
// expected values as the native tests (tests/glb_loader_test.cpp).
//
// Usage: node scripts/check-wasm-loader.mjs <module dir> <fixture dir> [golden dir]
// The fixtures are written by tests/tools/make_test_glbs.py.
// The module must be built with -DLINT_ASSET_WASM_NODE=ON.

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [moduleDir, fixtureDir, goldenDir] = process.argv.slice(2);
if (!moduleDir || !fixtureDir) {
  console.error("usage: check-wasm-loader.mjs <module dir> <fixture dir> [golden dir]");
  process.exit(2);
}

const MIB = 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 100 * MIB;
const DEFAULT_MAX_TRIANGLES = 2_000_000;
const INSPECTION_THRESHOLDS = { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 };

const { default: createLintCore } = await import(
  pathToFileURL(resolve(moduleDir, "lint_core.mjs")).href
);
const core = await createLintCore();

async function fixture(name) {
  return new Uint8Array(await readFile(join(fixtureDir, name)));
}

let failures = 0;
function expect(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "ok  " : "FAIL"} ${label}`);
  if (!same) {
    console.log(`     expected ${JSON.stringify(expected)}`);
    console.log(`     actual   ${JSON.stringify(actual)}`);
    failures += 1;
  }
}

function load(bytes, maxFileBytes = DEFAULT_MAX_FILE_BYTES, maxTriangles = DEFAULT_MAX_TRIANGLES) {
  const { ok, code, meshes, primitives, triangles } = core.loadGlb(
    bytes,
    maxFileBytes,
    maxTriangles,
  );
  return { ok, code, meshes, primitives, triangles };
}

const counts = (meshes, primitives, triangles) => ({
  ok: true,
  code: "",
  meshes,
  primitives,
  triangles,
});
const failure = (code) => ({ ok: false, code, meshes: 0, primitives: 0, triangles: 0 });

const cube = await fixture("cube.glb");

expect("cube", load(cube), counts(1, 1, 12));
expect("cube_open_top", load(await fixture("cube_open_top.glb")), counts(1, 1, 10));
expect("three_pages", load(await fixture("three_pages.glb")), counts(1, 1, 3));
expect("primitive_modes", load(await fixture("primitive_modes.glb")), counts(2, 4, 6));
expect(
  "text glTF",
  load(new TextEncoder().encode('{"asset":{"version":"2.0"}}')),
  failure("E-LOAD-001"),
);
expect("empty input", load(new Uint8Array(0)), failure("E-LOAD-001"));
expect("truncated", load(await fixture("truncated_cube.glb")), failure("E-LOAD-002"));
expect("byte limit", load(cube, cube.length - 1), failure("E-LOAD-003"));
expect("triangle limit", load(cube, DEFAULT_MAX_FILE_BYTES, 11), failure("E-LOAD-003"));
expect("huge count", load(await fixture("huge_accessor_count.glb")), failure("E-LOAD-003"));
expect("required Draco", load(await fixture("required_draco.glb")), failure("E-LOAD-004"));
expect("negative limit is clamped", load(cube, -1, DEFAULT_MAX_TRIANGLES), failure("E-LOAD-003"));
expect(
  "NaN limit is clamped",
  load(cube, DEFAULT_MAX_FILE_BYTES, Number.NaN),
  failure("E-LOAD-003"),
);

const failed = core.loadGlb(
  await fixture("truncated_cube.glb"),
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_TRIANGLES,
);
expect("a failure carries a reason", failed.message.length > 0, true);

function geometry(
  bytes,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  maxTriangles = DEFAULT_MAX_TRIANGLES,
) {
  return core.loadGlbGeometry(bytes, maxFileBytes, maxTriangles);
}

function inspect(
  bytes,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  maxTriangles = DEFAULT_MAX_TRIANGLES,
) {
  return core.inspect(bytes, maxFileBytes, maxTriangles);
}

for (const name of ["cube.glb", "cube_open_top.glb", "primitive_modes.glb"]) {
  const bytes = await fixture(name);
  const analyzed = core.analyze(bytes, DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_TRIANGLES);
  const extracted = geometry(bytes);
  expect(`analysis ${name} succeeds`, analyzed.ok, true);
  expect(`analysis ${name} thresholds`, analyzed.thresholds, INSPECTION_THRESHOLDS);
  expect(`analysis ${name} issues`, analyzed.issues, inspect(bytes).issues);
  expect(`analysis ${name} part count`, analyzed.parts.length, extracted.parts.length);
  expect(`analysis ${name} instance count`, analyzed.instances.length, extracted.instances.length);
  expect(
    `analysis ${name} parts`,
    analyzed.parts.map(({ mesh, primitive, positions, normals, triangles }) => ({
      mesh,
      primitive,
      positions: Array.from(positions),
      normals: Array.from(normals),
      triangles: Array.from(triangles),
    })),
    extracted.parts.map(({ mesh, primitive, positions, normals, triangles }) => ({
      mesh,
      primitive,
      positions: Array.from(positions),
      normals: Array.from(normals),
      triangles: Array.from(triangles),
    })),
  );
  expect(
    `analysis ${name} instances`,
    analyzed.instances.map(({ mesh, world }) => ({ mesh, world: Array.from(world) })),
    extracted.instances.map(({ mesh, world }) => ({ mesh, world: Array.from(world) })),
  );
}

const truncatedAnalysis = core.analyze(
  await fixture("truncated_cube.glb"),
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_TRIANGLES,
);
expect("analysis truncated file", truncatedAnalysis.ok, false);
expect("analysis failure thresholds", truncatedAnalysis.thresholds, INSPECTION_THRESHOLDS);
expect("analysis failure has no parts", truncatedAnalysis.parts, []);
expect("analysis failure has no instances", truncatedAnalysis.instances, []);
expect("analysis failure has no issues", truncatedAnalysis.issues, []);

const truncatedInspection = inspect(await fixture("truncated_cube.glb"));
expect("inspection truncated file", truncatedInspection.ok, false);
expect("inspection failure has no issues", truncatedInspection.issues, []);

if (goldenDir) {
  for (const name of (await readdir(goldenDir)).filter((name) => name.endsWith(".json")).sort()) {
    const expected = JSON.parse(await readFile(join(goldenDir, name), "utf8"));
    const result = inspect(await fixture(`${name.slice(0, -5)}.glb`));
    expect(`inspection ${name} succeeds`, result.ok, true);
    expect(`inspection ${name} golden issues`, result.issues, expected);
  }
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const extractedCube = geometry(cube);
expect("geometry cube succeeds", extractedCube.ok, true);
expect(
  "geometry cube counts",
  [extractedCube.meshes, extractedCube.primitives, extractedCube.triangles],
  [1, 1, 12],
);
expect("geometry cube parts", extractedCube.parts.length, 1);
const part = extractedCube.parts[0];
expect("geometry cube identifiers", [part.mesh, part.primitive], [0, 0]);
expect("geometry cube vertices", part.positions.length, 8 * 3);
expect("geometry cube normals", part.normals.length, 8 * 3);
expect("geometry cube triangles", part.triangles.length, 12 * 3);
expect("geometry cube first triangle", Array.from(part.triangles.slice(0, 3)), [0, 2, 1]);
expect("geometry cube instances", extractedCube.instances.length, 1);
expect("geometry cube instance mesh", extractedCube.instances[0].mesh, 0);
expect("geometry cube identity", Array.from(extractedCube.instances[0].world), identity);
expect(
  "geometry array types",
  [
    part.positions instanceof Float32Array,
    part.normals instanceof Float32Array,
    part.triangles instanceof Uint32Array,
    extractedCube.instances[0].world instanceof Float32Array,
  ],
  [true, true, true, true],
);

const snapshots = [
  Array.from(part.positions),
  Array.from(part.normals),
  Array.from(part.triangles),
  Array.from(extractedCube.instances[0].world),
];
const modes = geometry(await fixture("primitive_modes.glb"));
expect("geometry primitive count remains a count", modes.primitives, 4);
expect(
  "geometry modes identifiers",
  modes.parts.map(({ mesh, primitive }) => [mesh, primitive]),
  [
    [0, 0],
    [0, 1],
    [1, 0],
  ],
);
expect(
  "geometry modes triangles",
  modes.parts.map((item) => Array.from(item.triangles)),
  [
    [0, 1, 2],
    [0, 1, 2, 2, 1, 3],
    [0, 1, 2, 0, 2, 3, 0, 3, 4],
  ],
);
expect(
  "geometry absent normals",
  modes.parts.map((item) => item.normals.length),
  [0, 0, 0],
);
const transforms = geometry(await fixture("node_transforms.glb"));
expect("geometry shared mesh stored once", transforms.parts.length, 1);
expect(
  "geometry transformed instances",
  transforms.instances.map(({ world }) => Array.from(world)),
  [
    [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 10, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5, 0, 1],
  ],
);
const quantized = geometry(await fixture("quantized_strided.glb"));
expect(
  "geometry quantized positions",
  Array.from(quantized.parts[0].positions),
  [0, 0, 0, 100, 0, 0, 0, 200, 0],
);
expect(
  "geometry quantized normals",
  Array.from(quantized.parts[0].normals),
  [1, 0, 0, -1, 0, 0, 0, 0, 1],
);

function geometryFailure(label, result, code) {
  expect(
    label,
    {
      ok: result.ok,
      code: result.code,
      meshes: result.meshes,
      primitives: result.primitives,
      triangles: result.triangles,
      parts: result.parts,
      instances: result.instances,
    },
    { ...failure(code), parts: [], instances: [] },
  );
  expect(`${label} reason`, result.message.length > 0, true);
}
for (const [name, code] of [
  ["index_out_of_vertex_range", "E-LOAD-002"],
  ["sparse_accessor", "E-LOAD-001"],
  ["node_cycle", "E-LOAD-002"],
  ["node_instance_explosion", "E-LOAD-003"],
  ["truncated_cube", "E-LOAD-002"],
  ["required_draco", "E-LOAD-004"],
]) {
  geometryFailure(`geometry ${name}`, geometry(await fixture(`${name}.glb`)), code);
}
geometryFailure(
  "geometry text glTF",
  geometry(new TextEncoder().encode('{"asset":{"version":"2.0"}}')),
  "E-LOAD-001",
);
geometryFailure("geometry byte limit", geometry(cube, cube.length - 1), "E-LOAD-003");
geometryFailure(
  "geometry triangle limit",
  geometry(cube, DEFAULT_MAX_FILE_BYTES, 11),
  "E-LOAD-003",
);
geometryFailure("geometry negative limit", geometry(cube, -1), "E-LOAD-003");
geometryFailure(
  "geometry NaN limit",
  geometry(cube, DEFAULT_MAX_FILE_BYTES, Number.NaN),
  "E-LOAD-003",
);

const secondCube = geometry(cube);
expect(
  "geometry copies survive subsequent calls",
  [
    Array.from(part.positions),
    Array.from(part.normals),
    Array.from(part.triangles),
    Array.from(extractedCube.instances[0].world),
  ],
  snapshots,
);
const firstArrays = [
  part.positions,
  part.normals,
  part.triangles,
  extractedCube.instances[0].world,
];
const secondArrays = [
  secondCube.parts[0].positions,
  secondCube.parts[0].normals,
  secondCube.parts[0].triangles,
  secondCube.instances[0].world,
];
expect(
  "geometry calls own separate buffers",
  firstArrays.every((array, index) => array.buffer !== secondArrays[index].buffer),
  true,
);
for (const array of firstArrays) {
  array.fill(42);
}
expect(
  "geometry copies are independently mutable",
  secondArrays.map((array) => Array.from(array)),
  snapshots,
);
const thirdCube = geometry(cube);
expect(
  "geometry mutations leave later loads unchanged",
  [
    Array.from(thirdCube.parts[0].positions),
    Array.from(thirdCube.parts[0].normals),
    Array.from(thirdCube.parts[0].triangles),
    Array.from(thirdCube.instances[0].world),
  ],
  snapshots,
);

// Regression: the module starts with 16 MB of memory. A larger GLB must still load, so the memory
// has to be allowed to grow. The cube's binary chunk is padded with zeros to make a 40 MB file.
function padBinaryChunk(glb, extraBytes) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const binStart = 20 + jsonLength; // the BIN chunk header follows the JSON chunk
  const binLength = view.getUint32(binStart, true);
  const document = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  document.buffers[0].byteLength = binLength + extraBytes;
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const jsonPadded = encoded.length + ((4 - (encoded.length % 4)) % 4);
  const binPadded = binLength + extraBytes; // extraBytes is a multiple of 4
  const out = new Uint8Array(12 + 8 + jsonPadded + 8 + binPadded).fill(0x20, 20, 20 + jsonPadded);
  const header = new DataView(out.buffer);
  out.set(glb.subarray(0, 4)); // magic
  header.setUint32(4, 2, true);
  header.setUint32(8, out.length, true);
  header.setUint32(12, jsonPadded, true);
  header.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(encoded, 20);
  const binHeader = 20 + jsonPadded;
  header.setUint32(binHeader, binPadded, true);
  header.setUint32(binHeader + 4, 0x004e4942, true); // BIN
  out.set(glb.subarray(binStart + 8, binStart + 8 + binLength), binHeader + 8);
  return out;
}

const MIB_40 = 40 * MIB;
const large = padBinaryChunk(cube, MIB_40);
expect("a 40 MB file is larger than the initial memory", large.length > 16 * MIB, true);
expect("a 40 MB GLB loads", load(large), counts(1, 1, 12));
const largeGeometry = geometry(large);
expect("a 40 MB GLB gives its geometry", [largeGeometry.ok, largeGeometry.parts.length], [true, 1]);

// TC-007: the normal map conversion (FR-008) gives the same results as the native tests.
const MAX_TEXTURE_PIXELS = 8192 * 8192;
const flipped = Uint8Array.from([10, 0, 30, 255, 40, 255, 60, 255, 70, 128, 90, 200, 1, 127, 3, 0]);
const flipResult = core.flipNormalMapGreen(flipped, 2, 2, MAX_TEXTURE_PIXELS);
expect("a flip reports success and the translucent count", flipResult, {
  ok: true,
  code: "",
  message: "",
  translucent_pixels: 2,
});
expect(
  "a flip inverts only the green bytes",
  [...flipped],
  [10, 255, 30, 255, 40, 0, 60, 255, 70, 127, 90, 200, 1, 128, 3, 0],
);

// A deterministic pseudo-random image (xorshift), so a failure can be reproduced.
function pseudoRandomPixels(width, height, seed) {
  const pixels = new Uint8Array(width * height * 4);
  let state = seed >>> 0;
  for (let i = 0; i < pixels.length; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    pixels[i] = state & 255;
  }
  return pixels;
}

const original = pseudoRandomPixels(257, 129, 2463534242);
const roundTrip = original.slice();
core.flipNormalMapGreen(roundTrip, 257, 129, MAX_TEXTURE_PIXELS);
expect(
  "a flip changes the image",
  roundTrip.some((byte, i) => byte !== original[i]),
  true,
);
core.flipNormalMapGreen(roundTrip, 257, 129, MAX_TEXTURE_PIXELS);
expect(
  "a round trip restores every byte",
  roundTrip.every((byte, i) => byte === original[i]),
  true,
);

// getImageData returns a Uint8ClampedArray, so the binding must accept it too.
const clamped = new Uint8ClampedArray([1, 2, 3, 4]);
core.flipNormalMapGreen(clamped, 1, 1, MAX_TEXTURE_PIXELS);
expect("a clamped array is flipped in place", [...clamped], [1, 253, 3, 4]);

const untouched = Uint8Array.from([1, 2, 3, 4, 5]);
expect(
  "a wrong buffer length is E-TEX-001",
  core.flipNormalMapGreen(untouched, 1, 1, MAX_TEXTURE_PIXELS),
  {
    ok: false,
    code: "E-TEX-001",
    message: core.flipNormalMapGreen(untouched, 1, 1, MAX_TEXTURE_PIXELS).message,
    translucent_pixels: 0,
  },
);
expect("a failed flip leaves the array as it was", [...untouched], [1, 2, 3, 4, 5]);
expect(
  "over the pixel limit is E-TEX-003",
  core.flipNormalMapGreen(new Uint8Array(16), 2, 2, 3).code,
  "E-TEX-003",
);
expect(
  "a size above 32 bits is over the limit, not wrapped to zero",
  core.flipNormalMapGreen(new Uint8Array(16), 2 ** 32, 2 ** 32, MAX_TEXTURE_PIXELS).code,
  "E-TEX-003",
);
expect(
  "a negative or NaN size is E-TEX-001",
  [-1, Number.NaN, 0.5].map(
    (bad) => core.flipNormalMapGreen(new Uint8Array(4), bad, 1, MAX_TEXTURE_PIXELS).code,
  ),
  ["E-TEX-001", "E-TEX-001", "E-TEX-001"],
);

// 8192 x 8192 is the largest texture the default limit accepts: 256 MiB of pixels.
const big = new Uint8Array(8192 * 8192 * 4);
for (let i = 1; i < big.length; i += 4096) big[i] = i & 255;
const bigBefore = big.slice(0, 1 << 20);
const started = performance.now();
const bigResult = core.flipNormalMapGreen(big, 8192, 8192, MAX_TEXTURE_PIXELS);
const elapsed = performance.now() - started;
console.log(`info a flip of 8192 x 8192 took ${elapsed.toFixed(0)} ms`);
expect("an 8192 x 8192 texture is flipped", bigResult.ok, true);
expect("the big texture's green bytes are inverted", big[1] === 255 - bigBefore[1], true);

// FR-013: the inspection thresholds can be given to analyze(); without them, or with values that
// cannot be used, the defaults apply and are reported back.
{
  const withThresholds = (bytes, thresholds) =>
    core.analyze(bytes, DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_TRIANGLES, thresholds);
  const rulesOf = (result) => result.issues.map((issue) => issue.rule);
  const small = await fixture("cube_small.glb");
  const cube = await fixture("cube.glb");

  expect(
    "a cube of 0.005 m is too small by default",
    rulesOf(withThresholds(small, undefined)).includes("asset.scale_too_small"),
    true,
  );
  const relaxed = withThresholds(small, {
    max_triangles: 100000,
    min_extent_m: 0.001,
    max_extent_m: 1000,
  });
  expect(
    "a lower minimum size removes the scale warning",
    rulesOf(relaxed).includes("asset.scale_too_small"),
    false,
  );
  expect("the thresholds used are reported back", relaxed.thresholds, {
    max_triangles: 100000,
    min_extent_m: 0.001,
    max_extent_m: 1000,
  });
  const strict = withThresholds(cube, { max_triangles: 5, min_extent_m: 0.01, max_extent_m: 1000 });
  expect(
    "a lower triangle limit adds the triangle-count warning with the limit in the message",
    strict.issues.find((issue) => issue.rule === "asset.triangle_count_exceeded")?.message,
    "The scene draws 12 triangles (limit 5).",
  );
  const exactly = withThresholds(cube, {
    max_triangles: 12,
    min_extent_m: 0.01,
    max_extent_m: 1000,
  });
  expect(
    "exactly the limit is fine",
    rulesOf(exactly).includes("asset.triangle_count_exceeded"),
    false,
  );
  const tiny = withThresholds(cube, { max_triangles: 100000, min_extent_m: 2, max_extent_m: 1000 });
  expect(
    "a larger minimum size adds the too-small warning",
    rulesOf(tiny).includes("asset.scale_too_small"),
    true,
  );
  const narrow = withThresholds(cube, {
    max_triangles: 100000,
    min_extent_m: 0.01,
    max_extent_m: 0.5,
  });
  expect(
    "a smaller maximum size adds the too-large warning",
    rulesOf(narrow).includes("asset.scale_too_large"),
    true,
  );

  for (const [label, bad] of [
    ["a negative triangle limit", { max_triangles: -1, min_extent_m: 0.01, max_extent_m: 1000 }],
    ["a fractional triangle limit", { max_triangles: 1.5, min_extent_m: 0.01, max_extent_m: 1000 }],
    ["a missing field", { max_triangles: 100000, min_extent_m: 0.01 }],
    ["not a number", { max_triangles: 100000, min_extent_m: Number.NaN, max_extent_m: 1000 }],
    [
      "infinity",
      { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: Number.POSITIVE_INFINITY },
    ],
    ["a zero minimum", { max_triangles: 100000, min_extent_m: 0, max_extent_m: 1000 }],
    ["a minimum above the maximum", { max_triangles: 100000, min_extent_m: 10, max_extent_m: 1 }],
    ["a minimum equal to the maximum", { max_triangles: 100000, min_extent_m: 1, max_extent_m: 1 }],
    ["text", { max_triangles: "5", min_extent_m: 0.01, max_extent_m: 1000 }],
    ["null", null],
    ["a number", 5],
  ]) {
    expect(
      `${label} falls back to the defaults`,
      withThresholds(cube, bad).thresholds,
      INSPECTION_THRESHOLDS,
    );
  }
  expect(
    "inspect() also takes thresholds",
    core
      .inspect(cube, DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_TRIANGLES, {
        max_triangles: 5,
        min_extent_m: 0.01,
        max_extent_m: 1000,
      })
      .issues.some((issue) => issue.rule === "asset.triangle_count_exceeded"),
    true,
  );
}

// TC-008: ORM packing and unpacking (FR-009) give the same results as the native tests.
{
  const LIMIT = 8192 * 8192;
  const gray = (values) => Uint8ClampedArray.from(values.flatMap((v) => [v, v, v, 255]));
  const packed = core.packOrm(2, 1, gray([10, 20]), gray([30, 40]), gray([50, 60]), LIMIT);
  expect(
    "packing puts occlusion in red, roughness in green, and metallic in blue",
    [packed.ok, [...packed.pixels]],
    [true, [10, 30, 50, 255, 20, 40, 60, 255]],
  );
  expect(
    "packing reports no non-gray and no translucent pixels for gray opaque inputs",
    [packed.non_gray_pixels, packed.translucent_pixels],
    [[0, 0, 0], 0],
  );

  const partial = core.packOrm(1, 1, undefined, gray([77]), null, LIMIT);
  expect(
    "a missing texture is filled with its default",
    [partial.ok, [...partial.pixels]],
    [true, [255, 77, 0, 255]],
  );
  expect(
    "a Uint8Array input works too",
    [...core.packOrm(1, 1, new Uint8Array([5, 5, 5, 255]), null, null, LIMIT).pixels],
    [5, 255, 0, 255],
  );

  const coloured = Uint8ClampedArray.from([5, 6, 5, 128, 5, 5, 5, 255]);
  const warned = core.packOrm(2, 1, coloured, null, null, LIMIT);
  expect(
    "non-gray and translucent pixels are counted",
    [warned.non_gray_pixels, warned.translucent_pixels],
    [[1, 0, 0], 1],
  );

  const none = core.packOrm(2, 2, null, undefined, null, LIMIT);
  expect("packing with no texture is E-TEX-001", [none.ok, none.code], [false, "E-TEX-001"]);
  const mismatch = core.packOrm(4, 4, gray(new Array(16).fill(1)), gray([1, 2, 3, 4]), null, LIMIT);
  expect(
    "textures of different sizes are E-TEX-002",
    [mismatch.ok, mismatch.code, mismatch.pixels.length],
    [false, "E-TEX-002", 0],
  );
  expect(
    "packing over the limit is E-TEX-003",
    core.packOrm(2, 2, gray([1, 1, 1, 1]), null, null, 3).code,
    "E-TEX-003",
  );
  expect(
    "a size above 32 bits is over the limit",
    core.packOrm(2 ** 32, 2 ** 32, gray([1]), null, null, LIMIT).code,
    "E-TEX-003",
  );
  expect(
    "a bad size is E-TEX-001",
    [-1, Number.NaN, 0.5, 0].map((bad) => core.packOrm(bad, 1, gray([1]), null, null, LIMIT).code),
    ["E-TEX-001", "E-TEX-001", "E-TEX-001", "E-TEX-001"],
  );

  const split = core.unpackOrm(
    Uint8ClampedArray.from([10, 30, 50, 255, 20, 40, 60, 128]),
    2,
    1,
    LIMIT,
  );
  expect(
    "unpacking gives three gray opaque images",
    [
      split.ok,
      [...split.occlusion],
      [...split.roughness],
      [...split.metallic],
      split.translucent_pixels,
    ],
    [
      true,
      [10, 10, 10, 255, 20, 20, 20, 255],
      [30, 30, 30, 255, 40, 40, 40, 255],
      [50, 50, 50, 255, 60, 60, 60, 255],
      1,
    ],
  );
  expect(
    "unpacking a wrong length is E-TEX-001",
    core.unpackOrm(new Uint8Array(15), 2, 2, LIMIT).code,
    "E-TEX-001",
  );
  expect(
    "unpacking over the limit is E-TEX-003",
    core.unpackOrm(new Uint8Array(16), 2, 2, 3).code,
    "E-TEX-003",
  );

  // A round trip with a pseudo-random image (xorshift): pack(unpack(x)) restores red, green, blue.
  let state = 88172645;
  const original = new Uint8ClampedArray(131 * 77 * 4);
  for (let i = 0; i < original.length; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    original[i] = state & 255;
  }
  const unpacked = core.unpackOrm(original, 131, 77, LIMIT);
  const repacked = core.packOrm(
    131,
    77,
    unpacked.occlusion,
    unpacked.roughness,
    unpacked.metallic,
    LIMIT,
  );
  let same = repacked.ok;
  for (let i = 0; i < original.length && same; i += 4)
    same =
      repacked.pixels[i] === original[i] &&
      repacked.pixels[i + 1] === original[i + 1] &&
      repacked.pixels[i + 2] === original[i + 2] &&
      repacked.pixels[i + 3] === 255;
  expect("a round trip restores red, green, and blue exactly", same, true);
}

// FR-014: a split glTF. analyzeGltf() / inspectGltf() take the .gltf bytes and the files the user
// gave with it. Nothing else is ever read.
{
  const json = await fixture("split_cube.gltf");
  const bin = await fixture("split_cube.bin");
  const analyzeGltf = (gltf, files, maxFileBytes = DEFAULT_MAX_FILE_BYTES) =>
    core.analyzeGltf(gltf, files, maxFileBytes, DEFAULT_MAX_TRIANGLES);

  const split = analyzeGltf(json, [{ name: "split_cube.bin", bytes: bin }]);
  expect(
    "split cube loads",
    [split.ok, split.meshes, split.primitives, split.triangles],
    [true, 1, 1, 12],
  );
  const single = core.analyze(cube, DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_TRIANGLES);
  expect("split cube finds what the GLB finds", split.issues, single.issues);
  expect("split cube has the same parts", split.parts.length, single.parts.length);
  expect(
    "split cube has the same positions",
    Array.from(split.parts[0].positions),
    Array.from(single.parts[0].positions),
  );
  const inspected = core.inspectGltf(json, [{ name: "split_cube.bin", bytes: bin }], 1e8, 2e6);
  expect("inspectGltf agrees with analyzeGltf", inspected.issues, split.issues);

  const missing = analyzeGltf(json, []);
  expect(
    "a missing buffer is E-LOAD-005 and names the file",
    [missing.ok, missing.code, missing.missing_files],
    [false, "E-LOAD-005", ["split_cube.bin"]],
  );
  expect(
    "other failures have an empty missing_files",
    analyzeGltf(new Uint8Array(0), []).missing_files,
    [],
  );
  expect(
    "a file with another name does not help",
    analyzeGltf(json, [{ name: "other.bin", bytes: bin }]).code,
    "E-LOAD-005",
  );
  expect(
    "a buffer in a sub folder is found by its path",
    analyzeGltf(await fixture("split_cube_subfolder.gltf"), [
      { name: "buffers/split_cube.bin", bytes: bin },
    ]).ok,
    true,
  );
  expect(
    "a percent-encoded name matches the real file name",
    analyzeGltf(await fixture("split_cube_encoded.gltf"), [{ name: "my cube.bin", bytes: bin }]).ok,
    true,
  );
  expect(
    "an embedded buffer needs no file",
    analyzeGltf(await fixture("embedded_cube.gltf"), []).ok,
    true,
  );
  expect(
    "a web address buffer is E-LOAD-001",
    analyzeGltf(await fixture("split_cube_web_buffer.gltf"), []).code,
    "E-LOAD-001",
  );
  const withImages = analyzeGltf(await fixture("split_cube_images.gltf"), [
    { name: "split_cube.bin", bytes: bin },
  ]);
  expect(
    "images are not needed; only web addresses are warned about",
    [
      withImages.ok,
      withImages.issues
        .filter((issue) => issue.rule === "asset.external_uri")
        .map((issue) => issue.message),
    ],
    [true, ["External image references: 1 (web addresses: 1, other: 0)."]],
  );
  expect(
    "the byte limit counts the .gltf and the files",
    analyzeGltf(json, [{ name: "split_cube.bin", bytes: bin }], json.length + bin.length - 1).code,
    "E-LOAD-003",
  );
  expect(
    "bad entries in files are skipped, not thrown on",
    analyzeGltf(json, [
      null,
      { name: 5, bytes: bin },
      { name: "x" },
      { name: "split_cube.bin", bytes: bin },
    ]).ok,
    true,
  );
  expect(
    "files that is not an array counts as empty",
    analyzeGltf(json, "nope").code,
    "E-LOAD-005",
  );
  expect("GLB bytes still load as a GLB", analyzeGltf(cube, []).ok, true);
}

// FR-015: an OBJ is text in one file. analyzeObj() / inspectObj() take its bytes.
{
  const encode = (text) => new TextEncoder().encode(text);
  const positions = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\n";
  const faces = ["1 4 3 2", "5 6 7 8", "1 2 6 5", "4 8 7 3", "1 5 8 4", "2 3 7 6"];
  const cubeObj = encode(positions + faces.map((face) => `f ${face}\n`).join(""));
  const analyzeObj = (
    bytes,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    maxTriangles = DEFAULT_MAX_TRIANGLES,
  ) => core.analyzeObj(bytes, maxFileBytes, maxTriangles);

  const cubeResult = analyzeObj(cubeObj);
  expect(
    "OBJ cube loads as 12 triangles in one mesh",
    [cubeResult.ok, cubeResult.meshes, cubeResult.primitives, cubeResult.triangles],
    [true, 1, 1, 12],
  );
  expect(
    "OBJ cube has one part and one instance",
    [cubeResult.parts.length, cubeResult.instances.length],
    [1, 1],
  );
  expect(
    "OBJ cube has 8 vertices and no normals",
    [cubeResult.parts[0].positions.length, cubeResult.parts[0].normals.length],
    [24, 0],
  );
  expect(
    "OBJ cube without vn is reported as missing normals",
    cubeResult.issues.map((issue) => issue.rule),
    ["normal.missing", "uv.missing"],
  );
  expect(
    "inspectObj agrees with analyzeObj",
    core.inspectObj(cubeObj, DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_TRIANGLES).issues,
    cubeResult.issues,
  );
  expect(
    "OBJ bad index is E-LOAD-002",
    analyzeObj(encode("v 0 0 0\nf 1 2 3\n")).code,
    "E-LOAD-002",
  );
  expect("OBJ empty input is E-LOAD-002", analyzeObj(new Uint8Array(0)).code, "E-LOAD-002");
  expect(
    "OBJ byte limit is E-LOAD-003",
    analyzeObj(cubeObj, cubeObj.length - 1).code,
    "E-LOAD-003",
  );
  expect(
    "OBJ triangle limit is E-LOAD-003",
    analyzeObj(cubeObj, DEFAULT_MAX_FILE_BYTES, 11).code,
    "E-LOAD-003",
  );
  expect("GLB bytes given to analyzeObj are E-LOAD-001", analyzeObj(cube).code, "E-LOAD-001");
  expect(
    "an OBJ failure has an empty missing_files",
    analyzeObj(new Uint8Array(0)).missing_files,
    [],
  );
}

process.exit(failures === 0 ? 0 : 1);
