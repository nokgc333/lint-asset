import "./style.css";
import { createFileLoader } from "./file-loader";
import { pickSingleFile } from "./intake";
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
const error = required<HTMLParagraphElement>("#error");
const dropZone = required<HTMLDivElement>("#drop-zone");
const wireframe = required<HTMLInputElement>("#wireframe");
const normals = required<HTMLInputElement>("#normals");
const worker = createModuleWorker(workerUrl);
const VERSION_REQUEST_ID = 1;
let viewer: Viewer | null = null;
let workerAvailable = true;

function post(request: WorkerRequest, transfer: Transferable[] = []): void {
  worker.postMessage(request, transfer);
}

const loader = createFileLoader({
  status,
  error,
  post: (request) => post(request, [request.bytes]),
  showGeometry: (result) => viewer?.setGeometry(result),
  isReady: () => viewer !== null && workerAvailable,
  firstRequestId: VERSION_REQUEST_ID,
});
const { openFile } = loader;

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
  void loader.handleResponse(response);
});

worker.addEventListener("error", () => {
  workerAvailable = false;
  output.textContent = "Unavailable";
  loader.failWorker();
  controls.disabled = true;
});

post({ id: VERSION_REQUEST_ID, type: "version" });

input.addEventListener("change", () => {
  const selection = pickSingleFile(input.files);
  input.value = "";
  if (selection.kind === "file") void openFile(selection.file);
});

for (const type of ["dragenter", "dragover"] as const) {
  dropZone.addEventListener(type, (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
}
dropZone.addEventListener("dragleave", (event) => {
  if (event.relatedTarget instanceof Node && dropZone.contains(event.relatedTarget)) return;
  dropZone.classList.remove("is-dragging");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  const selection = pickSingleFile(event.dataTransfer?.files);
  if (selection.kind === "many") {
    error.textContent = "Error: Drop one file at a time.";
  } else if (selection.kind === "file") {
    void openFile(selection.file);
  }
});
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (event) => event.preventDefault());
}

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
