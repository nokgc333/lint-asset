import { catalogs } from "../i18n/catalog";
import type { Locale } from "../i18n/locale";
import { createTranslator } from "../i18n/translate";
import type { Issue } from "../wasm/lint_core.mjs";
import { localizeIssueMessage } from "./localize";

export type Severity = Issue["severity"];
export const SEVERITIES = ["error", "warning", "info"] as const;
export const MAX_LISTED_TRIANGLES = 1000;
export type IssueCounts = Record<Severity, number>;

const SEVERITY_SHAPES = {
  error: "circle",
  warning: "triangle",
  info: "square",
} as const;

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

export function severityMark(
  severity: Severity,
  locale: Locale = "en",
): {
  label: string;
  shape: "circle" | "triangle" | "square";
} {
  return {
    label: createTranslator(locale).t(`severity.${severity}`),
    shape: SEVERITY_SHAPES[severity],
  };
}

export function describeIssue(issue: Issue, locale: Locale = "en") {
  const { t, plural } = createTranslator(locale);
  const numbers = new Intl.NumberFormat(locale);
  const titleKey = `rules.${issue.rule}.title`;
  const title = Object.hasOwn(catalogs.en, titleKey) ? t(titleKey) : issue.rule;
  const target =
    issue.element_kind === "triangle"
      ? t("issues.target", {
          mesh: numbers.format(issue.target.mesh),
          primitive: numbers.format(issue.target.primitive),
        })
      : t("issues.wholeAsset");
  let countText = "";
  if (issue.element_kind === "triangle") {
    countText = plural("issues.triangles", issue.count);
    if (issue.truncated) {
      countText = t("issues.truncated", {
        triangles: countText,
        limit: numbers.format(MAX_LISTED_TRIANGLES),
      });
    }
  }
  const sentences = [`${severityMark(issue.severity, locale).label}: ${title}`, target];
  if (countText) sentences.push(countText);
  const separator = locale === "ja" ? "。" : ". ";
  const label = sentences.join(separator) + (locale === "ja" ? "。" : ".");
  const message = localizeIssueMessage(issue.rule, issue.message, locale);
  return { title, target, countText, severity: issue.severity, message, label };
}

export function summarizeIssues(issues: readonly Issue[]): IssueCounts {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}

export function describeSummary(counts: IssueCounts, locale: Locale = "en"): string {
  const { t, plural } = createTranslator(locale);
  if (SEVERITIES.every((severity) => counts[severity] === 0)) return t("issues.none");
  return SEVERITIES.map((severity) => plural(`issues.summary.${severity}`, counts[severity])).join(
    locale === "ja" ? "、" : ", ",
  );
}
