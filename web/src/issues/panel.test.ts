import { afterEach, describe, expect, it, vi } from "vitest";
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
    this.focused = true;
    this.fire("focus");
  }
  fire(name: string, key = "") {
    this.listeners.get(name)?.({ key, preventDefault() {} });
  }
}

function setup(width = 1280) {
  const elements = new Map(
    ["issues-list", "issues-summary", "issues-toggle", "issues-list-region"].map((id) => [
      `#${id}`,
      new ElementStub("div"),
    ]),
  );
  vi.stubGlobal("document", {
    querySelector: (selector: string) => elements.get(selector),
    createElement: (tag: string) => new ElementStub(tag),
    createElementNS: (_namespace: string, tag: string) => new ElementStub(tag),
  });
  vi.stubGlobal("window", { innerWidth: width });
  const onSelect = vi.fn();
  const panel = createIssuePanel({ onSelect });
  const list = elements.get("#issues-list") as ElementStub;
  const rows = () => list.children.map((li) => li.children[0] as ElementStub);
  return { panel, onSelect, rows, list, elements };
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
    expect(rows()[0]?.attributes.get("aria-label")).toContain("<img src=x>");
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
    expect(elements.get("#issues-summary")?.textContent).toBe("Open a GLB file to see problems.");
  });
});
