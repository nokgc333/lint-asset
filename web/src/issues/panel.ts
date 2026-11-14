import type { Issue } from "../wasm/lint_core.mjs";
import { describeIssue, describeSummary, severityMark, summarizeIssues } from "./describe";
import { nextIndex } from "./list-navigation";

export function createIssuePanel({ onSelect }: { onSelect: (issue: Issue | null) => void }) {
  function required<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }

  const list = required<HTMLOListElement>("#issues-list");
  const summary = required<HTMLParagraphElement>("#issues-summary");
  const toggle = required<HTMLButtonElement>("#issues-toggle");
  const region = required<HTMLDivElement>("#issues-list-region");
  let expanded = window.innerWidth >= 1280;
  let rows: HTMLButtonElement[] = [];

  function updateExpanded(): void {
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Hide problems" : "Show problems";
    region.hidden = !expanded;
  }
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    updateExpanded();
  });
  updateExpanded();

  function setTabStop(index: number): void {
    rows.forEach((row, position) => {
      row.tabIndex = index === position ? 0 : -1;
    });
  }

  function select(index: number | null): void {
    rows.forEach((row, position) => {
      if (index === position) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    });
  }

  list.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    select(null);
    onSelect(null);
  });

  function setIssues(issues: readonly Issue[]): void {
    rows = [];
    list.replaceChildren();
    summary.textContent = describeSummary(summarizeIssues(issues));
    issues.forEach((issue, index) => {
      const description = describeIssue(issue);
      const mark = severityMark(issue.severity);
      const item = document.createElement("li");
      const row = document.createElement("button");
      row.type = "button";
      row.className = `issue-row severity-${issue.severity}`;
      row.setAttribute("aria-label", description.label);
      row.tabIndex = index === 0 ? 0 : -1;
      const namespace = "http://www.w3.org/2000/svg";
      const icon = document.createElementNS(namespace, "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("focusable", "false");
      icon.setAttribute("class", "issue-icon");
      const shape = document.createElementNS(
        namespace,
        mark.shape === "triangle" ? "polygon" : mark.shape === "square" ? "rect" : "circle",
      );
      const attributes: Record<string, string> =
        mark.shape === "circle"
          ? { cx: "12", cy: "12", r: "9" }
          : mark.shape === "triangle"
            ? { points: "12,2 23,22 1,22" }
            : { x: "3", y: "3", width: "18", height: "18" };
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      icon.append(shape);
      row.append(icon);
      const details: [string, string][] = [
        ["issue-severity", mark.label],
        ["issue-title", description.title ?? issue.rule],
        ["issue-detail", description.target],
        ["issue-detail", description.countText],
        ["issue-message", description.message],
      ];
      for (const [className, text] of details) {
        if (!text) continue;
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        row.append(span);
      }
      row.addEventListener("focus", () => setTabStop(index));
      row.addEventListener("click", () => {
        setTabStop(index);
        select(index);
        onSelect(issue);
      });
      row.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = nextIndex(index, event.key, rows.length);
        setTabStop(next);
        rows[next]?.focus();
      });
      rows.push(row);
      item.append(row);
      list.append(item);
    });
  }

  function clear(): void {
    setIssues([]);
    summary.textContent = "Open a GLB file to see problems.";
  }

  clear();
  return { setIssues, clear, select };
}
