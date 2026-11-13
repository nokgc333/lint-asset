import type { WorkerRequest, WorkerResponse } from "./protocol";

const output = document.querySelector<HTMLOutputElement>("#engine-version");
if (!output) {
  throw new Error("#engine-version is missing in index.html");
}

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
  const response = event.data;
  // Set text only (never HTML), because worker data can come from user files later.
  output.value = response.type === "version" ? response.version : `error: ${response.message}`;
});

const request: WorkerRequest = { id: 1, type: "version" };
worker.postMessage(request);
