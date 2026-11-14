// Builds the CycloneDX SBOM of the web build that is released.
//
// The npm part is made by the official CycloneDX tool (cyclonedx-npm, runtime packages only). This
// script adds the C++ parts that are compiled into the WASM module (scripts/sbom-native-components
// .json), because no tool can read them from CMake, and checks the result against the CycloneDX
// 1.6 JSON schema.
//
// Usage: node scripts/make-sbom.mjs <npm sbom.json> <output.json>

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const SPEC_VERSION = "1.6";
const here = dirname(fileURLToPath(import.meta.url));
const NATIVE_COMPONENTS = join(here, "sbom-native-components.json");
const SCHEMA_DIR = join(
  here,
  "..",
  "node_modules",
  "@cyclonedx",
  "cyclonedx-library",
  "res",
  "schema",
);

// Adds the native components to a BOM that the npm tool made. Does not change its arguments.
export function mergeNativeComponents(base, nativeComponents) {
  const root = base.metadata?.component?.["bom-ref"];
  if (!root) throw new Error("the base SBOM has no main component with a bom-ref");
  const knownRefs = new Set((base.components ?? []).map((component) => component["bom-ref"]));
  for (const component of nativeComponents) {
    if (!component["bom-ref"])
      throw new Error(`a native component has no bom-ref: ${component.name}`);
    if (knownRefs.has(component["bom-ref"])) {
      throw new Error(`the bom-ref is used twice: ${component["bom-ref"]}`);
    }
    knownRefs.add(component["bom-ref"]);
  }
  const nativeRefs = nativeComponents.map((component) => component["bom-ref"]);
  const dependencies = (base.dependencies ?? []).map((entry) =>
    entry.ref === root
      ? { ...entry, dependsOn: [...(entry.dependsOn ?? []), ...nativeRefs] }
      : entry,
  );
  for (const ref of nativeRefs) dependencies.push({ ref, dependsOn: [] });
  return {
    ...base,
    components: [...(base.components ?? []), ...nativeComponents],
    dependencies,
  };
}

// Returns the list of schema errors (empty when the BOM is valid).
export async function schemaErrors(bom, schemaDir = SCHEMA_DIR) {
  const read = async (name) => JSON.parse(await readFile(join(schemaDir, name), "utf8"));
  const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
  // The BOM schema names these two files by their SNAPSHOT names, relative to its own address.
  for (const name of ["spdx.SNAPSHOT.schema.json", "jsf-0.82.SNAPSHOT.schema.json"]) {
    ajv.addSchema(await read(name), `http://cyclonedx.org/schema/${name}`);
  }
  const validate = ajv.compile(await read(`bom-${SPEC_VERSION}.SNAPSHOT.schema.json`));
  validate(bom);
  return (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`);
}

async function main() {
  const [basePath, outputPath] = process.argv.slice(2);
  if (!basePath || !outputPath) {
    console.error("usage: make-sbom.mjs <npm sbom.json> <output.json>");
    process.exit(2);
  }
  const base = JSON.parse(await readFile(basePath, "utf8"));
  const native = JSON.parse(await readFile(NATIVE_COMPONENTS, "utf8"));
  const bom = mergeNativeComponents(base, native);
  const errors = await schemaErrors(bom);
  if (errors.length > 0) {
    console.error(`the SBOM does not match the CycloneDX ${SPEC_VERSION} schema:`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  await writeFile(outputPath, `${JSON.stringify(bom, null, 2)}\n`);
  console.log(`${outputPath}: ${bom.components.length} components, CycloneDX ${bom.specVersion}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
