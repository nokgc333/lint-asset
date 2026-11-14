import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { LintCore } from "./wasm/lint_core.mjs";

type Reply = (response: WorkerResponse, transfer?: Transferable[]) => void;

// Builds the function that answers one worker request. The core is passed in, so the logic can be
// tested without the generated WASM module.
export function createRequestHandler(corePromise: Promise<LintCore>, reply: Reply) {
  return async (request: WorkerRequest): Promise<void> => {
    try {
      const core = await corePromise;
      if (request.type === "version") {
        reply({ id: request.id, type: "version", version: core.version() });
        return;
      }
      if (request.type === "flip") {
        const result = core.flipNormalMapGreen(
          new Uint8ClampedArray(request.pixels),
          request.width,
          request.height,
          request.maxPixels,
        );
        reply({ id: request.id, type: "flipped", pixels: request.pixels, result }, [
          request.pixels,
        ]);
        return;
      }
      const result = core.analyze(
        new Uint8Array(request.bytes),
        request.maxFileBytes,
        request.maxTriangles,
        request.thresholds,
      );
      const buffers = new Set<ArrayBuffer>();
      for (const part of result.parts) {
        buffers.add(part.positions.buffer as ArrayBuffer);
        buffers.add(part.normals.buffer as ArrayBuffer);
        buffers.add(part.triangles.buffer as ArrayBuffer);
      }
      for (const instance of result.instances) buffers.add(instance.world.buffer as ArrayBuffer);
      reply({ id: request.id, type: "loaded", result }, [...buffers]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply({ id: request.id, type: "error", message });
    }
  };
}
