import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The parts of accessibility (§7.8) that can be checked in the HTML text itself. The full check,
// with axe and real key presses in a browser, is `npm run audit:a11y` (scripts/audit-accessibility.mjs).
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function tags(name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((match) => match[0]);
}

const attribute = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

describe("the page's markup", () => {
  it("has a language and a title", () => {
    expect(html).toMatch(/<html lang="[a-z]{2}"/);
    expect(html).toMatch(/<title[^>]*>[^<]+<\/title>/);
  });

  it("has no two elements with the same id", () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicated).toEqual([]);
  });

  it("points every aria-labelledby and aria-describedby at an element that exists", () => {
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    for (const match of html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) {
      for (const id of (match[1] ?? "").split(/\s+/)) expect(ids.has(id), id).toBe(true);
    }
  });

  it("names every dialog", () => {
    const dialogs = tags("dialog");
    expect(dialogs.length).toBeGreaterThan(2);
    for (const dialog of dialogs)
      expect(attribute(dialog, "aria-labelledby"), dialog).toBeDefined();
  });

  it("gives the unsupported-environment guide its own main landmark and a level-one heading", () => {
    expect(html).toMatch(/<main id="unsupported"[^>]*>\s*<h1 id="unsupported-title"/);
    expect(html).toMatch(/<main id="app"/);
  });

  it("starts with the guide and the app hidden, so only one main landmark is ever shown", () => {
    for (const id of ["unsupported", "app"]) {
      const main = tags("main").find((tag) => tag.includes(`id="${id}"`)) ?? "";
      expect(/\shidden[\s>]/.test(main), id).toBe(true);
    }
  });

  it("gives every form control a visible label or an aria-label", () => {
    const labelled = new Set(
      [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((match) => match[1]),
    );
    // A control written inside its <label>: <label ...><input ...> or <label><input ...>text</label>.
    const wrapped = [...html.matchAll(/<label\b[^>]*>\s*(<input\b[^>]*>)/g)].map(
      (match) => match[1],
    );
    for (const input of tags("input")) {
      const id = attribute(input, "id");
      expect(
        (id !== undefined && labelled.has(id)) ||
          wrapped.includes(input) ||
          attribute(input, "aria-label") !== undefined,
        input,
      ).toBe(true);
    }
  });

  it("marks the language buttons with the state they are in", () => {
    for (const id of ["language-en", "language-ja"]) {
      expect(
        tags("button").find((tag) => tag.includes(`id="${id}"`)),
        id,
      ).toMatch(/aria-pressed="(true|false)"/);
    }
  });

  it("tells a screen reader which screen is shown", () => {
    const screens = tags("button").filter((tag) =>
      /id="screen-(inspect|texture)-button"/.test(tag),
    );
    expect(screens).toHaveLength(2);
    expect(screens.filter((tag) => tag.includes('aria-current="page"'))).toHaveLength(1);
  });

  it("has no tab index above zero, which would change the reading order", () => {
    for (const match of html.matchAll(/tabindex="(-?\d+)"/g))
      expect(Number(match[1])).toBeLessThanOrEqual(0);
  });
});
