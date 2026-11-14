import type { Locale } from "../i18n/locale";
import { createTranslator } from "../i18n/translate";
import { describeIssue, MAX_LISTED_TRIANGLES, severityMark } from "../issues/describe";
import type { Report } from "./build-report";

export const MARKDOWN_MAX_TRIANGLES = 20;

export function reportToMarkdown(report: Report, locale: Locale = "en"): string {
  const { t } = createTranslator(locale);
  const { summary, thresholds } = report;
  const lines = [
    `# ${t("report.title", { app: t("app.name"), name: escapeMarkdown(report.asset.name) })}`,
    "",
    `- ${t("report.generated", { time: report.generated_at })}`,
    `- ${t("report.tool", { name: report.tool.name, version: report.tool.version, schema: report.schema_version })}`,
    `- ${t("report.fileSize", { size: report.asset.size_bytes })}`,
    "",
    `## ${t("report.summary")}`,
    "",
    `| | ${t("report.count")} |`,
    "|---|---|",
    `| ${t("report.meshes")} | ${summary.meshes} |`,
    `| ${t("report.primitives")} | ${summary.primitives} |`,
    `| ${t("report.triangles")} | ${summary.triangles} |`,
    `| ${t("report.errors")} | ${summary.issues.error} |`,
    `| ${t("report.warnings")} | ${summary.issues.warning} |`,
    `| ${t("report.info")} | ${summary.issues.info} |`,
    "",
    `## ${t("report.limits")}`,
    "",
    `- ${t("report.triangleLimit", { max: thresholds.max_triangles })}`,
    `- ${t("report.extentLimit", { min: thresholds.min_extent_m, max: thresholds.max_extent_m })}`,
    "",
    `## ${t("report.problems")}`,
  ];
  if (report.issues.length === 0) lines.push("", t("report.none"));
  for (const issue of report.issues) {
    const description = describeIssue(issue, locale);
    lines.push(
      "",
      `### ${severityMark(issue.severity, locale).label}: ${description.title}`,
      "",
      `- ${t("report.where", { target: description.target })}`,
    );
    if (issue.element_kind === "triangle") {
      const numbers = issue.elements.slice(0, MARKDOWN_MAX_TRIANGLES).join(", ");
      const listing =
        issue.elements.length <= MARKDOWN_MAX_TRIANGLES
          ? numbers
          : t("report.truncated", {
              limit: MARKDOWN_MAX_TRIANGLES,
              numbers,
              max: MAX_LISTED_TRIANGLES,
            });
      lines.push(`- ${t("report.triangleList", { count: issue.count, listing })}`);
    }
    lines.push(`- ${t("report.rule", { rule: issue.rule })}`, `- ${description.message}`);
  }
  return `${lines.join("\n")}\n`;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()#|<>]/g, "\\$&");
}
