import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startApp } = vi.hoisted(() => ({ startApp: vi.fn() }));
vi.mock("./app", () => ({ startApp }));

function setup(width: number, capabilities = { webgl2: true, webassembly: true, worker: true }) {
  const app = { hidden: true };
  const unsupported = { hidden: true };
  const list = { textContent: "", append: vi.fn() };
  const elements = { app, unsupported, "unsupported-list": list };
  const document = {
    getElementById: (id: keyof typeof elements) => elements[id],
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

  return { app, unsupported, list, resize, flushFrame, requestFrame };
}

beforeEach(() => {
  vi.resetModules();
  startApp.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("environment bootstrap", () => {
  it("starts once, hides on narrowing, and resumes on widening", async () => {
    const page = setup(1024);
    await import("./main");
    await vi.dynamicImportSettled();
    expect(startApp).toHaveBeenCalledOnce();
    expect(page.app.hidden).toBe(false);
    expect(page.unsupported.hidden).toBe(true);
    page.resize(800);
    await page.flushFrame();
    expect(page.app.hidden).toBe(true);
    expect(page.unsupported.hidden).toBe(false);
    expect(page.list.append.mock.calls.at(-1)?.[0].textContent).toContain("1024 px");
    page.resize(1400);
    await page.flushFrame();
    expect(page.app.hidden).toBe(false);
    expect(page.unsupported.hidden).toBe(true);
    expect(startApp).toHaveBeenCalledOnce();
  });

  it("defers startup until widening and coalesces resize events", async () => {
    const page = setup(800);
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
      const page = setup(800, { webgl2: true, webassembly: true, worker: true, [missing]: false });
      await import("./main");
      page.resize(1920);
      await page.flushFrame();
      expect(startApp).not.toHaveBeenCalled();
      expect(page.app.hidden).toBe(true);
      expect(page.unsupported.hidden).toBe(false);
    },
  );
});
