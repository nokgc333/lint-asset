import { describe, expect, it } from "vitest";
import type { Locale } from "./locale";
import { createTextSlot } from "./text-slot";

function setup(initial: Locale = "en") {
  const element = { textContent: "untouched" as string | null };
  let locale: Locale = initial;
  const slot = createTextSlot(element, () => locale);
  return {
    element,
    slot,
    setLocale: (next: Locale) => {
      locale = next;
    },
  };
}

const greeting = (locale: Locale): string => (locale === "ja" ? "こんにちは" : "Hello");

describe("createTextSlot", () => {
  it("does not touch the element until something is set", () => {
    expect(setup().element.textContent).toBe("untouched");
  });

  it("writes a plain string as it is", () => {
    const { element, slot } = setup();

    slot.set("Ready");

    expect(element.textContent).toBe("Ready");
  });

  it("writes text built for the current locale", () => {
    const english = setup("en");
    english.slot.set(greeting);
    const japanese = setup("ja");
    japanese.slot.set(greeting);

    expect(english.element.textContent).toBe("Hello");
    expect(japanese.element.textContent).toBe("こんにちは");
  });

  it("builds the text again for the new locale on refresh", () => {
    const { element, slot, setLocale } = setup("en");
    slot.set(greeting);

    setLocale("ja");
    slot.refresh();

    expect(element.textContent).toBe("こんにちは");
  });

  it("leaves a plain string alone on refresh", () => {
    const { element, slot, setLocale } = setup("en");
    slot.set("Fixed");

    setLocale("ja");
    slot.refresh();

    expect(element.textContent).toBe("Fixed");
  });

  it("clears the element for null, and keeps it empty on refresh", () => {
    const { element, slot, setLocale } = setup("en");
    slot.set(greeting);

    slot.set(null);
    setLocale("ja");
    slot.refresh();

    expect(element.textContent).toBe("");
  });

  it("forgets the earlier text when a new one is set", () => {
    const { element, slot, setLocale } = setup("en");
    slot.set(greeting);
    slot.set("Plain");

    setLocale("ja");
    slot.refresh();

    expect(element.textContent).toBe("Plain");
  });

  it("does nothing on refresh before anything was set", () => {
    const { element, slot } = setup();

    slot.refresh();

    expect(element.textContent).toBe("untouched");
  });
});
