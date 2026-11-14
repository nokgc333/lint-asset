import { describe, expect, it } from "vitest";
import { LOCALE_STORAGE_KEY } from "./locale";
import { createLocaleController, type StorageLike } from "./locale-controller";

function fakeStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("createLocaleController: the first locale", () => {
  it("is the saved choice when there is one", () => {
    const storage = fakeStorage({ [LOCALE_STORAGE_KEY]: "ja" });

    expect(createLocaleController({ storage, languages: ["en-US"] }).locale).toBe("ja");
  });

  it("follows the browser language when nothing is saved", () => {
    expect(
      createLocaleController({ storage: fakeStorage(), languages: ["ja-JP", "en"] }).locale,
    ).toBe("ja");
    expect(createLocaleController({ storage: fakeStorage(), languages: ["fr"] }).locale).toBe("en");
  });

  it("ignores a saved value that is not a locale", () => {
    const storage = fakeStorage({ [LOCALE_STORAGE_KEY]: "klingon" });

    expect(createLocaleController({ storage, languages: ["ja"] }).locale).toBe("ja");
  });

  it("works with no storage at all", () => {
    expect(createLocaleController({ storage: null, languages: ["ja"] }).locale).toBe("ja");
  });

  it("works when reading the storage throws, as it can in a private window", () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };

    expect(createLocaleController({ storage, languages: ["ja"] }).locale).toBe("ja");
  });
});

describe("createLocaleController: set", () => {
  it("changes the locale and saves it", () => {
    const storage = fakeStorage();
    const controller = createLocaleController({ storage, languages: ["en"] });

    controller.set("ja");

    expect(controller.locale).toBe("ja");
    expect(storage.data[LOCALE_STORAGE_KEY]).toBe("ja");
  });

  it("tells every subscriber the new locale, in the order they subscribed", () => {
    const controller = createLocaleController({ storage: null, languages: ["en"] });
    const seen: string[] = [];
    controller.subscribe((locale) => seen.push(`first:${locale}`));
    controller.subscribe((locale) => seen.push(`second:${locale}`));

    controller.set("ja");

    expect(seen).toEqual(["first:ja", "second:ja"]);
  });

  it("does not tell anyone when the locale does not change, but still saves the choice", () => {
    const storage = fakeStorage();
    const controller = createLocaleController({ storage, languages: ["en"] });
    let calls = 0;
    controller.subscribe(() => {
      calls += 1;
    });

    controller.set("en");

    expect(calls).toBe(0);
    // An explicit choice is kept, so a later change of the browser language does not override it.
    expect(storage.data[LOCALE_STORAGE_KEY]).toBe("en");
  });

  it("stops telling a subscriber that has unsubscribed", () => {
    const controller = createLocaleController({ storage: null, languages: ["en"] });
    let calls = 0;
    const unsubscribe = controller.subscribe(() => {
      calls += 1;
    });

    controller.set("ja");
    unsubscribe();
    controller.set("en");

    expect(calls).toBe(1);
  });

  it("still changes the locale when saving throws", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    const controller = createLocaleController({ storage, languages: ["en"] });

    expect(() => controller.set("ja")).not.toThrow();
    expect(controller.locale).toBe("ja");
  });

  it("keeps telling the other subscribers when one of them throws", () => {
    const controller = createLocaleController({ storage: null, languages: ["en"] });
    const seen: string[] = [];
    controller.subscribe(() => {
      throw new Error("broken subscriber");
    });
    controller.subscribe((locale) => seen.push(locale));

    expect(() => controller.set("ja")).not.toThrow();
    expect(seen).toEqual(["ja"]);
  });
});
