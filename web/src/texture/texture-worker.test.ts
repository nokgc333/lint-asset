import { expect, it, vi } from "vitest";
import type { WorkerRequest } from "../protocol";
import type { LintCore } from "../wasm/lint_core.mjs";
import { createRequestHandler } from "../worker-handler";

it.each([true, false])(
  "returns the same transferred buffer on success or rejection (%s)",
  async (ok) => {
    const result = ok
      ? { ok: true, code: "", message: "", translucent_pixels: 0 }
      : { ok: false, code: "E-TEX-003", message: "limit", translucent_pixels: 0 };
    const flip = vi.fn().mockReturnValue(result);
    const reply = vi.fn();
    const handle = createRequestHandler(
      Promise.resolve({ flipNormalMapGreen: flip } as unknown as LintCore),
      reply,
    );
    const pixels = new Uint8ClampedArray([1, 2, 3, 255]).buffer;
    const request: WorkerRequest = {
      id: 1_000_000,
      type: "flip",
      pixels,
      width: 1,
      height: 1,
      maxPixels: 1,
    };
    await handle(request);
    expect(flip).toHaveBeenCalledWith(new Uint8ClampedArray(pixels), 1, 1, 1);
    expect(reply).toHaveBeenCalledWith({ id: 1_000_000, type: "flipped", pixels, result }, [
      pixels,
    ]);
  },
);

it("answers a version request", async () => {
  const reply = vi.fn();
  const handle = createRequestHandler(
    Promise.resolve({ version: () => "1.2.3" } as unknown as LintCore),
    reply,
  );
  await handle({ id: 1, type: "version" });
  expect(reply).toHaveBeenCalledWith({ id: 1, type: "version", version: "1.2.3" });
});

it("reports an error from the core as an error response", async () => {
  const reply = vi.fn();
  const handle = createRequestHandler(Promise.reject(new Error("boom")), reply);
  await handle({ id: 7, type: "version" });
  expect(reply).toHaveBeenCalledWith({ id: 7, type: "error", message: "boom" });
});

it("passes inspection thresholds to analyze and transfers the geometry", async () => {
  const thresholds = { max_triangles: 5, min_extent_m: 0.1, max_extent_m: 20 };
  const positions = new Float32Array([1, 2, 3]);
  const result = {
    parts: [{ positions, normals: positions, triangles: new Uint32Array([0]) }],
    instances: [],
    thresholds,
  };
  const analyze = vi.fn().mockReturnValue(result);
  const reply = vi.fn();
  const handle = createRequestHandler(Promise.resolve({ analyze } as unknown as LintCore), reply);
  const bytes = new ArrayBuffer(4);
  await handle({ id: 2, type: "load", bytes, maxFileBytes: 100, maxTriangles: 20, thresholds });
  expect(analyze).toHaveBeenCalledWith(new Uint8Array(bytes), 100, 20, thresholds);
  expect(reply).toHaveBeenCalledWith({ id: 2, type: "loaded", result }, [
    positions.buffer,
    result.parts[0]?.triangles.buffer,
  ]);
});
