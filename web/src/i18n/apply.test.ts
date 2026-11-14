import { describe, expect, it } from "vitest";
import { applyDocument, applyStaticTranslations, type Translatable } from "./apply";
import { createTranslator } from "./translate";

const source = {
  en: {
    "a.text": "Hello",
    "a.label": "Say hello",
    "a.title": "A greeting",
    "app.name": "lint-asset",
  },
  ja: {
    "a.text": "こんにちは",
    "a.label": "あいさつする",
    "a.title": "あいさつ",
    "app.name": "lint-asset",
  },
};

function element(
  dataset: Translatable["dataset"],
  text: string | null = "old",
): Translatable & {
  attributes: Record<string, string>;
} {
  const attributes: Record<string, string> = {};
  return {
    dataset,
    textContent: text,
    attributes,
    setAttribute(name, value) {
      attributes[name] = value;
    },
  };
}

const rootOf = (elements: Translatable[]) => ({
  querySelectorAll: (selector: string) => {
    expect(selector).toBe("[data-i18n], [data-i18n-attr]");
    return elements;
  },
});

describe("applyStaticTranslations", () => {
  it("puts the text for data-i18n into the element", () => {
    const item = element({ i18n: "a.text" });

    applyStaticTranslations(rootOf([item]), createTranslator("ja", source));

    expect(item.textContent).toBe("こんにちは");
  });

  it("sets each attribute listed in data-i18n-attr, as name:key pairs separated by semicolons", () => {
    const item = element({ i18nAttr: "aria-label:a.label; title:a.title" }, "keep");

    applyStaticTranslations(rootOf([item]), createTranslator("ja", source));

    expect(item.attributes).toEqual({ "aria-label": "あいさつする", title: "あいさつ" });
    expect(item.textContent).toBe("keep");
  });

  it("handles an element that has both", () => {
    const item = element({ i18n: "a.text", i18nAttr: "title:a.title" });

    applyStaticTranslations(rootOf([item]), createTranslator("en", source));

    expect(item.textContent).toBe("Hello");
    expect(item.attributes).toEqual({ title: "A greeting" });
  });

  it("shows the key itself for a key that is not in the catalog, so the gap is visible", () => {
    const item = element({ i18n: "no.such.key" });

    applyStaticTranslations(rootOf([item]), createTranslator("en", source));

    expect(item.textContent).toBe("no.such.key");
  });

  it("skips a pair that has no colon or no key", () => {
    const item = element({ i18nAttr: "broken; title:; :a.text; aria-label:a.label" }, "keep");

    applyStaticTranslations(rootOf([item]), createTranslator("en", source));

    expect(item.attributes).toEqual({ "aria-label": "Say hello" });
  });

  it("can be applied again for another language", () => {
    const item = element({ i18n: "a.text" });
    const root = rootOf([item]);

    applyStaticTranslations(root, createTranslator("en", source));
    applyStaticTranslations(root, createTranslator("ja", source));

    expect(item.textContent).toBe("こんにちは");
  });
});

describe("applyDocument", () => {
  it("sets the language of the page and its title", () => {
    const doc = { documentElement: { lang: "en" }, title: "x" };

    applyDocument(doc, createTranslator("ja", source));

    expect(doc.documentElement.lang).toBe("ja");
    expect(doc.title).toBe("lint-asset");
  });
});
