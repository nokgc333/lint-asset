import { describe, expect, it } from "vitest";
import type { Issue } from "../wasm/lint_core.mjs";
import { buildReport } from "./build-report";
import { escapeMarkdown, reportToMarkdown } from "./to-markdown";

const THRESHOLDS = { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 };

const flipped: Issue = {
  rule: "normal.flipped",
  severity: "error",
  message: "Vertex normals point opposite to the face winding.",
  element_kind: "triangle",
  target: { mesh: 0, primitive: 0 },
  count: 3,
  elements: [4, 5, 9],
  truncated: false,
};
const tooLarge: Issue = {
  rule: "asset.scale_too_large",
  severity: "warning",
  message: "The longest side of the bounding box is 1500 m (limit 1000 m).",
  element_kind: "asset",
  count: 1,
  elements: [],
  truncated: false,
};

const make = (issues: Issue[], fileName = "crate.glb") =>
  buildReport({
    fileName,
    fileSize: 20480,
    toolVersion: "0.0.0",
    generatedAt: new Date(Date.UTC(2026, 11, 1, 9, 30, 0)),
    result: { meshes: 1, primitives: 2, triangles: 12, thresholds: THRESHOLDS, issues },
  });

describe("reportToMarkdown", () => {
  it("writes the whole report as Markdown", () => {
    const expected = [
      "# lint-asset report: crate.glb",
      "",
      "- Generated: 2026-12-01T09:30:00Z (UTC)",
      "- Tool: lint-asset 0.0.0 (report format 1.0)",
      "- File size: 20480 bytes",
      "",
      "## Summary",
      "",
      "| | Count |",
      "|---|---|",
      "| Meshes | 1 |",
      "| Primitives | 2 |",
      "| Triangles | 12 |",
      "| Errors | 1 |",
      "| Warnings | 1 |",
      "| Info | 0 |",
      "",
      "## Limits used",
      "",
      "- Triangles drawn: at most 100000",
      "- Longest side: from 0.01 m to 1000 m",
      "",
      "## Problems",
      "",
      "### Error: Flipped normals",
      "",
      "- Where: Mesh 0, primitive 0",
      "- Triangles: 3 (4, 5, 9)",
      "- Rule: `normal.flipped`",
      "- Vertex normals point opposite to the face winding.",
      "",
      "### Warning: Model too large",
      "",
      "- Where: Whole asset",
      "- Rule: `asset.scale_too_large`",
      "- The longest side of the bounding box is 1500 m (limit 1000 m).",
      "",
    ].join("\n");

    expect(reportToMarkdown(make([flipped, tooLarge]))).toBe(expected);
  });

  it("says so when no problem was found", () => {
    const text = reportToMarkdown(make([]));

    expect(text).toContain("## Problems\n\nNo problems found.\n");
    expect(text).not.toContain("###");
  });

  it("lists at most 20 triangle numbers and says how many there are", () => {
    const many: Issue = {
      ...flipped,
      count: 2500,
      elements: Array.from({ length: 1000 }, (_, i) => i),
      truncated: true,
    };
    const text = reportToMarkdown(make([many]));

    expect(text).toContain(
      "- Triangles: 2500 (first 20: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19; the JSON file lists up to 1000)",
    );
    expect(text).not.toContain("20, 21");
  });

  it("ends with exactly one newline", () => {
    const text = reportToMarkdown(make([flipped]));

    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("escapes the characters of the file name that Markdown would act on", () => {
    const text = reportToMarkdown(make([], "a_b*c`d[e]#f.glb"));

    expect(text.split("\n")[0]).toBe("# lint-asset report: a\\_b\\*c\\`d\\[e\\]\\#f.glb");
  });

  it("does not let a file name start a new line or a link", () => {
    const text = reportToMarkdown(make([], "x](javascript:alert(1)).glb"));

    expect(text.split("\n")[0]).toBe("# lint-asset report: x\\]\\(javascript:alert\\(1\\)\\).glb");
  });
});

describe("escapeMarkdown", () => {
  it("puts a backslash before each special character", () => {
    expect(escapeMarkdown("a_b*c`d[e]f(g)h#i|j<k>l\\m")).toBe(
      "a\\_b\\*c\\`d\\[e\\]f\\(g\\)h\\#i\\|j\\<k\\>l\\\\m",
    );
  });

  it("leaves plain text alone", () => {
    expect(escapeMarkdown("crate.glb")).toBe("crate.glb");
  });
});
