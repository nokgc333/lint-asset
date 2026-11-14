import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Issue } from "../wasm/lint_core.mjs";
import {
  applyFilterAndSort,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  type IssueFilter,
  isFiltered,
  issueKey,
  RULE_ORDER,
  ruleOptions,
} from "./filter-sort";

function triangle(
  rule: string,
  severity: Issue["severity"],
  mesh: number,
  primitive: number,
  count: number,
): Issue {
  return {
    rule,
    severity,
    message: `${rule} in ${mesh}/${primitive}`,
    element_kind: "triangle",
    target: { mesh, primitive },
    count,
    elements: Array.from({ length: Math.min(count, 5) }, (_, i) => i),
    truncated: false,
  } as Issue;
}

function asset(rule: string, severity: Issue["severity"] = "warning"): Issue {
  return {
    rule,
    severity,
    message: rule,
    element_kind: "asset",
    count: 1,
    elements: [],
    truncated: false,
  } as Issue;
}

// The report order: whole-asset issues first, then by mesh, primitive, and rule.
const issues: Issue[] = [
  asset("asset.external_uri"),
  triangle("mesh.boundary_edge", "warning", 0, 0, 2),
  triangle("normal.flipped", "error", 0, 1, 8),
  triangle("mesh.boundary_edge", "warning", 0, 1, 1),
  triangle("uv.overlap", "warning", 0, 1, 4),
  triangle("uv.out_of_range", "info", 1, 0, 3),
];

const ids = (list: readonly Issue[]) => list.map((issue) => issueKey(issue));

describe("RULE_ORDER", () => {
  it("is the order of the rules in the report schema", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../../schemas/report.schema.json", import.meta.url), "utf8"),
    ) as { $defs: { rule: { enum: string[] } } };
    expect([...RULE_ORDER]).toEqual(schema.$defs.rule.enum);
  });
});

describe("the defaults", () => {
  it("show every severity and every rule, in the order of the report", () => {
    expect(DEFAULT_FILTER).toEqual({
      severities: { error: true, warning: true, info: true },
      rule: "all",
    });
    expect(DEFAULT_SORT).toBe("report");
  });

  it("do not filter anything", () => {
    expect(isFiltered(DEFAULT_FILTER)).toBe(false);
    expect(applyFilterAndSort(issues, DEFAULT_FILTER, DEFAULT_SORT)).toEqual(issues);
  });
});

describe("isFiltered", () => {
  it("is true when a severity is switched off or a rule is chosen", () => {
    expect(
      isFiltered({ ...DEFAULT_FILTER, severities: { error: true, warning: false, info: true } }),
    ).toBe(true);
    expect(isFiltered({ ...DEFAULT_FILTER, rule: "normal.flipped" })).toBe(true);
  });
});

describe("filtering by severity", () => {
  const only = (error: boolean, warning: boolean, info: boolean): IssueFilter => ({
    severities: { error, warning, info },
    rule: "all",
  });

  it("keeps only the switched-on severities, in the original order", () => {
    expect(
      applyFilterAndSort(issues, only(true, false, false), "report").map((i) => i.rule),
    ).toEqual(["normal.flipped"]);
    expect(
      applyFilterAndSort(issues, only(false, true, false), "report").map((i) => i.rule),
    ).toEqual(["asset.external_uri", "mesh.boundary_edge", "mesh.boundary_edge", "uv.overlap"]);
    expect(
      applyFilterAndSort(issues, only(true, false, true), "report").map((i) => i.rule),
    ).toEqual(["normal.flipped", "uv.out_of_range"]);
  });

  it("shows nothing when every severity is switched off", () => {
    expect(applyFilterAndSort(issues, only(false, false, false), "report")).toEqual([]);
  });
});

describe("filtering by rule", () => {
  it("keeps only the issues of that rule", () => {
    const result = applyFilterAndSort(
      issues,
      { ...DEFAULT_FILTER, rule: "mesh.boundary_edge" },
      "report",
    );
    expect(result.map((i) => i.rule)).toEqual(["mesh.boundary_edge", "mesh.boundary_edge"]);
  });

  it("shows nothing for a rule that is not in the list", () => {
    expect(
      applyFilterAndSort(issues, { ...DEFAULT_FILTER, rule: "normal.missing" }, "report"),
    ).toEqual([]);
  });

  it("combines with the severity filter", () => {
    const filter: IssueFilter = {
      severities: { error: false, warning: true, info: true },
      rule: "uv.overlap",
    };
    expect(applyFilterAndSort(issues, filter, "report").map((i) => i.rule)).toEqual(["uv.overlap"]);
    expect(
      applyFilterAndSort(
        issues,
        { severities: { error: true, warning: false, info: false }, rule: "uv.overlap" },
        "report",
      ),
    ).toEqual([]);
  });
});

describe("sorting", () => {
  it("sorts by severity, errors first, and keeps the report order within a severity", () => {
    expect(
      applyFilterAndSort(issues, DEFAULT_FILTER, "severity").map((i) => `${i.severity}:${i.rule}`),
    ).toEqual([
      "error:normal.flipped",
      "warning:asset.external_uri",
      "warning:mesh.boundary_edge",
      "warning:mesh.boundary_edge",
      "warning:uv.overlap",
      "info:uv.out_of_range",
    ]);
  });

  it("sorts by rule in the order of the catalog, and keeps the report order within a rule", () => {
    const sorted = applyFilterAndSort(issues, DEFAULT_FILTER, "rule");
    expect(sorted.map((i) => i.rule)).toEqual([
      "normal.flipped",
      "mesh.boundary_edge",
      "mesh.boundary_edge",
      "uv.out_of_range",
      "uv.overlap",
      "asset.external_uri",
    ]);
    expect(
      sorted
        .filter((i) => i.rule === "mesh.boundary_edge")
        .map((i) => (i as { count: number }).count),
    ).toEqual([2, 1]);
  });

  it("sorts by the number of triangles, most first, and keeps the report order for equal counts", () => {
    expect(applyFilterAndSort(issues, DEFAULT_FILTER, "triangles").map((i) => i.count)).toEqual([
      8, 4, 3, 2, 1, 1,
    ]);
    const sorted = applyFilterAndSort(issues, DEFAULT_FILTER, "triangles");
    expect(sorted.slice(-2).map((i) => i.rule)).toEqual([
      "asset.external_uri",
      "mesh.boundary_edge",
    ]);
  });

  it("puts a rule it does not know after the known ones", () => {
    const unknown = triangle("future.rule", "info", 0, 0, 1);
    const sorted = applyFilterAndSort([unknown, ...issues], DEFAULT_FILTER, "rule");
    expect(sorted.at(-1)?.rule).toBe("future.rule");
  });

  it("filters first and then sorts", () => {
    const filter: IssueFilter = {
      severities: { error: true, warning: true, info: false },
      rule: "all",
    };
    expect(applyFilterAndSort(issues, filter, "triangles").map((i) => i.count)).toEqual([
      8, 4, 2, 1, 1,
    ]);
  });

  it("does not change the list it was given", () => {
    const copy = [...issues];
    applyFilterAndSort(issues, DEFAULT_FILTER, "triangles");
    applyFilterAndSort(issues, { ...DEFAULT_FILTER, rule: "uv.overlap" }, "severity");
    expect(issues).toEqual(copy);
  });
});

describe("issueKey", () => {
  it("is different for every issue of the list, and the same for the same issue", () => {
    expect(new Set(ids(issues)).size).toBe(issues.length);
    expect(issueKey(triangle("normal.flipped", "error", 0, 1, 8))).toBe(
      issueKey(issues[2] as Issue),
    );
  });

  it("tells apart two issues of one rule in one primitive that differ in severity", () => {
    const error = triangle("uv.overlap", "error", 0, 0, 2);
    const warning = triangle("uv.overlap", "warning", 0, 0, 2);
    expect(issueKey(error)).not.toBe(issueKey(warning));
  });
});

describe("ruleOptions", () => {
  it("lists each rule that appears, once, with how many issues it has, in the order of the catalog", () => {
    expect(ruleOptions(issues)).toEqual([
      { rule: "normal.flipped", count: 1 },
      { rule: "mesh.boundary_edge", count: 2 },
      { rule: "uv.out_of_range", count: 1 },
      { rule: "uv.overlap", count: 1 },
      { rule: "asset.external_uri", count: 1 },
    ]);
  });

  it("is empty for no issues", () => {
    expect(ruleOptions([])).toEqual([]);
  });
});
