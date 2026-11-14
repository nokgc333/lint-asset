import { describe, expect, it } from "vitest";
import { exportFileName } from "./export-name";

describe("exportFileName", () => {
  it("replaces the extension of the model with .lint and the kind of report", () => {
    expect(exportFileName("crate.glb", "json")).toBe("crate.lint.json");
    expect(exportFileName("crate.glb", "md")).toBe("crate.lint.md");
  });

  it("treats the extension in any case the same way", () => {
    expect(exportFileName("Crate.GLB", "json")).toBe("Crate.lint.json");
  });

  it("keeps other dots in the name", () => {
    expect(exportFileName("crate.v2.glb", "md")).toBe("crate.v2.lint.md");
  });

  it("adds the ending to a name that has no .glb", () => {
    expect(exportFileName("crate", "json")).toBe("crate.lint.json");
  });

  it("never writes a path separator or a control character into the name", () => {
    expect(exportFileName("a/b\\c\u0000.glb", "json")).toBe("a_b_c_.lint.json");
  });

  it("falls back to a fixed name for an empty one", () => {
    expect(exportFileName("", "md")).toBe("model.lint.md");
    expect(exportFileName(".glb", "md")).toBe("model.lint.md");
  });
});
