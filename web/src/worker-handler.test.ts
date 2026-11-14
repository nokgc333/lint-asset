import { describe, expect, it, vi } from "vitest";
import type { WorkerResponse } from "./protocol";
import type { LintCore } from "./wasm/lint_core.mjs";
import { createRequestHandler } from "./worker-handler";

const EMPTY = { parts: [], instances: [] };
function setup() {
  const analyze = vi.fn(() => ({ ok: true, ...EMPTY }));
  const analyzeGltf = vi.fn(() => ({ ok: true, ...EMPTY }));
  const replies: WorkerResponse[] = [];
  const handle = createRequestHandler(
    Promise.resolve({ analyze, analyzeGltf } as unknown as LintCore),
    (response) => replies.push(response),
  );
  return { analyze, analyzeGltf, replies, handle };
}
const thresholds = { max_triangles: 1, min_extent_m: 0.01, max_extent_m: 1000 };

describe("load requests", () => {
  it("analyzes a GLB without files", async () => {
    const { analyze, analyzeGltf, handle, replies } = setup();
    await handle({
      id: 5,
      type: "load",
      bytes: new ArrayBuffer(4),
      maxFileBytes: 10,
      maxTriangles: 20,
      thresholds,
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyzeGltf).not.toHaveBeenCalled();
    expect(replies[0]).toMatchObject({ id: 5, type: "loaded" });
  });

  it("analyzes a .gltf with its files, as Uint8Array views over the sent buffers", async () => {
    const { analyze, analyzeGltf, handle, replies } = setup();
    const bin = new Uint8Array([1, 2, 3]).buffer;
    await handle({
      id: 6,
      type: "load",
      bytes: new ArrayBuffer(4),
      files: [{ name: "buffers/a.bin", bytes: bin }],
      maxFileBytes: 10,
      maxTriangles: 20,
      thresholds,
    });
    expect(analyze).not.toHaveBeenCalled();
    const call = analyzeGltf.mock.calls[0] as unknown as [
      Uint8Array,
      { name: string; bytes: Uint8Array }[],
      number,
      number,
      unknown,
    ];
    expect(call[1].map((f) => [f.name, Array.from(f.bytes)])).toEqual([
      ["buffers/a.bin", [1, 2, 3]],
    ]);
    expect(call.slice(2)).toEqual([10, 20, thresholds]);
    expect(replies[0]).toMatchObject({ id: 6, type: "loaded" });
  });

  it("answers with an error message, not a throw, when the core throws", async () => {
    const { analyzeGltf, handle, replies } = setup();
    analyzeGltf.mockImplementation(() => {
      throw new Error("boom");
    });
    await handle({
      id: 7,
      type: "load",
      bytes: new ArrayBuffer(1),
      files: [],
      maxFileBytes: 1,
      maxTriangles: 1,
      thresholds,
    });
    expect(replies[0]).toEqual({ id: 7, type: "error", message: "boom" });
  });
});
