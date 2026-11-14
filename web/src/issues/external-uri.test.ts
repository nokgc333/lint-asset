import { describe, expect, it } from "vitest";
import { buildReport } from "../report/build-report";
import { reportToMarkdown } from "../report/to-markdown";
import type { Issue } from "../wasm/lint_core.mjs";
import { describeIssue } from "./describe";
import { localizeIssueMessage } from "./localize";

const issue: Issue = {
  rule: "asset.external_uri",
  severity: "warning",
  message: "External image references: 5 (web addresses: 3, other: 2).",
  element_kind: "asset",
  count: 1,
  elements: [],
  truncated: false,
};

const japanese = "外部の画像参照: 5 件（Web アドレス 3 件、その他 2 件）。";

describe("external image references", () => {
  it("describes the warning for the English and Japanese issue list", () => {
    expect(describeIssue(issue).title).toBe("External image references");
    const description = describeIssue(issue, "ja");
    expect(description.title).toBe("外部の画像参照");
    expect(description.label).toContain("警告");
    expect(description.label).toContain("外部の画像参照");
    expect(description.message).toBe(japanese);
    expect(description.countText).toBe("");
  });

  it.each([
    ["1", "1", "0"],
    ["1", "0", "1"],
    ["8589934590", "4294967295", "4294967295"],
  ])("preserves the total %s and both counts", (total, web, other) => {
    const message = `External image references: ${total} (web addresses: ${web}, other: ${other}).`;
    expect(localizeIssueMessage(issue.rule, message, "ja")).toBe(
      `外部の画像参照: ${total} 件（Web アドレス ${web} 件、その他 ${other} 件）。`,
    );
    expect(localizeIssueMessage(issue.rule, message, "en")).toBe(message);
  });

  it.each([
    "External image references: -5 (web addresses: 3, other: 2).",
    "External image references: 5 (web addresses: 3.0, other: 2).",
    "External image references: 5 (web addresses: 3, other: 2e0).",
    `${issue.message}\n`,
  ])("keeps an unrecognized message unchanged: %s", (message) => {
    expect(localizeIssueMessage(issue.rule, message, "ja")).toBe(message);
  });

  it("carries the warning into the JSON and English and Japanese Markdown reports", () => {
    const report = buildReport({
      fileName: "cube.glb",
      fileSize: 1000,
      toolVersion: "0.0.0",
      generatedAt: new Date("2026-11-14T00:00:00Z"),
      result: {
        meshes: 1,
        primitives: 1,
        triangles: 12,
        thresholds: { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 },
        issues: [issue],
      },
    });
    expect(report.issues).toEqual([issue]);
    expect(report.issues[0]).not.toHaveProperty("target");
    expect(report.summary.issues).toEqual({ error: 0, warning: 1, info: 0 });
    const english = reportToMarkdown(report);
    expect(english).toContain("### Warning: External image references");
    expect(english).toContain(issue.message);
    const translated = reportToMarkdown(report, "ja");
    expect(translated).toContain("### 警告: 外部の画像参照");
    expect(translated).toContain("`asset.external_uri`");
    expect(translated).toContain(japanese);
  });
});
