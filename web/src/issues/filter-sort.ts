import type { Issue } from "../wasm/lint_core.mjs";
import { type Severity, severityRank } from "./describe";

export const RULE_ORDER: readonly string[] = [
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
  "asset.external_uri",
];
export interface IssueFilter {
  severities: Record<Severity, boolean>;
  rule: string;
}
export type IssueSort = "report" | "severity" | "rule" | "triangles";
export const DEFAULT_FILTER: IssueFilter = {
  severities: { error: true, warning: true, info: true },
  rule: "all",
};
export const DEFAULT_SORT: IssueSort = "report";

function ruleRank(rule: string): number {
  const rank = RULE_ORDER.indexOf(rule);
  return rank < 0 ? RULE_ORDER.length : rank;
}

export function isFiltered(filter: IssueFilter): boolean {
  return filter.rule !== "all" || Object.values(filter.severities).some((on) => !on);
}

export function issueKey(issue: Issue): string {
  return JSON.stringify([
    issue.rule,
    issue.severity,
    issue.element_kind,
    ...(issue.element_kind === "triangle" ? [issue.target.mesh, issue.target.primitive] : []),
  ]);
}

export function applyFilterAndSort(
  issues: readonly Issue[],
  filter: IssueFilter,
  sort: IssueSort,
): Issue[] {
  function key(issue: Issue): number {
    switch (sort) {
      case "severity":
        return severityRank(issue.severity);
      case "rule":
        return ruleRank(issue.rule);
      case "triangles":
        return -issue.count;
      default:
        return 0;
    }
  }
  return issues
    .map((issue, index) => ({ issue, index }))
    .filter(
      ({ issue }) =>
        filter.severities[issue.severity] && (filter.rule === "all" || filter.rule === issue.rule),
    )
    .sort((a, b) => key(a.issue) - key(b.issue) || a.index - b.index)
    .map(({ issue }) => issue);
}

export function ruleOptions(issues: readonly Issue[]): { rule: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.rule, (counts.get(issue.rule) ?? 0) + 1);
  return [...counts]
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => ruleRank(a.rule) - ruleRank(b.rule));
}
