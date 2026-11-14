import { describe, expect, it } from "vitest";
import { createTranslator } from "./translate";

const source = {
  en: {
    greeting: "Hello, {name}!",
    "files.one": "{count} file",
    "files.other": "{count} files",
    twice: "{a} and {a}",
    plain: "Plain text",
  },
  ja: {
    greeting: "こんにちは、{name}さん。",
    "files.other": "{count} 個のファイル",
    twice: "{a} と {a}",
    plain: "そのままの文",
  },
};

describe("createTranslator", () => {
  it("looks a key up in the catalog of its locale", () => {
    expect(createTranslator("en", source).t("plain")).toBe("Plain text");
    expect(createTranslator("ja", source).t("plain")).toBe("そのままの文");
  });

  it("remembers its locale", () => {
    expect(createTranslator("ja", source).locale).toBe("ja");
  });

  it("puts the parameters in place of the {name} marks, every time they appear", () => {
    expect(createTranslator("en", source).t("greeting", { name: "Ann" })).toBe("Hello, Ann!");
    expect(createTranslator("en", source).t("twice", { a: 7 })).toBe("7 and 7");
    expect(createTranslator("ja", source).t("greeting", { name: "花子" })).toBe(
      "こんにちは、花子さん。",
    );
  });

  it("leaves a mark alone when its parameter was not given", () => {
    expect(createTranslator("en", source).t("greeting")).toBe("Hello, {name}!");
  });

  it("does not treat a parameter value as a template", () => {
    expect(createTranslator("en", source).t("greeting", { name: "{name}" })).toBe("Hello, {name}!");
    expect(createTranslator("en", source).t("twice", { a: "{a}" })).toBe("{a} and {a}");
  });

  it("returns the key itself for a key that does not exist, so a gap is visible", () => {
    expect(createTranslator("en", source).t("missing.key")).toBe("missing.key");
  });

  it("chooses the English plural form from the count", () => {
    const t = createTranslator("en", source);

    expect(t.plural("files", 1, {})).toBe("1 file");
    expect(t.plural("files", 0, {})).toBe("0 files");
    expect(t.plural("files", 2, {})).toBe("2 files");
  });

  it("uses the .other form for a language that has one form only", () => {
    const t = createTranslator("ja", source);

    expect(t.plural("files", 1, {})).toBe("1 個のファイル");
    expect(t.plural("files", 5, {})).toBe("5 個のファイル");
  });

  it("writes the count with grouped digits unless it is given as text", () => {
    const t = createTranslator("en", source);

    expect(t.plural("files", 1234, {})).toBe("1,234 files");
  });
});
