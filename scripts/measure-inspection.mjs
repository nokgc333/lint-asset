// Measures how long the WASM core takes to inspect the large models (NFR-002).
//
// Usage: node scripts/measure-inspection.mjs <module dir> <model dir> [--enforce]
// The module must be built with -DLINT_ASSET_WASM_NODE=ON. The models are written by
// tests/tools/make_perf_models.py. The times depend on the machine, so they are only compared
// with the budgets when --enforce is given; without it the script just prints them.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const enforce = process.argv.includes("--enforce");
const [moduleDir, modelDir] = args;
if (!moduleDir || !modelDir) {
  console.error("usage: measure-inspection.mjs <module dir> <model dir> [--enforce]");
  process.exit(2);
}

const MIB = 1024 * 1024;
const MAX_FILE_BYTES = 100 * MIB;
const MAX_TRIANGLES = 2_000_000;
const RUNS = 5;

// The budgets of NFR-002, in seconds, and the issues a correct inspection reports.
const MODELS = [
  { file: "perf_10k.glb", triangles: 10_000, budget: 0.2, rules: [] },
  { file: "perf_100k.glb", triangles: 100_000, budget: 1, rules: [] },
  {
    file: "perf_1m.glb",
    triangles: 1_000_000,
    budget: 5,
    rules: ["asset.triangle_count_exceeded"],
  },
];

const { default: createLintCore } = await import(
  pathToFileURL(resolve(moduleDir, "lint_core.mjs")).href
);
const core = await createLintCore();

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

let failures = 0;
console.log(`node ${process.version}, ${RUNS} runs each (the first run is also the cold one)`);
for (const model of MODELS) {
  const bytes = new Uint8Array(await readFile(join(modelDir, model.file)));
  const times = [];
  let result;
  for (let run = 0; run < RUNS; run += 1) {
    const start = performance.now();
    result = core.analyze(bytes, MAX_FILE_BYTES, MAX_TRIANGLES);
    times.push((performance.now() - start) / 1000);
  }
  const rules = result.issues.map((issue) => issue.rule);
  const correct =
    result.ok &&
    result.triangles === model.triangles &&
    JSON.stringify(rules) === JSON.stringify(model.rules);
  const typical = median(times);
  const within = typical <= model.budget;
  console.log(
    `${correct ? "ok  " : "FAIL"} ${model.file}: ${model.triangles} triangles, ` +
      `median ${typical.toFixed(3)} s, best ${Math.min(...times).toFixed(3)} s, ` +
      `first ${times[0].toFixed(3)} s, budget ${model.budget} s ` +
      `(${within ? "within" : "OVER"}), issues ${JSON.stringify(rules)}`,
  );
  if (!correct) failures += 1;
  if (enforce && !within) failures += 1;
}
process.exit(failures === 0 ? 0 : 1);
