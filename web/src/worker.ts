import type { WorkerRequest, WorkerResponse } from "./protocol";
import createLintCore from "./wasm/lint_core.mjs";
import { createRequestHandler } from "./worker-handler";

const handle = createRequestHandler(
  createLintCore(),
  (response: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(response, transfer),
);

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data);
});
