import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, detectLocale, isLocale, LOCALE_STORAGE_KEY, LOCALES } from "./locale";

describe("the supported locales", () => {
  it("are English and Japanese, with English as the default", () => {
    expect(LOCALES).toEqual(["en", "ja"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("are the only values isLocale accepts", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(1)).toBe(false);
  });

  it("are saved under a fixed storage key", () => {
    expect(LOCALE_STORAGE_KEY).toBe("lint-asset.locale");
  });
});

describe("detectLocale", () => {
  it("uses the saved choice before anything else", () => {
    expect(detectLocale(["en-US"], "ja")).toBe("ja");
    expect(detectLocale(["ja-JP"], "en")).toBe("en");
  });

  it("ignores a saved value that is not a supported locale", () => {
    expect(detectLocale(["ja"], "fr")).toBe("ja");
    expect(detectLocale(["en"], "")).toBe("en");
    expect(detectLocale(["ja"], null)).toBe("ja");
    expect(detectLocale(["ja"], undefined)).toBe("ja");
  });

  it("follows the first browser language that this tool supports", () => {
    expect(detectLocale(["ja-JP", "en"], null)).toBe("ja");
    expect(detectLocale(["en-US", "ja"], null)).toBe("en");
    expect(detectLocale(["fr-FR", "ja"], null)).toBe("ja");
    expect(detectLocale(["de", "fr", "en-GB"], null)).toBe("en");
  });

  it("does not care about the case of the language tag", () => {
    expect(detectLocale(["JA-jp"], null)).toBe("ja");
    expect(detectLocale(["EN-us"], null)).toBe("en");
  });

  it("falls back to English when nothing matches", () => {
    expect(detectLocale(["fr", "de"], null)).toBe("en");
    expect(detectLocale([], null)).toBe("en");
  });

  it("does not take a language that only starts with the same letters", () => {
    expect(detectLocale(["jam"], null)).toBe("en");
    expect(detectLocale(["english"], null)).toBe("en");
  });
});
