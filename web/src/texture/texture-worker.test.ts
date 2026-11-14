import { afterEach, expect, it, vi } from "vitest";
import type { WorkerRequest } from "../protocol";

const { flip } = vi.hoisted(() => ({ flip: vi.fn() }));
vi.mock("../wasm/lint_core.mjs", () => ({ default: async () => ({ flipNormalMapGreen: flip }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});
it.each([true, false])(
  "returns the same transferred buffer on success or rejection (%s)",
  async (ok) => {
    let receive: (event: { data: WorkerRequest }) => Promise<void> = async () => {};
    const postMessage = vi.fn();
    vi.stubGlobal("self", {
      postMessage,
      addEventListener: (_: string, callback: typeof receive) => {
        receive = callback;
      },
    });
    const result = ok
      ? { ok: true, code: "", message: "", translucent_pixels: 0 }
      : { ok: false, code: "E-TEX-003", message: "limit", translucent_pixels: 0 };
    flip.mockReturnValue(result);
    const workerModule = "../worker";
    await import(workerModule);
    const pixels = new Uint8ClampedArray([1, 2, 3, 255]).buffer;
    await receive({
      data: { id: 1_000_000, type: "flip", pixels, width: 1, height: 1, maxPixels: 1 },
    });
    expect(flip).toHaveBeenCalledWith(new Uint8ClampedArray(pixels), 1, 1, 1);
    expect(postMessage).toHaveBeenCalledWith({ id: 1_000_000, type: "flipped", pixels, result }, [
      pixels,
    ]);
  },
);
