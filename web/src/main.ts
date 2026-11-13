import "./style.css";
import { describeCounts } from "./counts";
import { MAX_FILE_BYTES, MAX_TRIANGLES } from "./limits";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { createModuleWorker } from "./trusted-worker";
import { ORBIT_STEP, PAN_STEP, ZOOM_FACTOR } from "./viewer/controls";
import type { Viewer } from "./viewer/viewer";
import workerUrl from "./worker.ts?worker&url";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const output = required<HTMLOutputElement>("#engine-version");
const status = required<HTMLParagraphElement>("#status");
const canvas = required<HTMLCanvasElement>("#viewer");
const input = required<HTMLInputElement>("#file");
const controls = required<HTMLFieldSetElement>("#controls");
const wireframe = required<HTMLInputElement>("#wireframe");
const normals = required<HTMLInputElement>("#normals");
const worker = createModuleWorker(workerUrl);
const VERSION_REQUEST_ID = 1;
let nextId = VERSION_REQUEST_ID;
let activeLoad: { id: number; name: string } | null = null;
let viewer: Viewer | null = null;
let workerAvailable = true;

function post(request: WorkerRequest, transfer: Transferable[] = []): void {
  worker.postMessage(request, transfer);
}

worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
  const response = event.data;
  if (response.id === VERSION_REQUEST_ID) {
    output.textContent =
      response.type === "version"
        ? response.version
        : response.type === "error"
          ? `error: ${response.message}`
          : "Unavailable";
    return;
  }
  if (!activeLoad || response.id !== activeLoad.id) return;
  if (response.type === "error") {
    status.textContent = `E-LOAD-002: ${response.message}`;
  } else if (response.type === "loaded") {
    const result = response.result;
    if (!result.ok) {
      status.textContent = `${result.code}: ${result.message}`;
      return;
    }
    viewer?.setGeometry(result);
    status.textContent = `${activeLoad.name}: ${describeCounts(result)}`;
  }
});

worker.addEventListener("error", () => {
  workerAvailable = false;
  output.textContent = "Unavailable";
  status.textContent = "E-LOAD-002: The geometry worker is unavailable.";
  controls.disabled = true;
});

post({ id: VERSION_REQUEST_ID, type: "version" });

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file || !viewer) return;
  const id = ++nextId;
  activeLoad = { id, name: file.name };
  status.textContent = `Loading ${file.name}…`;
  try {
    if (file.size > MAX_FILE_BYTES) {
      status.textContent = "E-LOAD-003: The file exceeds the 100 MiB limit.";
      return;
    }
    const bytes = await file.arrayBuffer();
    if (activeLoad.id !== id) return;
    post({ id, type: "load", bytes, maxFileBytes: MAX_FILE_BYTES, maxTriangles: MAX_TRIANGLES }, [
      bytes,
    ]);
  } catch (error) {
    if (activeLoad.id !== id) return;
    status.textContent = `E-LOAD-002: ${error instanceof Error ? error.message : String(error)}`;
  }
});

const actions: Record<string, () => void> = {
  "rotate-left": () => viewer?.orbitBy(-ORBIT_STEP, 0),
  "rotate-right": () => viewer?.orbitBy(ORBIT_STEP, 0),
  "rotate-up": () => viewer?.orbitBy(0, ORBIT_STEP),
  "rotate-down": () => viewer?.orbitBy(0, -ORBIT_STEP),
  "zoom-in": () => viewer?.zoomBy(ZOOM_FACTOR),
  "zoom-out": () => viewer?.zoomBy(1 / ZOOM_FACTOR),
  "pan-left": () => viewer?.panBy(-PAN_STEP, 0),
  "pan-right": () => viewer?.panBy(PAN_STEP, 0),
  "pan-up": () => viewer?.panBy(0, PAN_STEP),
  "pan-down": () => viewer?.panBy(0, -PAN_STEP),
  reset: () => viewer?.resetView(),
};

for (const button of controls.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action) actions[action]?.();
  });
}
wireframe.addEventListener("change", () => viewer?.setWireframe(wireframe.checked));
normals.addEventListener("change", () => viewer?.setNormals(normals.checked));

async function initialize(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  try {
    const { createViewer } = await import("./viewer/viewer");
    viewer = createViewer(canvas);
    if (workerAvailable) {
      controls.disabled = false;
      status.textContent = "Open a GLB file to inspect its geometry.";
    }
  } catch {
    status.textContent = "WebGL2 is not available in this browser.";
    controls.disabled = true;
    canvas.setAttribute("aria-disabled", "true");
    canvas.tabIndex = -1;
  }
}
void initialize();
