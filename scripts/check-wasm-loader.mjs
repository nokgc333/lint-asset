// Runs the built WASM module in Node.js and checks loadGlb() against the same fixtures and
// expected values as the native tests (tests/glb_loader_test.cpp).
//
// Usage: node scripts/check-wasm-loader.mjs <dir with lint_core.mjs> <dir with the .glb fixtures>
// The fixtures are written by tests/tools/make_test_glbs.py.
// The module must be built with -DLINT_ASSET_WASM_NODE=ON.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [moduleDir, fixtureDir] = process.argv.slice(2);
if (!moduleDir || !fixtureDir) {
  console.error("usage: check-wasm-loader.mjs <module dir> <fixture dir>");
  process.exit(2);
}

const MIB = 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 100 * MIB;
const DEFAULT_MAX_TRIANGLES = 2_000_000;

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

process.exit(failures === 0 ? 0 : 1);
