import { describe, expect, it } from "vitest";
import type { Issue } from "../wasm/lint_core.mjs";
import {
  describeIssue,
  describeSummary,
  SEVERITIES,
  severityMark,
  severityRank,
  summarizeIssues,
} from "./describe";

const triangleIssue = (overrides: Partial<Issue> = {}): Issue =>
  ({
    rule: "normal.flipped",
    severity: "error",
    message: "Vertex normals point opposite to the face winding.",
    element_kind: "triangle",
    target: { mesh: 0, primitive: 1 },
    count: 3,
    elements: [4, 5, 9],
    truncated: false,
    ...overrides,
  }) as Issue;

const assetIssue = (rule: string, severity: "error" | "warning" | "info" = "warning"): Issue => ({
  rule,
  severity,
  message: "The longest side of the bounding box is 1500 m (limit 1000 m).",
  element_kind: "asset",
  count: 1,
  elements: [],
  truncated: false,
});

describe("severities", () => {
  it("are ordered from the most to the least serious", () => {
    expect(SEVERITIES).toEqual(["error", "warning", "info"]);
    expect(severityRank("error")).toBeLessThan(severityRank("warning"));
    expect(severityRank("warning")).toBeLessThan(severityRank("info"));
  });

  it("have a word and a shape, so that colour is never the only difference", () => {
    const marks = SEVERITIES.map((severity) => severityMark(severity));
    expect(marks.map((mark) => mark.label)).toEqual(["Error", "Warning", "Info"]);
    expect(new Set(marks.map((mark) => mark.shape)).size).toBe(3);
  });
});

describe("describeIssue", () => {
  it("names each rule in plain words", () => {
    const titles = [
      "normal.flipped",
      "normal.missing",
      "normal.unnormalized",
      "mesh.nonmanifold_edge",
      "mesh.boundary_edge",
      "mesh.degenerate_triangle",
      "uv.missing",
      "uv.out_of_range",
      "uv.overlap",
    ].map((rule) => describeIssue(triangleIssue({ rule })).title);

    expect(titles).toEqual([
      "Flipped normals",
      "Missing normals",
      "Normals not unit length",
      "Non-manifold edges",
      "Open edges (holes)",
      "Degenerate triangles",
      "Missing UVs",
      "UVs outside 0 to 1",
      "Overlapping UVs",
    ]);
    const assetTitles = [
      "asset.triangle_count_exceeded",
      "asset.scale_too_small",
      "asset.scale_too_large",
    ].map((rule) => describeIssue(assetIssue(rule)).title);
    expect(assetTitles).toEqual(["Too many triangles", "Model too small", "Model too large"]);
  });

  it("falls back to the rule id for a rule it does not know", () => {
    expect(describeIssue(triangleIssue({ rule: "future.rule" })).title).toBe("future.rule");
  });

  it("says where a triangle issue is and how many triangles it covers", () => {
    const row = describeIssue(triangleIssue());

    expect(row.target).toBe("Mesh 0, primitive 1");
    expect(row.countText).toBe("3 triangles");
    expect(row.severity).toBe("error");
    expect(row.message).toBe("Vertex normals point opposite to the face winding.");
  });

  it("uses the singular for one triangle and groups the digits of large counts", () => {
    expect(describeIssue(triangleIssue({ count: 1, elements: [7] })).countText).toBe("1 triangle");
    expect(describeIssue(triangleIssue({ count: 1234, truncated: false })).countText).toBe(
      "1,234 triangles",
    );
  });

  it("says when the list of triangles is cut short", () => {
    const row = describeIssue(triangleIssue({ count: 2500, truncated: true }));

    expect(row.countText).toBe("2,500 triangles (first 1,000 listed)");
  });

  it("describes a whole-asset issue without a target or a count", () => {
    const row = describeIssue(assetIssue("asset.scale_too_large"));

    expect(row.target).toBe("Whole asset");
    expect(row.countText).toBe("");
  });

  it("builds one sentence for a screen reader, in the order severity, title, target, count", () => {
    expect(describeIssue(triangleIssue()).label).toBe(
      "Error: Flipped normals. Mesh 0, primitive 1. 3 triangles.",
    );
    expect(describeIssue(assetIssue("asset.scale_too_large")).label).toBe(
      "Warning: Model too large. Whole asset.",
    );
  });
});

describe("summarizeIssues and describeSummary", () => {
  it("counts the issues of each severity", () => {
    const issues = [
      triangleIssue(),
      triangleIssue({ severity: "error" }),
      assetIssue("asset.scale_too_large", "warning"),
      assetIssue("asset.scale_too_small", "info"),
    ];

    expect(summarizeIssues(issues)).toEqual({ error: 2, warning: 1, info: 1 });
  });

  it("writes the counts in words, with plurals", () => {
    expect(describeSummary({ error: 2, warning: 1, info: 0 })).toBe("2 errors, 1 warning, 0 info");
    expect(describeSummary({ error: 1, warning: 3, info: 5 })).toBe("1 error, 3 warnings, 5 info");
  });

  it("says so when nothing was found", () => {
    expect(describeSummary({ error: 0, warning: 0, info: 0 })).toBe("No problems found");
  });
});
