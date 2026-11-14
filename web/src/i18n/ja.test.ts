import { describe, expect, it } from "vitest";
import { describeCounts } from "../counts";
import { describeProblem } from "../environment";
import { describeIssue, describeSummary, severityMark } from "../issues/describe";
import { formatLoadError, messageFor } from "../messages";
import { buildReport } from "../report/build-report";
import { reportToMarkdown } from "../report/to-markdown";
import type { Issue } from "../wasm/lint_core.mjs";

const THRESHOLDS = { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 };

const flipped: Issue = {
  rule: "normal.flipped",
  severity: "error",
  message: "Vertex normals point opposite to the face winding.",
  element_kind: "triangle",
  target: { mesh: 0, primitive: 1 },
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

describe("load errors in Japanese", () => {
  it("give a cause and a next action for each code", () => {
    expect(messageFor("E-LOAD-001", "ja")).toEqual({
      cause:
        "このファイルは GLB（バイナリ glTF 2.x）ではないか、含まれていない別ファイルに依存しています。",
      action: "モデルを 1 つの .glb ファイルとして書き出し、そのファイルを開いてください。",
    });
    expect(messageFor("E-LOAD-002", "ja").cause).toBe(
      "GLB ファイルが壊れているか、途中で切れています。",
    );
    expect(messageFor("E-LOAD-003", "ja").cause).toBe(
      "ファイルまたはモデルが、このツールで検査できるサイズの上限を超えています。",
    );
    expect(messageFor("E-LOAD-004", "ja").cause).toBe(
      "このツールが読めない glTF 拡張が必須になっています。",
    );
    expect(messageFor("E-LOAD-999", "ja").cause).toBe("ファイルを読み込めませんでした。");
  });

  it("join the code, the cause, the action, and the detail", () => {
    expect(formatLoadError("E-LOAD-002", "GLB total length does not match data size", "ja")).toBe(
      "E-LOAD-002: GLB ファイルが壊れているか、途中で切れています。" +
        "モデルを書き出し直すか、ファイルをもう一度ダウンロードして、再度お試しください。" +
        "（詳細: GLB total length does not match data size）",
    );
  });

  it("leave out the detail when there is none", () => {
    expect(formatLoadError("E-LOAD-003", "", "ja")).not.toContain("詳細");
  });

  it("keep English when no locale is given", () => {
    expect(formatLoadError("E-LOAD-003", "")).toBe(formatLoadError("E-LOAD-003", "", "en"));
    expect(messageFor("E-LOAD-001").cause).toMatch(/^This file is not a GLB/);
  });
});

describe("the unsupported-environment guide in Japanese", () => {
  it("names the missing technology and says what to do", () => {
    expect(describeProblem("webgl2", "ja").cause).toBe(
      "このブラウザでは WebGL2 を利用できません。",
    );
    expect(describeProblem("webassembly", "ja").cause).toBe(
      "このブラウザでは WebAssembly を利用できません。",
    );
    expect(describeProblem("worker", "ja").cause).toBe(
      "このブラウザでは Web Worker を利用できません。",
    );
    expect(describeProblem("narrow", "ja").cause).toBe("ウィンドウの幅が 1024 px 未満です。");
    expect(describeProblem("narrow", "ja").action).toBe(
      "ウィンドウを広げるか、デスクトップのコンピューターでこのページを開いてください。" +
        "スマートフォンとタブレットにはまだ対応していません。",
    );
  });
});

describe("the counts line in Japanese", () => {
  it("counts without English plurals, with grouped digits", () => {
    expect(describeCounts({ meshes: 1, primitives: 2, triangles: 12 }, "ja")).toBe(
      "メッシュ 1 個、プリミティブ 2 個、三角形 12 個",
    );
    expect(describeCounts({ meshes: 3, primitives: 4, triangles: 1234567 }, "ja")).toBe(
      "メッシュ 3 個、プリミティブ 4 個、三角形 1,234,567 個",
    );
  });
});

describe("the problem list in Japanese", () => {
  it("writes the severity as a word", () => {
    expect(severityMark("error", "ja").label).toBe("エラー");
    expect(severityMark("warning", "ja").label).toBe("警告");
    expect(severityMark("info", "ja").label).toBe("情報");
    // The shape does not depend on the language.
    expect(severityMark("error", "ja").shape).toBe(severityMark("error", "en").shape);
  });

  it("describes a triangle issue", () => {
    expect(describeIssue(flipped, "ja")).toEqual({
      title: "反転した法線",
      target: "メッシュ 0・プリミティブ 1",
      countText: "三角形 3 個",
      severity: "error",
      message: "頂点法線が面の向き（巻き順）と逆を向いています。",
      label: "エラー: 反転した法線。メッシュ 0・プリミティブ 1。三角形 3 個。",
    });
  });

  it("describes a whole-asset issue", () => {
    expect(describeIssue(tooLarge, "ja")).toEqual({
      title: "モデルが大きすぎます",
      target: "アセット全体",
      countText: "",
      severity: "warning",
      message: "外接箱の最長辺は 1500 m です（上限 1000 m）。",
      label: "警告: モデルが大きすぎます。アセット全体。",
    });
  });

  it("names every rule", () => {
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
      "asset.triangle_count_exceeded",
      "asset.scale_too_small",
      "asset.scale_too_large",
    ].map((rule) => describeIssue({ ...flipped, rule }, "ja").title);

    expect(titles).toEqual([
      "反転した法線",
      "法線がありません",
      "長さが 1 でない法線",
      "非多様体エッジ",
      "開いたエッジ（穴）",
      "退化した三角形",
      "UV がありません",
      "0〜1 の外の UV",
      "重なった UV",
      "三角形が多すぎます",
      "モデルが小さすぎます",
      "モデルが大きすぎます",
    ]);
  });

  it("writes the triangle count with grouped digits, and says when the list is cut", () => {
    expect(describeIssue({ ...flipped, count: 1, elements: [7] }, "ja").countText).toBe(
      "三角形 1 個",
    );
    expect(describeIssue({ ...flipped, count: 1234 }, "ja").countText).toBe("三角形 1,234 個");
    expect(describeIssue({ ...flipped, count: 2500, truncated: true }, "ja").countText).toBe(
      "三角形 2,500 個（先頭 1,000 個を表示）",
    );
  });

  it("summarises the counts", () => {
    expect(describeSummary({ error: 2, warning: 1, info: 0 }, "ja")).toBe(
      "エラー 2 件、警告 1 件、情報 0 件",
    );
    expect(describeSummary({ error: 0, warning: 0, info: 0 }, "ja")).toBe(
      "問題は見つかりませんでした",
    );
  });
});

describe("the messages of the checks in Japanese", () => {
  const cases: Array<[string, string, string]> = [
    [
      "normal.flipped",
      "Vertex normals point opposite to the face winding.",
      "頂点法線が面の向き（巻き順）と逆を向いています。",
    ],
    [
      "normal.missing",
      "The primitive has no vertex normals.",
      "このプリミティブには頂点法線がありません。",
    ],
    [
      "normal.unnormalized",
      "Vertex normals are not unit length (outside 1 +/- 0.01).",
      "頂点法線の長さが 1 ± 0.01 の範囲外です。",
    ],
    [
      "mesh.nonmanifold_edge",
      "1 edge is shared by three or more triangles.",
      "1 本のエッジを 3 面以上が共有しています。",
    ],
    [
      "mesh.nonmanifold_edge",
      "4 edges are each shared by three or more triangles.",
      "4 本のエッジを 3 面以上が共有しています。",
    ],
    [
      "mesh.boundary_edge",
      "1 boundary edge is used by only one triangle.",
      "1 本のエッジが 1 面だけに使われています（穴の縁）。",
    ],
    [
      "mesh.boundary_edge",
      "4 boundary edges are each used by only one triangle.",
      "4 本のエッジが 1 面だけに使われています（穴の縁）。",
    ],
    [
      "mesh.degenerate_triangle",
      "Triangles with an area below 1e-10, or with a position that is not a finite number.",
      "面積が 1e-10 未満、または位置が有限の数でない三角形です。",
    ],
    [
      "uv.missing",
      "The primitive has no UV coordinates.",
      "このプリミティブには UV 座標がありません。",
    ],
    [
      "uv.out_of_range",
      "UV coordinates are outside the 0 to 1 range.",
      "UV 座標が 0〜1 の範囲外です。",
    ],
    ["uv.overlap", "Triangles overlap in UV space.", "三角形が UV 空間で重なっています。"],
    [
      "uv.overlap",
      "Triangles overlap in UV space in a mirrored layout (for example, left and right halves that share one area).",
      "三角形が UV 空間で鏡像配置として重なっています（左右の半分が同じ領域を共有する場合など）。",
    ],
    [
      "asset.triangle_count_exceeded",
      "The scene draws 120000 triangles (limit 100000).",
      "シーンは 120000 個の三角形を描画します（上限 100000）。",
    ],
    [
      "asset.scale_too_small",
      "The longest side of the bounding box is 0.005 m (minimum 0.01 m).",
      "外接箱の最長辺は 0.005 m です（最小 0.01 m）。",
    ],
    [
      "asset.scale_too_large",
      "The longest side of the bounding box is 1500 m (limit 1000 m).",
      "外接箱の最長辺は 1500 m です（上限 1000 m）。",
    ],
  ];

  for (const [rule, english, japanese] of cases) {
    it(`${rule}: ${english.slice(0, 40)}`, () => {
      expect(describeIssue({ ...flipped, rule, message: english }, "ja").message).toBe(japanese);
      expect(describeIssue({ ...flipped, rule, message: english }, "en").message).toBe(english);
    });
  }

  it("falls back to the English text for a message it does not know", () => {
    expect(describeIssue({ ...flipped, message: "Something new happened." }, "ja").message).toBe(
      "Something new happened.",
    );
  });
});

describe("the Markdown report in Japanese", () => {
  const make = (issues: Issue[], fileName = "crate.glb") =>
    buildReport({
      fileName,
      fileSize: 20480,
      toolVersion: "0.0.0",
      generatedAt: new Date(Date.UTC(2026, 11, 1, 9, 30, 0)),
      result: { meshes: 1, primitives: 2, triangles: 12, thresholds: THRESHOLDS, issues },
    });

  it("writes the whole report in Japanese", () => {
    const first = { ...flipped, target: { mesh: 0, primitive: 0 } } as Issue;
    const expected = [
      "# lint-asset レポート: crate.glb",
      "",
      "- 作成日時: 2026-12-01T09:30:00Z（UTC）",
      "- ツール: lint-asset 0.0.0（レポート形式 1.0）",
      "- ファイルサイズ: 20480 バイト",
      "",
      "## 概要",
      "",
      "| | 件数 |",
      "|---|---|",
      "| メッシュ | 1 |",
      "| プリミティブ | 2 |",
      "| 三角形 | 12 |",
      "| エラー | 1 |",
      "| 警告 | 1 |",
      "| 情報 | 0 |",
      "",
      "## 使用した上限",
      "",
      "- 描画する三角形: 最大 100000 個",
      "- 最長辺: 0.01 m から 1000 m",
      "",
      "## 問題",
      "",
      "### エラー: 反転した法線",
      "",
      "- 場所: メッシュ 0・プリミティブ 0",
      "- 三角形: 3 個（4, 5, 9）",
      "- ルール: `normal.flipped`",
      "- 頂点法線が面の向き（巻き順）と逆を向いています。",
      "",
      "### 警告: モデルが大きすぎます",
      "",
      "- 場所: アセット全体",
      "- ルール: `asset.scale_too_large`",
      "- 外接箱の最長辺は 1500 m です（上限 1000 m）。",
      "",
    ].join("\n");

    expect(reportToMarkdown(make([first, tooLarge]), "ja")).toBe(expected);
  });

  it("says so when no problem was found", () => {
    expect(reportToMarkdown(make([]), "ja")).toContain("## 問題\n\n問題は見つかりませんでした。\n");
  });

  it("lists at most 20 triangle numbers and points to the JSON file", () => {
    const many: Issue = {
      ...flipped,
      count: 2500,
      elements: Array.from({ length: 1000 }, (_, i) => i),
      truncated: true,
    };

    expect(reportToMarkdown(make([many]), "ja")).toContain(
      "- 三角形: 2500 個（先頭 20 個: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19。JSON ファイルには最大 1000 個を載せています）",
    );
  });

  it("still escapes the file name", () => {
    expect(reportToMarkdown(make([], "a_b*c.glb"), "ja").split("\n")[0]).toBe(
      "# lint-asset レポート: a\\_b\\*c.glb",
    );
  });

  it("is English when no locale is given", () => {
    expect(reportToMarkdown(make([]))).toBe(reportToMarkdown(make([]), "en"));
    expect(reportToMarkdown(make([]))).toContain("# lint-asset report:");
  });

  it("leaves the JSON report in English, whatever the display language", () => {
    expect(make([flipped]).issues[0]?.message).toBe(
      "Vertex normals point opposite to the face winding.",
    );
  });
});
