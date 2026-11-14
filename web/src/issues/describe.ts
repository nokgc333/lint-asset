import type { Issue } from "../wasm/lint_core.mjs";

export type Severity = Issue["severity"];
export const SEVERITIES = ["error", "warning", "info"] as const;
export const MAX_LISTED_TRIANGLES = 1000;
export type IssueCounts = Record<Severity, number>;

const numberFormat = new Intl.NumberFormat("en");
const RULE_TITLES: Record<string, string> = {
  "normal.flipped": "Flipped normals",
  "normal.missing": "Missing normals",
  "normal.unnormalized": "Normals not unit length",
  "mesh.nonmanifold_edge": "Non-manifold edges",
  "mesh.boundary_edge": "Open edges (holes)",
  "mesh.degenerate_triangle": "Degenerate triangles",
  "uv.missing": "Missing UVs",
  "uv.out_of_range": "UVs outside 0 to 1",
  "asset.triangle_count_exceeded": "Too many triangles",
  "asset.scale_too_small": "Model too small",
  "asset.scale_too_large": "Model too large",
};
const SEVERITY_MARKS = {
  error: { label: "Error", shape: "circle" },
  warning: { label: "Warning", shape: "triangle" },
  info: { label: "Info", shape: "square" },
} as const;

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

export function severityMark(severity: Severity): {
  label: "Error" | "Warning" | "Info";
  shape: "circle" | "triangle" | "square";
} {
  return SEVERITY_MARKS[severity];
}

export function describeIssue(issue: Issue) {
  const title = Object.hasOwn(RULE_TITLES, issue.rule) ? RULE_TITLES[issue.rule] : issue.rule;
  const target =
    issue.element_kind === "triangle"
      ? `Mesh ${numberFormat.format(issue.target.mesh)}, primitive ${numberFormat.format(issue.target.primitive)}`
      : "Whole asset";
  let countText = "";
  if (issue.element_kind === "triangle") {
    countText = `${numberFormat.format(issue.count)} ${issue.count === 1 ? "triangle" : "triangles"}`;
    if (issue.truncated) {
      countText += ` (first ${numberFormat.format(MAX_LISTED_TRIANGLES)} listed)`;
    }
  }
  const label = `${severityMark(issue.severity).label}: ${title}. ${target}.${countText ? ` ${countText}.` : ""}`;
  return { title, target, countText, severity: issue.severity, message: issue.message, label };
}

export function summarizeIssues(issues: readonly Issue[]): IssueCounts {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}

export function describeSummary(counts: IssueCounts): string {
  if (SEVERITIES.every((severity) => counts[severity] === 0)) return "No problems found";
  return SEVERITIES.map(
    (severity) =>
      `${numberFormat.format(counts[severity])} ${severity}${severity !== "info" && counts[severity] !== 1 ? "s" : ""}`,
  ).join(", ");
}
