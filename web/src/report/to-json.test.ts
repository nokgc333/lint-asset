import { describe, expect, it } from "vitest";
import { buildReport } from "./build-report";
import { reportToJson } from "./to-json";

const THRESHOLDS = { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 };

const report = buildReport({
  fileName: "crate.glb",
  fileSize: 20480,
  toolVersion: "0.0.0",
  generatedAt: new Date(Date.UTC(2026, 11, 1, 9, 30, 0)),
  result: {
    meshes: 1,
    primitives: 1,
    triangles: 12,
    thresholds: THRESHOLDS,
    issues: [
      {
        rule: "normal.flipped",
        severity: "error",
        message: "Vertex normals point opposite to the face winding.",
        element_kind: "triangle",
        target: { mesh: 0, primitive: 0 },
        count: 3,
        elements: [4, 5, 9],
        truncated: false,
      },
    ],
  },
});

describe("reportToJson", () => {
  it("is JSON that parses back to the same report", () => {
    expect(JSON.parse(reportToJson(report))).toEqual(report);
  });

  it("is indented by two spaces and ends with one newline", () => {
    const text = reportToJson(report);

    expect(text.startsWith('{\n  "schema_version": "1.0",\n')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("keeps the keys in the order of the schema", () => {
    const keys = Object.keys(JSON.parse(reportToJson(report)));

    expect(keys).toEqual([
      "schema_version",
      "tool",
      "generated_at",
      "asset",
      "thresholds",
      "summary",
      "issues",
    ]);
  });

  it("writes a list of triangle numbers on one line", () => {
    expect(reportToJson(report)).toContain('"elements": [4, 5, 9],');
  });

  it("writes an empty list as []", () => {
    const clean = buildReport({
      fileName: "a.glb",
      fileSize: 1,
      toolVersion: "0.0.0",
      generatedAt: new Date(0),
      result: { meshes: 0, primitives: 0, triangles: 0, thresholds: THRESHOLDS, issues: [] },
    });

    expect(reportToJson(clean)).toContain('"issues": []');
  });

  it("gives the same text every time for the same report", () => {
    expect(reportToJson(report)).toBe(reportToJson(report));
  });
});
