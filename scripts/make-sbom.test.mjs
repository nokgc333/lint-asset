import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeNativeComponents, schemaErrors } from "./make-sbom.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const native = JSON.parse(read("scripts/sbom-native-components.json"));
const packageJson = JSON.parse(read("package.json"));

// The SBOM of the npm packages that are shipped, made by the official tool.
function npmBase() {
  const output = join(mkdtempSync(join(tmpdir(), "sbom-")), "base.json");
  const run = spawnSync(
    "npx",
    [
      "--no-install",
      "cyclonedx-npm",
      "--omit",
      "dev",
      "--spec-version",
      "1.6",
      "--output-format",
      "JSON",
      "--output-file",
      output,
      "--mc-type",
      "application",
    ],
    { cwd: new URL(".", root), encoding: "utf8" },
  );
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(readFileSync(output, "utf8"));
}

const base = npmBase();

describe("the npm part of the SBOM", () => {
  it("lists exactly the packages the app ships: the runtime dependencies, not the dev ones", () => {
    const names = base.components.map((component) => component.name).sort();
    expect(names).toEqual(Object.keys(packageJson.dependencies).sort());
    for (const component of base.components) {
      expect(component.version).toBe(packageJson.dependencies[component.name]);
    }
  });

  it("names the app as the main component, with the version of package.json", () => {
    expect(base.metadata.component.name).toBe(packageJson.name);
    expect(base.metadata.component.version).toBe(packageJson.version);
  });
});

describe("mergeNativeComponents", () => {
  const merged = mergeNativeComponents(base, native);

  it("adds every native component after the npm ones, and keeps the npm ones", () => {
    expect(merged.components.slice(0, base.components.length)).toEqual(base.components);
    expect(merged.components.slice(base.components.length)).toEqual(native);
  });

  it("makes the app depend on every native component, and gives each an entry", () => {
    const rootRef = base.metadata.component["bom-ref"];
    const entry = merged.dependencies.find((dependency) => dependency.ref === rootRef);
    for (const component of native) {
      expect(entry.dependsOn).toContain(component["bom-ref"]);
      expect(merged.dependencies.some((d) => d.ref === component["bom-ref"])).toBe(true);
    }
  });

  it("does not change the BOM it was given", () => {
    const copy = structuredClone(base);
    mergeNativeComponents(base, native);
    expect(base).toEqual(copy);
  });

  it("refuses a repeated bom-ref and a base without a main component", () => {
    const twice = [{ ...native[0], "bom-ref": base.components[0]["bom-ref"] }];
    expect(() => mergeNativeComponents(base, twice)).toThrow(/used twice/);
    expect(() => mergeNativeComponents({ ...base, metadata: {} }, native)).toThrow(
      /main component/,
    );
  });

  it("matches the CycloneDX 1.6 schema", async () => {
    expect(await schemaErrors(merged)).toEqual([]);
  });

  it("is rejected by the schema check when it is wrong", async () => {
    const broken = structuredClone(merged);
    broken.components[0].type = "not-a-type";
    expect((await schemaErrors(broken)).length).toBeGreaterThan(0);
    const noVersion = { ...structuredClone(merged), specVersion: undefined };
    expect((await schemaErrors(noVersion)).length).toBeGreaterThan(0);
  });
});

describe("the native components agree with the build", () => {
  const byName = (name) => native.find((component) => component.name === name);

  it("has the tinygltf commit that core/CMakeLists.txt pins", () => {
    const commit = read("core/CMakeLists.txt").match(/GIT_TAG ([0-9a-f]{40})/)?.[1];
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    expect(byName("tinygltf").purl).toBe(`pkg:github/syoyo/tinygltf@${commit}`);
  });

  it("has the Emscripten version of the image that the workflows use", () => {
    for (const workflow of ["ci.yml", "release.yml"]) {
      const tags = [
        ...read(`.github/workflows/${workflow}`).matchAll(/emscripten\/emsdk:([\d.]+)@/g),
      ];
      expect(tags.length, workflow).toBeGreaterThan(0);
      for (const [, version] of tags) expect(byName("emscripten").version).toBe(version);
    }
  });

  it("uses the same Emscripten image digest in both workflows", () => {
    const digests = ["ci.yml", "release.yml"].map(
      (workflow) =>
        read(`.github/workflows/${workflow}`).match(
          /emscripten\/emsdk:[\d.]+@(sha256:[0-9a-f]{64})/,
        )?.[1],
    );
    expect(digests[0]).toMatch(/^sha256:/);
    expect(digests[1]).toBe(digests[0]);
  });

  it("is listed in THIRD_PARTY_NOTICES, for the parts it covers", () => {
    const notices = read("THIRD_PARTY_NOTICES");
    for (const name of ["tinygltf", "fast_float", "Dragonbox"]) expect(notices).toContain(name);
  });

  it("gives every component a bom-ref, a name, and a license", () => {
    for (const component of native) {
      expect(component["bom-ref"]).toMatch(/^native:/);
      expect(component.name).toBeTruthy();
      expect(component.licenses.length).toBeGreaterThan(0);
    }
  });
});
