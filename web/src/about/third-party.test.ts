import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THIRD_PARTY_COMPONENTS } from "./third-party";

const notices = readFileSync(new URL("../../../THIRD_PARTY_NOTICES", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { dependencies: Record<string, string> };

describe("THIRD_PARTY_COMPONENTS", () => {
  it("lists every component that THIRD_PARTY_NOTICES names", () => {
    const names = THIRD_PARTY_COMPONENTS.map((component) => component.name);
    expect(names).toEqual(expect.arrayContaining(["tinygltf", "three.js", "fast_float"]));
  });

  it("appears by name in THIRD_PARTY_NOTICES", () => {
    for (const component of THIRD_PARTY_COMPONENTS) {
      expect(notices, component.name).toContain(component.name);
    }
  });

  it("has a license and an https address for each component", () => {
    for (const component of THIRD_PARTY_COMPONENTS) {
      expect(component.license.length, component.name).toBeGreaterThan(0);
      expect(component.url, component.name).toMatch(/^https:\/\//);
    }
  });

  it("states the same three.js version as package.json", () => {
    const three = THIRD_PARTY_COMPONENTS.find((component) => component.name === "three.js");
    expect(three?.version).toBe(packageJson.dependencies.three);
  });

  it("states the same tinygltf version as THIRD_PARTY_NOTICES", () => {
    const tinygltf = THIRD_PARTY_COMPONENTS.find((component) => component.name === "tinygltf");
    expect(notices).toContain(`tinygltf v${tinygltf?.version}`);
  });
});
