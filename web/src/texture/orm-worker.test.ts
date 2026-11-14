import { expect, it, vi } from "vitest";
import type { LintCore } from "../wasm/lint_core.mjs";
import { createRequestHandler } from "../worker-handler";

it.each([true, false])(
  "packs views of the inputs, preserving null, and transfers the result (%s)",
  async (ok) => {
    const inputs: [ArrayBuffer, null, ArrayBuffer] = [
      new ArrayBuffer(16),
      null,
      new ArrayBuffer(16),
    ];
    const result = {
      ok,
      pixels: new Uint8ClampedArray(ok ? 16 : 0),
      code: ok ? "" : "E-TEX-003",
      message: "",
      non_gray_pixels: [0, 0, 0],
      translucent_pixels: 0,
    };
    const packOrm = vi.fn().mockReturnValue(result);
    const reply = vi.fn();
    const handle = createRequestHandler(Promise.resolve({ packOrm } as unknown as LintCore), reply);
    await handle({ id: 2_000_000, type: "packOrm", width: 2, height: 2, inputs, maxPixels: 100 });
    expect(packOrm).toHaveBeenCalledWith(
      2,
      2,
      new Uint8ClampedArray(inputs[0]),
      null,
      new Uint8ClampedArray(inputs[2]),
      100,
    );
    expect(packOrm.mock.calls[0]?.[2].buffer).toBe(inputs[0]);
    expect(reply).toHaveBeenCalledWith({ id: 2_000_000, type: "packedOrm", result }, [
      result.pixels.buffer,
    ]);
  },
);

it.each([true, false])(
  "unpacks a view of the pixels and transfers all three results (%s)",
  async (ok) => {
    const pixels = new ArrayBuffer(16);
    const result = {
      ok,
      occlusion: new Uint8ClampedArray(ok ? 16 : 0),
      roughness: new Uint8ClampedArray(ok ? 16 : 0),
      metallic: new Uint8ClampedArray(ok ? 16 : 0),
      code: ok ? "" : "E-TEX-001",
      message: "",
      translucent_pixels: 0,
    };
    const unpackOrm = vi.fn().mockReturnValue(result);
    const reply = vi.fn();
    const handle = createRequestHandler(
      Promise.resolve({ unpackOrm } as unknown as LintCore),
      reply,
    );
    await handle({ id: 2_000_001, type: "unpackOrm", width: 2, height: 2, pixels, maxPixels: 100 });
    expect(unpackOrm).toHaveBeenCalledWith(new Uint8ClampedArray(pixels), 2, 2, 100);
    expect(unpackOrm.mock.calls[0]?.[0].buffer).toBe(pixels);
    expect(reply).toHaveBeenCalledWith({ id: 2_000_001, type: "unpackedOrm", result }, [
      result.occlusion.buffer,
      result.roughness.buffer,
      result.metallic.buffer,
    ]);
  },
);

it.each(["packOrm", "unpackOrm"] as const)(
  "reports %s exceptions without requiring WASM",
  async (type) => {
    const reply = vi.fn();
    const handle = createRequestHandler(
      Promise.resolve({
        [type]: () => {
          throw new Error("failed");
        },
      } as unknown as LintCore),
      reply,
    );
    if (type === "packOrm")
      await handle({
        id: 2_000_002,
        type,
        width: 2,
        height: 2,
        inputs: [null, null, null],
        maxPixels: 100,
      });
    else
      await handle({
        id: 2_000_002,
        type,
        width: 2,
        height: 2,
        pixels: new ArrayBuffer(16),
        maxPixels: 100,
      });
    expect(reply).toHaveBeenCalledWith({ id: 2_000_002, type: "error", message: "failed" });
  },
);
