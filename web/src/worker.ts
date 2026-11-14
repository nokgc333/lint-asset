import type { WorkerRequest, WorkerResponse } from "./protocol";
import createLintCore from "./wasm/lint_core.mjs";

const corePromise = createLintCore();

function reply(response: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(response, transfer);
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const core = await corePromise;
    if (request.type === "version") {
      reply({ id: request.id, type: "version", version: core.version() });
      return;
    }
    const result = core.analyze(
      new Uint8Array(request.bytes),
      request.maxFileBytes,
      request.maxTriangles,
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
});
