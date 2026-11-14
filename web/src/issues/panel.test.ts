import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReport } from "../report/build-report";
import { reportToJson } from "../report/to-json";
import { reportToMarkdown } from "../report/to-markdown";
import type { Issue } from "../wasm/lint_core.mjs";
import { createIssuePanel } from "./panel";

class ElementStub {
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: { key: string; preventDefault(): void }) => void>();
  textContent = "";
  className = "";
  tabIndex = -1;
  hidden = false;
  checked = true;
  disabled = false;
  value = "";
  focused = false;
  constructor(readonly tagName: string) {}
  append(...children: ElementStub[]) {
    this.children.push(...children);
  }
  replaceChildren(...children: ElementStub[]) {
    this.children = children;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  addEventListener(
    name: string,
    listener: (event: { key: string; preventDefault(): void }) => void,
  ) {
    this.listeners.set(name, listener);
  }
  focus() {
    Object.assign(document, { activeElement: this });
    this.focused = true;
    this.fire("focus");
  }
  fire(name: string, key = "") {
    this.listeners.get(name)?.({ key, preventDefault() {} });
  }
}

function setup(width = 1280, getLocale: () => "en" | "ja" = () => "en") {
  const elements = new Map(
    [
      "issues-list",
      "issues-summary",
      "issues-toggle",
      "issues-list-region",
      "issues-filters",
      "issues-rule",
      "issues-sort",
      "issues-clear",
      "issues-none-clear",
      "issues-none",
      "issues-none-text",
      "issues-shown",
      "issues-severity-legend",
      "issues-rule-label",
      "issues-sort-label",
      ...["error", "warning", "info"].flatMap((severity) => [
        `issues-${severity}`,
        `issues-${severity}-label`,
      ]),
    ].map((id) => [`#${id}`, new ElementStub("div")]),
  );
  vi.stubGlobal("document", {
    querySelector: (selector: string) => elements.get(selector),
    createElement: (tag: string) => new ElementStub(tag),
    createElementNS: (_namespace: string, tag: string) => new ElementStub(tag),
  });
  vi.stubGlobal("window", { innerWidth: width });
  const onSelect = vi.fn();
  const onVisibleChange = vi.fn();
  const panel = createIssuePanel({ onSelect, getLocale, onVisibleChange });
  const list = elements.get("#issues-list") as ElementStub;
  const rows = () => list.children.map((li) => li.children[0] as ElementStub);
  return { panel, onSelect, onVisibleChange, rows, list, elements };
}
const issues: Issue[] = ["error", "warning", "info"].map((severity) => ({
  rule: "<img src=x>",
  severity: severity as Issue["severity"],
  message: "<script>untrusted</script>",
  element_kind: "asset",
  count: 1,
  elements: [],
  truncated: false,
}));

afterEach(() => vi.unstubAllGlobals());

describe("problem panel", () => {
  it("refreshes translated rows while preserving selection, focus and the tab stop", () => {
    let locale: "en" | "ja" = "en";
    const { panel, rows, elements } = setup(1280, () => locale);
    panel.setIssues(issues);
    rows()[1]?.fire("click");
    rows()[2]?.focus();
    locale = "ja";
    panel.refresh();
    expect(rows()[1]?.attributes.get("aria-current")).toBe("true");
    expect(rows().map((row) => row.tabIndex)).toEqual([-1, -1, 0]);
    expect(document.activeElement).toBe(rows()[2]);
    expect(elements.get("#issues-summary")?.textContent).toContain("警告");
    expect(elements.get("#issues-toggle")?.textContent).toContain("問題");
  });
  it("refreshes the empty prompt without moving focus outside the panel", () => {
    let locale: "en" | "ja" = "en";
    const { panel, elements } = setup(1100, () => locale);
    const outside = new ElementStub("button");
    outside.focus();
    locale = "ja";
    panel.refresh();
    expect(document.activeElement).toBe(outside);
    expect(elements.get("#issues-summary")?.textContent).toContain("GLB");
    expect(elements.get("#issues-summary")?.textContent).not.toContain("Open a GLB");
    expect(elements.get("#issues-list-region")?.hidden).toBe(true);
  });
  it("builds native rows with text, distinct shapes, and one tab stop", () => {
    const { panel, rows, elements } = setup();
    panel.setIssues(issues);
    expect(rows().map((row) => row.tagName)).toEqual(["button", "button", "button"]);
    expect(rows().map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    expect(rows().map((row) => row.children[0]?.children[0]?.tagName)).toEqual([
      "circle",
      "polygon",
      "rect",
    ]);
    // The name of a row is its visible text (WCAG 2.5.3): there is no separate aria-label.
    expect(rows()[0]?.attributes.has("aria-label")).toBe(false);
    expect(rows()[0]?.children.map((child) => child.textContent)).toContain("<img src=x>");
    expect(rows()[0]?.children.at(-1)?.textContent).toBe("<script>untrusted</script>");
    expect(elements.get("#issues-list-region")?.hidden).toBe(false);
    panel.select(1);
    expect(rows()[1]?.attributes.get("aria-current")).toBe("true");
    panel.setIssues(issues);
    expect(rows().every((row) => !row.attributes.has("aria-current"))).toBe(true);
    expect(elements.get("#issues-summary")?.textContent).toBe("1 error, 1 warning, 1 info");
  });
  it("moves focus without selection, selects on click, and clears with Escape", () => {
    const { panel, rows, onSelect, list } = setup();
    panel.setIssues(issues);
    rows()[0]?.fire("keydown", "End");
    expect(rows().map((row) => row.tabIndex)).toEqual([-1, -1, 0]);
    expect(rows()[2]?.focused).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    rows()[2]?.fire("click");
    rows()[2]?.fire("click");
    expect(onSelect).toHaveBeenLastCalledWith(issues[2]);
    expect(rows()[2]?.attributes.get("aria-current")).toBe("true");
    list.fire("keydown", "Escape");
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(rows()[2]?.attributes.has("aria-current")).toBe(false);
    panel.setIssues([]);
    expect(rows()).toHaveLength(0);
  });
  it("decides expansion once and lets the toggle override it", () => {
    const { elements, panel } = setup(1100);
    const region = elements.get("#issues-list-region") as ElementStub;
    const toggle = elements.get("#issues-toggle") as ElementStub;
    expect(region.hidden).toBe(true);
    expect(toggle.attributes.get("aria-expanded")).toBe("false");
    toggle.fire("click");
    expect(region.hidden).toBe(false);
    expect(toggle.textContent).toBe("Hide problems");
    panel.setIssues([]);
    expect(region.hidden).toBe(false);
    expect(elements.get("#issues-summary")?.textContent).toBe("No problems found");
    panel.clear();
    expect(elements.get("#issues-summary")?.textContent).toBe(
      "Open GLB or glTF to see problems. Select a .gltf together with all its .bin and image files, or drop its folder.",
    );
  });
});

describe("problem filters", () => {
  it("counts all issues, filters severities, and notifies without moving control focus", () => {
    const { panel, elements, rows, onVisibleChange, onSelect } = setup();
    panel.setIssues(issues);
    expect(onVisibleChange).toHaveBeenLastCalledWith(issues);
    expect(elements.get("#issues-error-label")?.textContent).toBe("Error (1)");
    expect(elements.get("#issues-shown")?.textContent).toBe("Showing 3 of 3 problems");
    rows()[0]?.fire("click");
    const error = elements.get("#issues-error") as ElementStub;
    error.focus();
    error.checked = false;
    error.fire("change");
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(error);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(onVisibleChange).toHaveBeenLastCalledWith(issues.slice(1));
    expect(elements.get("#issues-shown")?.textContent).toBe("Showing 2 of 3 problems");
    expect(elements.get("#issues-summary")?.textContent).toBe("1 error, 1 warning, 1 info");
    expect(elements.get("#issues-clear")?.disabled).toBe(false);
    rows()[0]?.fire("keydown", "End");
    expect(document.activeElement).toBe(rows()[1]);
    expect(rows().map((row) => row.tabIndex)).toEqual([-1, 0]);
  });

  it("shows an empty state and clears filters with a useful focus destination", () => {
    const { panel, elements, rows } = setup();
    panel.setIssues(issues);
    for (const severity of ["error", "warning", "info"]) {
      const input = elements.get(`#issues-${severity}`) as ElementStub;
      input.checked = false;
      input.fire("change");
    }
    expect(rows()).toHaveLength(0);
    expect(elements.get("#issues-none")?.hidden).toBe(false);
    elements.get("#issues-none-clear")?.fire("click");
    expect(rows()).toHaveLength(3);
    expect(elements.get("#issues-none")?.hidden).toBe(true);
    expect(elements.get("#issues-clear")?.disabled).toBe(true);
    expect(document.activeElement).toBe(elements.get("#issues-error"));
    panel.setIssues([]);
    expect(elements.get("#issues-filters")?.hidden).toBe(true);
    expect(elements.get("#issues-shown")?.hidden).toBe(true);
    expect(elements.get("#issues-none")?.hidden).toBe(true);
  });

  it("sorts visible rows and retains selection by key", () => {
    const { panel, rows, elements, onSelect, onVisibleChange } = setup();
    const source = [issues[2], issues[1], issues[0]] as Issue[];
    panel.setIssues(source);
    rows()[0]?.fire("click");
    const sort = elements.get("#issues-sort") as ElementStub;
    sort.value = "severity";
    sort.fire("change");
    expect(onVisibleChange).toHaveBeenLastCalledWith([...issues]);
    expect(rows()[2]?.attributes.get("aria-current")).toBe("true");
    expect(onSelect).toHaveBeenCalledTimes(1);
    const error = elements.get("#issues-error") as ElementStub;
    error.checked = false;
    error.fire("change");
    expect(rows()[1]?.attributes.get("aria-current")).toBe("true");
  });

  it("keeps severity and sort across files, resets an absent rule, and translates state", () => {
    let locale: "en" | "ja" = "en";
    const { panel, elements, rows, onVisibleChange } = setup(1280, () => locale);
    const source = issues.map((issue, index) => ({
      ...issue,
      rule: ["uv.overlap", "mesh.boundary_edge", "uv.overlap"][index] as string,
    }));
    panel.setIssues(source);
    const rule = elements.get("#issues-rule") as ElementStub;
    expect(rule.children.map((option) => option.textContent)).toEqual([
      "All rules (3)",
      "Open edges (holes) (1)",
      "Overlapping UVs (2)",
    ]);
    rule.value = "uv.overlap";
    rule.fire("change");
    expect(rows()).toHaveLength(2);
    const sort = elements.get("#issues-sort") as ElementStub;
    sort.value = "triangles";
    sort.fire("change");
    const warning = elements.get("#issues-warning") as ElementStub;
    warning.checked = false;
    warning.fire("change");
    rule.focus();
    locale = "ja";
    panel.refresh();
    expect(rule.value).toBe("uv.overlap");
    expect(document.activeElement).toBe(rule);
    expect(elements.get("#issues-shown")?.textContent).toContain("2");
    panel.setIssues(source);
    expect(rule.value).toBe("uv.overlap");
    panel.setIssues(issues);
    expect(rule.value).toBe("all");
    expect(warning.checked).toBe(false);
    expect(sort.value).toBe("triangles");
    expect(onVisibleChange).toHaveBeenLastCalledWith([issues[0], issues[2]]);
  });
});

it("builds full JSON and Markdown reports while the panel is filtered", () => {
  const { panel, elements, rows } = setup();
  const source = {
    fileName: "model.glb",
    fileSize: 1,
    toolVersion: "1.0.0",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    result: {
      meshes: 1,
      primitives: 1,
      triangles: 1,
      issues,
      thresholds: { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 },
    },
  };
  const before = buildReport(source);
  panel.setIssues(issues);
  const error = elements.get("#issues-error") as ElementStub;
  error.checked = false;
  error.fire("change");
  expect(rows()).toHaveLength(2);
  expect(buildReport(source)).toEqual(before);
  expect(reportToJson(buildReport(source))).toBe(reportToJson(before));
  expect(reportToMarkdown(buildReport(source), "en")).toBe(reportToMarkdown(before, "en"));
});

it("applies each sort option to the rendered rows and counts rule options over all issues", () => {
  const { panel, elements, rows } = setup();
  const source: Issue[] = [
    { ...issues[1], rule: "asset.external_uri", count: 1 } as Issue,
    {
      ...issues[2],
      rule: "uv.overlap",
      element_kind: "triangle",
      target: { mesh: 0, primitive: 0 },
      count: 9,
      elements: [0],
    } as Issue,
    {
      ...issues[0],
      rule: "normal.flipped",
      element_kind: "triangle",
      target: { mesh: 0, primitive: 0 },
      count: 2,
      elements: [0],
    } as Issue,
  ];
  panel.setIssues(source);
  const titles = () =>
    rows().map(
      (row) => row.children.find((child) => child.className === "issue-title")?.textContent,
    );
  const sort = elements.get("#issues-sort") as ElementStub;
  expect(sort.children.map((option) => option.value)).toEqual([
    "report",
    "severity",
    "rule",
    "triangles",
  ]);
  for (const [value, expected] of [
    ["severity", ["Flipped normals", "External image references", "Overlapping UVs"]],
    ["rule", ["Flipped normals", "Overlapping UVs", "External image references"]],
    ["triangles", ["Overlapping UVs", "Flipped normals", "External image references"]],
    ["report", ["External image references", "Overlapping UVs", "Flipped normals"]],
  ] as const) {
    sort.value = value;
    sort.focus();
    sort.fire("change");
    expect(titles()).toEqual(expected);
    expect(document.activeElement).toBe(sort);
    expect(elements.get("#issues-clear")?.disabled).toBe(true);
  }
  const warning = elements.get("#issues-warning") as ElementStub;
  warning.checked = false;
  warning.fire("change");
  expect(elements.get("#issues-rule")?.children[0]?.textContent).toBe("All rules (3)");
  expect(elements.get("#issues-rule")?.children).toHaveLength(4);
  expect(elements.get("#issues-warning-label")?.textContent).toBe("Warning (1)");
});

it("uses the singular shown status for one issue and keeps selection and row focus on translation", () => {
  let locale: "en" | "ja" = "en";
  const { panel, elements, rows } = setup(1280, () => locale);
  panel.setIssues([issues[0] as Issue]);
  expect(elements.get("#issues-shown")?.textContent).toBe("Showing 1 of 1 problem");
  const info = elements.get("#issues-info") as ElementStub;
  info.checked = false;
  info.fire("change");
  rows()[0]?.fire("click");
  rows()[0]?.focus();
  locale = "ja";
  panel.refresh();
  expect(info.checked).toBe(false);
  expect(rows()[0]?.attributes.get("aria-current")).toBe("true");
  expect(document.activeElement).toBe(rows()[0]);
});
