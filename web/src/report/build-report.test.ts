/// <reference types="node" />
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { applyFilterAndSort, DEFAULT_FILTER } from "../issues/filter-sort";
import type { Issue } from "../wasm/lint_core.mjs";
import { buildReport, safeFileName } from "./build-report";
import { reportToJson } from "./to-json";
import { reportToMarkdown } from "./to-markdown";

const THRESHOLDS = { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 };
const NOW = new Date(Date.UTC(2026, 11, 1, 9, 30, 0, 123));

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

function input(overrides: Record<string, unknown> = {}) {
  return {
    fileName: "crate.glb",
    fileSize: 20480,
    toolVersion: "0.0.0",
    generatedAt: NOW,
    result: {
      meshes: 1,
      primitives: 2,
      triangles: 12,
      issues: [flipped, tooLarge],
      thresholds: THRESHOLDS,
    },
    ...overrides,
  };
}

describe("buildReport", () => {
  it("records the format that was given, glb by default", () => {
    expect(buildReport(input()).asset.format).toBe("glb");
    expect(buildReport(input({ format: "gltf" })).asset.format).toBe("gltf");
  });

  it("fills every field of the report, in the order of the schema", () => {
    const report = buildReport(input());

    expect(report).toEqual({
      schema_version: "1.0",
      tool: { name: "lint-asset", version: "0.0.0" },
      generated_at: "2026-12-01T09:30:00Z",
      asset: { name: "crate.glb", format: "glb", size_bytes: 20480 },
      thresholds: THRESHOLDS,
      summary: {
        meshes: 1,
        primitives: 2,
        triangles: 12,
        issues: { error: 1, warning: 1, info: 0 },
      },
      issues: [flipped, tooLarge],
    });
    expect(Object.keys(report)).toEqual([
      "schema_version",
      "tool",
      "generated_at",
      "asset",
      "thresholds",
      "summary",
      "issues",
    ]);
  });

  it("writes the time in UTC to the second, ending with Z", () => {
    expect(buildReport(input()).generated_at).toBe("2026-12-01T09:30:00Z");
    // A local time zone must not change the instant that is written.
    expect(
      buildReport(input({ generatedAt: new Date("2026-01-02T03:04:05.999+09:00") })).generated_at,
    ).toBe("2026-01-01T18:04:05Z");
  });

  it("counts the issues of each severity, not the triangles", () => {
    const report = buildReport(
      input({
        result: {
          meshes: 1,
          primitives: 1,
          triangles: 12,
          issues: [flipped, flipped, { ...tooLarge, severity: "info" }],
          thresholds: THRESHOLDS,
        },
      }),
    );

    expect(report.summary.issues).toEqual({ error: 2, warning: 0, info: 1 });
  });

  it("reports an empty list of issues as a clean report", () => {
    const report = buildReport(
      input({
        result: { meshes: 1, primitives: 1, triangles: 12, issues: [], thresholds: THRESHOLDS },
      }),
    );

    expect(report.issues).toEqual([]);
    expect(report.summary.issues).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("copies only the fields of the schema from each issue", () => {
    const withExtras = {
      ...flipped,
      secret: "x",
      internal: { path: "/Users/someone" },
    } as unknown as Issue;
    const report = buildReport(
      input({
        result: {
          meshes: 1,
          primitives: 1,
          triangles: 12,
          issues: [withExtras],
          thresholds: THRESHOLDS,
        },
      }),
    );

    expect(Object.keys(report.issues[0] as object)).toEqual([
      "rule",
      "severity",
      "message",
      "element_kind",
      "target",
      "count",
      "elements",
      "truncated",
    ]);
    expect(JSON.stringify(report)).not.toContain("someone");
  });

  it("gives a whole-asset issue no target", () => {
    const report = buildReport(input());

    expect(Object.keys(report.issues[1] as object)).toEqual([
      "rule",
      "severity",
      "message",
      "element_kind",
      "count",
      "elements",
      "truncated",
    ]);
  });

  it("copies the lists, so a later change to the result cannot change the report", () => {
    const source = { ...flipped, elements: [1, 2] };
    const report = buildReport(
      input({
        result: {
          meshes: 1,
          primitives: 1,
          triangles: 12,
          issues: [source],
          thresholds: THRESHOLDS,
        },
      }),
    );
    source.elements.push(99);

    expect(report.issues[0]?.elements).toEqual([1, 2]);
  });
});

describe("safeFileName", () => {
  it("keeps only the file name of a path, from either kind of path", () => {
    expect(safeFileName("crate.glb")).toBe("crate.glb");
    expect(safeFileName("/Users/someone/models/crate.glb")).toBe("crate.glb");
    expect(safeFileName("C:\\Users\\someone\\crate.glb")).toBe("crate.glb");
  });

  it("removes control characters and surrounding spaces", () => {
    expect(safeFileName("  cra\u0000te\u0007.glb\n")).toBe("crate.glb");
  });

  it("falls back to a fixed name when nothing is left", () => {
    expect(safeFileName("")).toBe("model.glb");
    expect(safeFileName("/")).toBe("model.glb");
    expect(safeFileName("\u0000")).toBe("model.glb");
  });

  it("keeps the extension when it has to cut a very long name to 255 characters", () => {
    const name = safeFileName(`${"a".repeat(400)}.glb`);

    expect(name).toHaveLength(255);
    expect(name.endsWith(".glb")).toBe(true);
  });
});

describe("a built report is valid against the published schema (TC-009)", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../../../schemas/report.schema.json", import.meta.url), "utf8"),
  );
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

  const reports: Record<string, ReturnType<typeof input>> = {
    clean: input({
      result: { meshes: 1, primitives: 1, triangles: 12, issues: [], thresholds: THRESHOLDS },
    }),
    "triangle and asset issues": input(),
    "a long list that was cut": input({
      result: {
        meshes: 1,
        primitives: 1,
        triangles: 5000,
        issues: [
          {
            ...flipped,
            count: 2500,
            elements: Array.from({ length: 1000 }, (_, i) => i),
            truncated: true,
          },
        ],
        thresholds: THRESHOLDS,
      },
    }),
    "an awkward file name": input({ fileName: "C:\\Users\\someone\\my model (final) v2.glb" }),
    "a very long file name": input({ fileName: `${"a".repeat(400)}.glb` }),
  };

  for (const [label, value] of Object.entries(reports)) {
    it(label, () => {
      const report = buildReport(value);

      expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    });
  }

  it("holds nothing about the user except the file name", () => {
    const text = JSON.stringify(buildReport(input({ fileName: "/Users/someone/crate.glb" })));

    expect(text).not.toContain("someone");
    expect(text).not.toContain("/Users");
  });
});

it("exports the custom thresholds used by analyze in JSON and Markdown", () => {
  const thresholds = { max_triangles: 54321, min_extent_m: 0.125, max_extent_m: 321 };
  const source = input();
  source.result.thresholds = thresholds;
  const report = buildReport(source);
  expect(JSON.parse(reportToJson(report)).thresholds).toEqual(thresholds);
  const markdown = reportToMarkdown(report, "en");
  for (const value of ["54321", "0.125", "321"]) expect(markdown).toContain(value);
});

it("keeps every issue in both reports when the displayed issues are filtered", () => {
  const source = input();
  const visible = applyFilterAndSort(
    source.result.issues,
    { ...DEFAULT_FILTER, rule: "normal.flipped" },
    "severity",
  );
  expect(visible).toEqual([flipped]);
  const report = buildReport(source);
  expect(JSON.parse(reportToJson(report)).issues).toEqual([flipped, tooLarge]);
  const markdown = reportToMarkdown(report, "en");
  expect(markdown).toContain(flipped.rule);
  expect(markdown).toContain(tooLarge.rule);
  expect(report.summary.issues).toEqual({ error: 1, warning: 1, info: 0 });
});
