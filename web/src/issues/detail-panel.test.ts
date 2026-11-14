import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogs } from "../i18n/catalog";
import type { Locale } from "../i18n/locale";
import type { Issue } from "../wasm/lint_core.mjs";
import { createDetailPanel } from "./detail-panel";
import { FIX_HINTS, hintKey, TOOL_NAMES, toolHintKey } from "./fix-hints";
import { FIX_HINT_TEXTS_EN } from "./fix-hints-en";
import { FIX_HINT_TEXTS_JA } from "./fix-hints-ja";

class ElementStub {
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  textContent = "";
  className = "";
  hidden = false;
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
  all(): ElementStub[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
}

function setup(getLocale: () => Locale = () => "en") {
  const elements = new Map(
    ["issue-detail-title", "issue-detail-empty", "issue-detail-content"].map((id) => [
      `#${id}`,
      new ElementStub("div"),
    ]),
  );
  vi.stubGlobal("document", {
    querySelector: (selector: string) => elements.get(selector),
    createElement: (tag: string) => new ElementStub(tag),
    createElementNS: (_namespace: string, tag: string) => new ElementStub(tag),
  });
  const panel = createDetailPanel({ getLocale });
  const content = elements.get("#issue-detail-content") as ElementStub;
  const empty = elements.get("#issue-detail-empty") as ElementStub;
  const all = () => content.all();
  const texts = () => all().map((element) => element.textContent);
  const tags = (tag: string) => all().filter((element) => element.tagName === tag);
  return { panel, content, empty, all, texts, tags, elements };
}

const triangle: Issue = {
  rule: "normal.flipped",
  severity: "error",
  message: "Vertex normals point opposite to the face winding.",
  element_kind: "triangle",
  target: { mesh: 0, primitive: 1 },
  count: 3,
  elements: [9, 4, 5],
  truncated: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("detail panel", () => {
  it("starts empty and clears all selected content with null", () => {
    const { panel, empty, content } = setup();
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe(catalogs.en["detail.empty"]);
    expect(content.hidden).toBe(true);
    panel.show(triangle);
    expect(empty.hidden).toBe(true);
    expect(content.hidden).toBe(false);
    panel.show(null);
    expect(content.hidden).toBe(true);
    expect(content.children).toEqual([]);
    expect(empty.hidden).toBe(false);
  });

  it("shows the issue, ordered triangle numbers, sections and closed tool guides in catalog order", () => {
    const { panel, texts, tags } = setup();
    panel.show(triangle);
    expect(tags("h3").map((node) => node.textContent)).toEqual(["Flipped normals"]);
    expect(tags("code").map((node) => node.textContent)).toEqual([triangle.rule]);
    expect(texts()).toEqual(
      expect.arrayContaining([
        "Error",
        "Mesh 0, primitive 1",
        "3 triangles",
        triangle.message,
        "9, 4, 5",
        catalogs.en["detail.triangleNote"],
        catalogs.en["detail.toolNote"],
      ]),
    );
    expect(tags("svg")[0]?.attributes.get("aria-hidden")).toBe("true");
    expect(tags("circle")).toHaveLength(1);
    expect(tags("h4").map((node) => node.textContent)).toEqual([
      "Where",
      "Message",
      "Triangles",
      "What it means",
      "Why it matters",
      "How to fix",
      "In your tool",
    ]);
    for (const part of ["meaning", "why", "fix"] as const)
      expect(texts()).toContain(catalogs.en[hintKey(triangle.rule, part)]);
    const tools = FIX_HINTS[triangle.rule] ?? [];
    expect(tags("summary").map((node) => node.textContent)).toEqual(
      tools.map((tool) => TOOL_NAMES[tool]),
    );
    expect(tags("details")).toHaveLength(tools.length);
    for (const detail of tags("details")) expect(detail.attributes.has("open")).toBe(false);
    for (const tool of tools)
      expect(texts()).toContain(catalogs.en[toolHintKey(triangle.rule, tool)]);
  });

  it("shows a whole-asset location without triangle numbers or the triangle note", () => {
    const { panel, texts, tags } = setup();
    panel.show({
      rule: "asset.scale_too_large",
      severity: "warning",
      message: "Too large",
      element_kind: "asset",
      count: 1,
      elements: [],
      truncated: false,
    });
    expect(texts()).toContain("Whole asset");
    expect(tags("h4").map((node) => node.textContent)).not.toContain("Triangles");
    expect(texts()).not.toContain(catalogs.en["detail.triangleNote"]);
    expect(tags("polygon")).toHaveLength(1);
  });

  it("limits displayed numbers to 100 and distinguishes undisplayed entries from report truncation", () => {
    const { panel, texts } = setup();
    panel.show({
      ...triangle,
      count: 2500,
      elements: Array.from({ length: 150 }, (_, i) => i),
      truncated: true,
    });
    expect(texts()).toContain(Array.from({ length: 100 }, (_, i) => i).join(", "));
    expect(texts()).toContain("and 50 more");
    expect(texts()).toContain("The report lists at most 1,000 of 2,500 triangles.");
    panel.show(triangle);
    expect(texts().some((text) => text.startsWith("and "))).toBe(false);
    expect(texts().some((text) => text.startsWith("The report lists"))).toBe(false);
  });

  it.each(["future.rule", "constructor", "__proto__"])(
    "shows only generic information for %s",
    (rule) => {
      const { panel, tags, texts } = setup();
      expect(() => panel.show({ ...triangle, rule })).not.toThrow();
      expect(texts()).toContain(rule);
      expect(texts()).toContain(triangle.message);
      expect(tags("details")).toHaveLength(0);
      expect(tags("h4").map((node) => node.textContent)).not.toContain("How to fix");
    },
  );

  it("refreshes the language while keeping the issue, and translates the empty state too", () => {
    let locale: Locale = "en";
    const { panel, texts, empty, elements } = setup(() => locale);
    panel.show(triangle);
    locale = "ja";
    panel.refresh();
    expect(texts()).toContain("反転した法線");
    expect(texts()).toContain("メッシュ 0・プリミティブ 1");
    expect(texts()).toContain("9, 4, 5");
    expect(elements.get("#issue-detail-title")?.textContent).toBe("詳細");
    expect(texts()).toContain(catalogs.ja[hintKey(triangle.rule, "fix")]);
    panel.show(null);
    expect(empty.textContent).toBe(catalogs.ja["detail.empty"]);
  });

  it("puts untrusted rules and messages only in text nodes", () => {
    const { panel, texts, all } = setup();
    panel.show({ ...triangle, rule: "<script>bad</script>", message: "<img src=x>" });
    expect(texts()).toContain("<img src=x>");
    expect(texts()).toContain("<script>bad</script>");
    expect(all().some((element) => ["img", "script"].includes(element.tagName))).toBe(false);
    expect(all().some((element) => element.attributes.has("src"))).toBe(false);
  });

  it("renders every golden issue in both languages", () => {
    const directory = new URL("../../../tests/golden/", import.meta.url);
    const issues = readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as Issue[]);
    expect(issues.length).toBeGreaterThan(20);
    for (const locale of ["en", "ja"] as const) {
      const { panel, texts } = setup(() => locale);
      for (const issue of issues) {
        expect(() => panel.show(issue), `${locale} ${issue.rule}`).not.toThrow();
        expect(texts()).toContain(issue.rule);
        expect(texts()).toContain(catalogs[locale][hintKey(issue.rule, "fix")]);
      }
    }
  });

  it("keeps exactly the English hint keys in the Japanese module", () => {
    expect(Object.keys(FIX_HINT_TEXTS_JA).sort()).toEqual(Object.keys(FIX_HINT_TEXTS_EN).sort());
  });
});
