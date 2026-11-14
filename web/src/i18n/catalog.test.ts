import { describe, expect, it } from "vitest";
import { catalogs } from "./catalog";

const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

const baseOf = (key: string): string => key.replace(PLURAL_SUFFIX, "");
const placeholdersOf = (text: string): string[] =>
  [...text.matchAll(PLACEHOLDER)].map((match) => match[1] as string).sort();

describe("the message catalogs", () => {
  const en = catalogs.en;
  const ja = catalogs.ja;

  it("have the same messages in English and in Japanese", () => {
    const bases = (catalog: Record<string, string>) =>
      [...new Set(Object.keys(catalog).map(baseOf))].sort();

    expect(bases(ja)).toEqual(bases(en));
  });

  it("have, for a message with plural forms in English, at least the .other form in Japanese", () => {
    for (const key of Object.keys(en)) {
      if (key.endsWith(".one")) {
        expect(ja[`${baseOf(key)}.other`], key).toBeTypeOf("string");
      }
    }
  });

  it("have no message without text", () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const [key, text] of Object.entries(catalog)) {
        expect(text.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("use the same {marks} in both languages", () => {
    for (const key of Object.keys(ja)) {
      const english = en[key] ?? en[`${baseOf(key)}.other`];
      expect(english, key).toBeTypeOf("string");
      expect(placeholdersOf(ja[key] as string), key).toEqual(placeholdersOf(english as string));
    }
  });

  it("have Japanese text that contains Japanese characters", () => {
    const JAPANESE = /[぀-ヿ㐀-鿿]/;
    // Names and units that are the same in both languages are allowed to stay as they are.
    const SAME_IN_BOTH = new Set(["app.name", "fileSize.mib"]);
    for (const [key, text] of Object.entries(ja)) {
      if (SAME_IN_BOTH.has(key)) continue;
      expect(JAPANESE.test(text), key).toBe(true);
    }
  });

  it("have no key that is used as a plain message and as the start of a plural family", () => {
    for (const catalog of Object.values(catalogs)) {
      const bases = new Set(
        Object.keys(catalog)
          .filter((key) => PLURAL_SUFFIX.test(key))
          .map(baseOf),
      );
      for (const base of bases) {
        expect(catalog[base], base).toBeUndefined();
      }
    }
  });
});
