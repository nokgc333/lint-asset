import { catalogs } from "../i18n/catalog";
import type { Locale } from "../i18n/locale";
import { createTextSlot } from "../i18n/text-slot";
import { createTranslator } from "../i18n/translate";
import type { Issue } from "../wasm/lint_core.mjs";
import {
  describeIssue,
  describeSummary,
  SEVERITIES,
  severityMark,
  summarizeIssues,
} from "./describe";
import {
  applyFilterAndSort,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  type IssueFilter,
  type IssueSort,
  isFiltered,
  issueKey,
  ruleOptions,
} from "./filter-sort";
import { nextIndex } from "./list-navigation";
import { createSeverityIcon } from "./severity-icon";

export function createIssuePanel({
  onSelect,
  onVisibleChange = () => {},
  getLocale = () => "en",
}: {
  onSelect: (issue: Issue | null) => void;
  onVisibleChange?: (visible: readonly Issue[]) => void;
  getLocale?: () => Locale;
}) {
  function required<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }

  const list = required<HTMLOListElement>("#issues-list");
  const summary = createTextSlot(required<HTMLParagraphElement>("#issues-summary"), getLocale);
  const toggle = required<HTMLButtonElement>("#issues-toggle");
  const region = required<HTMLDivElement>("#issues-list-region");
  const controls = required<HTMLDivElement>("#issues-filters");
  const rule = required<HTMLSelectElement>("#issues-rule");
  const sort = required<HTMLSelectElement>("#issues-sort");
  const clearButton = required<HTMLButtonElement>("#issues-clear");
  const emptyClear = required<HTMLButtonElement>("#issues-none-clear");
  const empty = required<HTMLDivElement>("#issues-none");
  const shown = required<HTMLParagraphElement>("#issues-shown");
  const severityInputs = SEVERITIES.map((severity) =>
    required<HTMLInputElement>(`#issues-${severity}`),
  );
  let filter: IssueFilter = { ...DEFAULT_FILTER, severities: { ...DEFAULT_FILTER.severities } };
  let order: IssueSort = DEFAULT_SORT;
  let visible: readonly Issue[] = [];
  let expanded = window.innerWidth >= 1280;
  let rows: HTMLButtonElement[] = [];
  let currentIssues: readonly Issue[] = [];
  let selected: string | null = null;
  let tabStop = 0;

  function updateExpanded(): void {
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = createTranslator(getLocale()).t(expanded ? "panel.hide" : "panel.show");
    region.hidden = !expanded;
  }
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    updateExpanded();
  });
  updateExpanded();

  function setTabStop(index: number): void {
    tabStop = index;
    rows.forEach((row, position) => {
      row.tabIndex = index === position ? 0 : -1;
    });
  }

  function select(index: number | null): void {
    selected = index === null || !visible[index] ? null : issueKey(visible[index]);
    rows.forEach((row, position) => {
      if (selected !== null && visible[position] && selected === issueKey(visible[position]))
        row.setAttribute("aria-current", "true");
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
    currentIssues = issues;
    selected = null;
    tabStop = 0;
    summary.set((locale) => describeSummary(summarizeIssues(issues), locale));
    if (!ruleOptions(issues).some((option) => option.rule === filter.rule)) filter.rule = "all";
    updateVisible(true);
  }

  function updateControls(rebuildOptions = false): void {
    const { t, plural } = createTranslator(getLocale());
    const numbers = new Intl.NumberFormat(getLocale());
    const counts = summarizeIssues(currentIssues);
    controls.hidden = currentIssues.length === 0;
    SEVERITIES.forEach((severity, index) => {
      const input = severityInputs[index];
      if (input) input.checked = filter.severities[severity];
      required(`#issues-${severity}-label`).textContent = t("issues.filter.severityLabel", {
        severity: severityMark(severity, getLocale()).label,
        count: numbers.format(counts[severity]),
      });
    });
    required("#issues-severity-legend").textContent = t("issues.filter.severity");
    required("#issues-rule-label").textContent = t("issues.filter.rule");
    required("#issues-sort-label").textContent = t("issues.sort.label");
    if (rebuildOptions) {
      rule.replaceChildren();
      function option(value: string, text: string): void {
        const node = document.createElement("option");
        node.value = value;
        node.textContent = text;
        rule.append(node);
      }
      option("all", t("issues.filter.allRules", { count: numbers.format(currentIssues.length) }));
      for (const { rule: id, count } of ruleOptions(currentIssues)) {
        const key = `rules.${id}.title`;
        option(
          id,
          t("issues.filter.ruleOption", {
            title: Object.hasOwn(catalogs.en, key) ? t(key) : id,
            count: numbers.format(count),
          }),
        );
      }
      sort.replaceChildren();
      for (const value of ["report", "severity", "rule", "triangles"] as const) {
        const node = document.createElement("option");
        node.value = value;
        node.textContent = t(`issues.sort.${value}`);
        sort.append(node);
      }
    }
    rule.value = filter.rule;
    sort.value = order;
    clearButton.textContent = t("issues.filter.clear");
    emptyClear.textContent = t("issues.filter.clear");
    clearButton.disabled = !isFiltered(filter);
    empty.hidden = currentIssues.length === 0 || visible.length !== 0;
    required("#issues-none-text").textContent = t("issues.none.filtered");
    shown.hidden = currentIssues.length === 0;
    shown.textContent = plural("issues.shown", currentIssues.length, {
      shown: numbers.format(visible.length),
      total: numbers.format(currentIssues.length),
    });
  }

  function updateVisible(rebuildOptions = false): void {
    visible = applyFilterAndSort(currentIssues, filter, order);
    if (selected !== null && !visible.some((issue) => issueKey(issue) === selected)) {
      selected = null;
      onSelect(null);
    }
    tabStop = Math.min(tabStop, Math.max(0, visible.length - 1));
    renderRows();
    updateControls(rebuildOptions);
    onVisibleChange(visible);
  }

  SEVERITIES.forEach((severity, index) => {
    severityInputs[index]?.addEventListener("change", () => {
      filter.severities[severity] = severityInputs[index]?.checked ?? false;
      updateVisible();
    });
  });
  rule.addEventListener("change", () => {
    filter.rule = rule.value;
    updateVisible();
  });
  sort.addEventListener("change", () => {
    order = sort.value as IssueSort;
    updateVisible();
  });
  function clearFilters(): void {
    filter = { ...DEFAULT_FILTER, severities: { ...DEFAULT_FILTER.severities } };
    updateVisible();
    severityInputs[0]?.focus();
  }
  clearButton.addEventListener("click", clearFilters);
  emptyClear.addEventListener("click", clearFilters);

  function renderRows(): void {
    rows = [];
    list.replaceChildren();
    visible.forEach((issue, index) => {
      const description = describeIssue(issue, getLocale());
      const mark = severityMark(issue.severity, getLocale());
      const item = document.createElement("li");
      const row = document.createElement("button");
      row.type = "button";
      row.className = `issue-row severity-${issue.severity}`;
      row.tabIndex = index === tabStop ? 0 : -1;
      if (issueKey(issue) === selected) row.setAttribute("aria-current", "true");
      row.append(createSeverityIcon(mark.shape));
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
    summary.set((locale) => createTranslator(locale).t("panel.empty"));
  }

  function refresh(): void {
    const focused = rows.indexOf(document.activeElement as HTMLButtonElement);
    const previousTabStop = tabStop;
    renderRows();
    setTabStop(previousTabStop);
    if (focused >= 0) rows[focused]?.focus();
    updateExpanded();
    summary.refresh();
    updateControls(true);
  }

  clear();
  return { setIssues, clear, select, refresh };
}
