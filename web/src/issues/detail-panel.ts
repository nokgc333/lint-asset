import type { Locale } from "../i18n/locale";
import { createTranslator } from "../i18n/translate";
import type { Issue } from "../wasm/lint_core.mjs";
import { describeIssue, MAX_LISTED_TRIANGLES, severityMark } from "./describe";
import { FIX_HINTS, hintKey, TOOL_NAMES, toolHintKey } from "./fix-hints";
import { createSeverityIcon } from "./severity-icon";

const MAX_DISPLAYED_TRIANGLES = 100;

export function createDetailPanel({ getLocale }: { getLocale: () => Locale }) {
  function required(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
  const title = required("#issue-detail-title");
  const empty = required("#issue-detail-empty");
  const content = required("#issue-detail-content");
  let selected: Issue | null = null;

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function refresh(): void {
    const locale = getLocale();
    const { t } = createTranslator(locale);
    const numbers = new Intl.NumberFormat(locale);
    title.textContent = t("detail.title");
    empty.textContent = t("detail.empty");
    content.replaceChildren();
    empty.hidden = selected !== null;
    content.hidden = selected === null;
    if (!selected) return;
    const issue = selected;
    const description = describeIssue(issue, locale);
    const mark = severityMark(issue.severity, locale);
    const severity = document.createElement("p");
    severity.className = `detail-severity severity-${issue.severity}`;
    severity.append(createSeverityIcon(mark.shape), element("span", mark.label));
    content.append(severity, element("h3", description.title), element("code", issue.rule));

    function section(key: string, text: string): void {
      content.append(element("h4", t(key)), element("p", text));
    }
    section("detail.where", description.target);
    if (description.countText) content.append(element("p", description.countText));
    section("detail.message", description.message);
    if (issue.element_kind === "triangle") {
      section("detail.triangles", issue.elements.slice(0, MAX_DISPLAYED_TRIANGLES).join(", "));
      if (issue.elements.length > MAX_DISPLAYED_TRIANGLES) {
        content.append(
          element(
            "p",
            t("detail.moreTriangles", {
              count: numbers.format(issue.elements.length - MAX_DISPLAYED_TRIANGLES),
            }),
          ),
        );
      }
      if (issue.truncated) {
        content.append(
          element(
            "p",
            t("detail.truncated", {
              limit: numbers.format(MAX_LISTED_TRIANGLES),
              total: numbers.format(issue.count),
            }),
          ),
        );
      }
      content.append(element("p", t("detail.triangleNote")));
    }
    if (!Object.hasOwn(FIX_HINTS, issue.rule)) return;
    for (const part of ["meaning", "why", "fix"] as const)
      section(`detail.${part}`, t(hintKey(issue.rule, part)));
    section("detail.tools", t("detail.toolNote"));
    for (const tool of FIX_HINTS[issue.rule] ?? []) {
      const guide = document.createElement("details");
      guide.append(
        element("summary", TOOL_NAMES[tool]),
        element("p", t(toolHintKey(issue.rule, tool))),
      );
      content.append(guide);
    }
  }

  function show(issue: Issue | null): void {
    selected = issue;
    refresh();
  }
  show(null);
  return { show, refresh };
}
