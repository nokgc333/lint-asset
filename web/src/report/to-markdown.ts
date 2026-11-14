import { describeIssue, MAX_LISTED_TRIANGLES, severityMark } from "../issues/describe";
import type { Report } from "./build-report";

export const MARKDOWN_MAX_TRIANGLES = 20;

export function reportToMarkdown(report: Report): string {
  const { summary, thresholds } = report;
  const lines = [
    `# lint-asset report: ${escapeMarkdown(report.asset.name)}`,
    "",
    `- Generated: ${report.generated_at} (UTC)`,
    `- Tool: ${report.tool.name} ${report.tool.version} (report format ${report.schema_version})`,
    `- File size: ${report.asset.size_bytes} bytes`,
    "",
    "## Summary",
    "",
    "| | Count |",
    "|---|---|",
    `| Meshes | ${summary.meshes} |`,
    `| Primitives | ${summary.primitives} |`,
    `| Triangles | ${summary.triangles} |`,
    `| Errors | ${summary.issues.error} |`,
    `| Warnings | ${summary.issues.warning} |`,
    `| Info | ${summary.issues.info} |`,
    "",
    "## Limits used",
    "",
    `- Triangles drawn: at most ${thresholds.max_triangles}`,
    `- Longest side: from ${thresholds.min_extent_m} m to ${thresholds.max_extent_m} m`,
    "",
    "## Problems",
  ];
  if (report.issues.length === 0) lines.push("", "No problems found.");
  for (const issue of report.issues) {
    const description = describeIssue(issue);
    lines.push(
      "",
      `### ${severityMark(issue.severity).label}: ${description.title}`,
      "",
      `- Where: ${description.target}`,
    );
    if (issue.element_kind === "triangle") {
      const numbers = issue.elements.slice(0, MARKDOWN_MAX_TRIANGLES).join(", ");
      const listing =
        issue.elements.length <= MARKDOWN_MAX_TRIANGLES
          ? numbers
          : `first ${MARKDOWN_MAX_TRIANGLES}: ${numbers}; the JSON file lists up to ${MAX_LISTED_TRIANGLES}`;
      lines.push(`- Triangles: ${issue.count} (${listing})`);
    }
    lines.push(`- Rule: \`${issue.rule}\``, `- ${issue.message}`);
  }
  return `${lines.join("\n")}\n`;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()#|<>]/g, "\\$&");
}
