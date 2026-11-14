import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startApp } = vi.hoisted(() => ({ startApp: vi.fn() }));
vi.mock("./app", () => ({ startApp }));

function setup(width: number, capabilities = { webgl2: true, webassembly: true, worker: true }) {
  const app = { hidden: true };
  const unsupported = { hidden: true };
  const list = { textContent: "", append: vi.fn() };
  const languageEn = Object.assign(new EventTarget(), { setAttribute: vi.fn() });
  const languageJa = Object.assign(new EventTarget(), { setAttribute: vi.fn() });
  const heading = { dataset: { i18n: "app.heading" }, textContent: "", setAttribute: vi.fn() };
  const elements = {
    "screen-inspect-button": Object.assign(new EventTarget(), {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }),
    "screen-texture-button": Object.assign(new EventTarget(), {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }),
    "screen-inspect": { hidden: false },
    "screen-texture": { hidden: true },
    app,
    unsupported,
    "unsupported-list": list,
    "language-en": languageEn,
    "language-ja": languageJa,
  };
  const settingsElements = new Map(
    [
      "open",
      "dialog",
      "save",
      "reset",
      "cancel",
      "max-triangles",
      "min-extent",
      "max-extent",
      "max-triangles-hint",
      "min-extent-hint",
      "max-extent-hint",
      "max-triangles-error",
      "min-extent-error",
      "max-extent-error",
    ].map((id) => [
      `settings-${id}`,
      Object.assign(new EventTarget(), {
        value: "",
        textContent: "",
        open: false,
        focus: vi.fn(),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        showModal: vi.fn(),
        close: vi.fn(),
      }),
    ]),
  );
  const document = {
    dispatchEvent: vi.fn(),
    documentElement: { lang: "en" },
    title: "",
    querySelectorAll: () => [heading],
    getElementById: (id: keyof typeof elements) => elements[id] ?? settingsElements.get(id),
    createElement: (tag: string) =>
      tag === "canvas"
        ? { getContext: () => (capabilities.webgl2 ? {} : null) }
        : { textContent: "" },
  };
  const window = {
    document,
    innerWidth: width,
    WebAssembly: capabilities.webassembly ? {} : undefined,
    Worker: capabilities.worker ? function Worker() {} : undefined,
    addEventListener: vi.fn(),
  };
  const frames: FrameRequestCallback[] = [];
  const requestFrame = vi.fn((callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("navigator", { languages: ["en"], language: "en" });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("requestAnimationFrame", requestFrame);

  function resize(width: number) {
    window.innerWidth = width;
    const listener = window.addEventListener.mock.calls[0]?.[1];
    listener();
  }

  async function flushFrame() {
    frames.shift()?.(0);
    await vi.dynamicImportSettled();
  }

  return {
    app,
    unsupported,
    list,
    resize,
    flushFrame,
    requestFrame,
    languageEn,
    languageJa,
    document,
    window,
    heading,
    elements,
    settingsElements,
  };
}

beforeEach(() => {
  vi.resetModules();
  startApp.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("environment bootstrap", () => {
  it("translates before startup, survives blocked storage and refreshes the guide", async () => {
    const page = setup(1280);
    vi.stubGlobal("navigator", { languages: ["ja-JP"], language: "ja-JP" });
    Object.defineProperty(page.window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
    const startup = vi.fn();
    startApp.mockImplementation((controller) => {
      startup(controller.locale, page.document.documentElement.lang, page.heading.textContent);
    });
    await import("./main");
    await vi.dynamicImportSettled();
    expect(startApp).toHaveBeenCalledOnce();
    expect(startup).toHaveBeenCalledWith("ja", "ja", "GLB ジオメトリ検査");
    page.resize(300);
    await page.flushFrame();
    expect(page.list.append.mock.calls.at(-1)?.[0].textContent).toContain("ウィンドウ");
    page.languageEn.dispatchEvent(new Event("click"));
    expect(page.document.documentElement.lang).toBe("en");
    expect(page.list.append.mock.calls.at(-1)?.[0].textContent).toContain("window");
    expect(page.languageEn.setAttribute).toHaveBeenLastCalledWith("aria-pressed", "true");
    expect(page.languageJa.setAttribute).toHaveBeenLastCalledWith("aria-pressed", "false");
  });
  it("starts once, hides on narrowing, and resumes on widening", async () => {
    const page = setup(1024);
    await import("./main");
    await vi.dynamicImportSettled();
    expect(startApp).toHaveBeenCalledOnce();
    expect(page.app.hidden).toBe(false);
    expect(page.unsupported.hidden).toBe(true);
    page.resize(300);
    await page.flushFrame();
    expect(page.app.hidden).toBe(true);
    expect(page.unsupported.hidden).toBe(false);
    expect(page.list.append.mock.calls.at(-1)?.[0].textContent).toContain("320 px");
    page.resize(1400);
    await page.flushFrame();
    expect(page.app.hidden).toBe(false);
    expect(page.unsupported.hidden).toBe(true);
    expect(startApp).toHaveBeenCalledOnce();
  });

  it("defers startup until widening and coalesces resize events", async () => {
    const page = setup(300);
    await import("./main");
    expect(startApp).not.toHaveBeenCalled();
    expect(page.app.hidden).toBe(true);
    expect(page.unsupported.hidden).toBe(false);
    page.resize(1000);
    page.resize(1200);
    expect(page.requestFrame).toHaveBeenCalledOnce();
    await page.flushFrame();
    expect(startApp).toHaveBeenCalledOnce();
    expect(page.app.hidden).toBe(false);
  });

  it.each(["webgl2", "webassembly", "worker"] as const)(
    "never starts when %s is unavailable, even after widening",
    async (missing) => {
      const page = setup(300, { webgl2: true, webassembly: true, worker: true, [missing]: false });
      await import("./main");
      page.resize(1920);
      await page.flushFrame();
      expect(startApp).not.toHaveBeenCalled();
      expect(page.app.hidden).toBe(true);
      expect(page.unsupported.hidden).toBe(false);
    },
  );
});

it("switches screens while retaining state and requests a viewer resize on return", async () => {
  const page = setup(1280);
  await import("./main");
  const elements = page.elements;
  elements["screen-texture-button"].dispatchEvent(new Event("click"));
  expect(elements["screen-inspect"].hidden).toBe(true);
  expect(elements["screen-texture"].hidden).toBe(false);
  expect(elements["screen-texture-button"].setAttribute).toHaveBeenCalledWith(
    "aria-current",
    "page",
  );
  page.languageJa.dispatchEvent(new Event("click"));
  expect(elements["screen-texture"].hidden).toBe(false);
  elements["screen-inspect-button"].dispatchEvent(new Event("click"));
  expect(elements["screen-inspect"].hidden).toBe(false);
  expect(elements["screen-texture"].hidden).toBe(true);
  await page.flushFrame();
  expect(page.document.dispatchEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "screen-inspect-shown" }),
  );
  expect(startApp).toHaveBeenCalledOnce();
});

it("shares saved thresholds with the app and reruns after settings save on the texture screen", async () => {
  const page = setup(1280);
  const rerun = vi.fn();
  startApp.mockReturnValue(rerun);
  await import("./main");
  await vi.dynamicImportSettled();
  const getThresholds = startApp.mock.calls[0]?.[1];
  expect(getThresholds()).toEqual({
    max_triangles: 100000,
    min_extent_m: 0.01,
    max_extent_m: 1000,
  });
  page.elements["screen-texture-button"].dispatchEvent(new Event("click"));
  page.settingsElements.get("settings-open")?.dispatchEvent(new Event("click"));
  const input = page.settingsElements.get("settings-max-triangles");
  if (input) input.value = "42";
  page.settingsElements.get("settings-save")?.dispatchEvent(new Event("click"));
  expect(getThresholds().max_triangles).toBe(42);
  expect(rerun).toHaveBeenCalledOnce();
  expect(page.elements["screen-texture"].hidden).toBe(false);
});
