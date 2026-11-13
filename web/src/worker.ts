import type { WorkerRequest, WorkerResponse } from "./protocol";
import createLintCore from "./wasm/lint_core.mjs";

const corePromise = createLintCore();

function reply(response: WorkerResponse): void {
  self.postMessage(response);
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const core = await corePromise;
    reply({ id: request.id, type: "version", version: core.version() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reply({ id: request.id, type: "error", message });
  }
});
