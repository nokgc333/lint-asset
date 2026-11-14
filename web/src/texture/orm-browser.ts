import type { Locale } from "../i18n/locale";
import { createTextSlot } from "../i18n/text-slot";
import { pickSingleFile } from "../intake";
import { cancelLimit, confirmLimit } from "../limit-dialog";
import type { WorkerRequest } from "../protocol";
import { downloadBlob } from "../report/download";
import { ORM_CHANNELS } from "./orm-plan";
import { createOrmScreen } from "./orm-screen";
import { HEADER_READ_BYTES } from "./texture-plan";
import { linkTexturePanes } from "./texture-scroll";

export function createOrmBrowser(
  options: {
    getLocale(): Locale;
    post(request: WorkerRequest, transfer: Transferable[]): void;
  },
  mode: "pack" | "unpack",
) {
  function required<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(`orm-${mode}-${id}`);
    if (!element) throw new Error(`Missing ORM element: ${id}`);
    return element as T;
  }
  const panel = required("panel");
  const compare = required("compare");
  const canvases = [...panel.querySelectorAll("canvas")];
  const panes = [...panel.querySelectorAll<HTMLElement>(".compare-pane")];
  const downloads = [...panel.querySelectorAll<HTMLButtonElement>("button[data-output]")];
  const all = mode === "unpack" ? required<HTMLButtonElement>("all") : null;
  const inputs = [...panel.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  const names = [...panel.querySelectorAll<HTMLElement>(".orm-file-name")];
  const zoomButtons = panel.querySelectorAll<HTMLButtonElement>("button[data-zoom]");
  let generation = 0;
  let zoom = "fit";
  function updateZoom(): void {
    compare.classList.toggle("texture-fit", zoom === "fit");
    compare.classList.toggle("texture-pixelated", Number(zoom) >= 200);
    for (const canvas of canvases)
      canvas.style.setProperty("--texture-width", `${canvas.width * (Number(zoom) / 100 || 1)}px`);
    for (const button of zoomButtons)
      button.setAttribute("aria-pressed", String(button.dataset.zoom === zoom));
  }
  function list(id: string, texts: string[]): void {
    const element = required(id);
    element.replaceChildren();
    for (const text of texts) {
      const item = document.createElement("li");
      item.textContent = text;
      element.append(item);
    }
  }
  function outputCanvas(output: string): HTMLCanvasElement {
    return required<HTMLCanvasElement>(output);
  }
  const screen = createOrmScreen({
    ...options,
    mode,
    status: createTextSlot(required("status"), options.getLocale),
    error: createTextSlot(required("error"), options.getLocale),
    clear() {
      generation++;
      cancelLimit();
      for (const canvas of canvases) canvas.width = canvas.height = 1;
      for (const pane of panes) pane.scrollTop = pane.scrollLeft = 0;
      updateZoom();
    },
    readHeader: async (file) =>
      new Uint8Array(await file.slice(0, HEADER_READ_BYTES).arrayBuffer()),
    async decode(file, index) {
      const current = generation;
      const bitmap = await createImageBitmap(file, {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
        imageOrientation: "none",
      });
      try {
        if (current !== generation) throw new Error("Superseded image");
        const canvas = required<HTMLCanvasElement>(`before-${index}`);
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
          .buffer as ArrayBuffer;
        updateZoom();
        return { width: bitmap.width, height: bitmap.height, pixels };
      } finally {
        bitmap.close();
      }
    },
    showResult(output, pixels, width, height) {
      const canvas = outputCanvas(output);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
      updateZoom();
    },
    toPngBlob: (output) =>
      new Promise((resolve, reject) =>
        outputCanvas(output).toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
          "image/png",
        ),
      ),
    showDefaults: (texts) => list("defaults", texts),
    showWarnings: (texts) => list("warnings", texts),
    setDownloadEnabled(enabled) {
      for (const button of downloads) button.disabled = !enabled;
      if (all) all.disabled = !enabled;
    },
    confirm: (request) => confirmLimit(request, options.getLocale),
    download: (blob, name) => downloadBlob(name, blob),
    delay: () => new Promise((resolve) => setTimeout(resolve, 200)),
  });
  function setInput(index: number, file: File | null): void {
    const name = names[index];
    if (name) name.textContent = file?.name ?? "";
    void screen.setInput(index, file);
  }
  inputs.forEach((input, index) => {
    input.addEventListener("change", () => {
      const selected = pickSingleFile(input.files);
      input.value = "";
      if (selected.kind === "file") setInput(index, selected.file);
      else if (selected.kind === "many") screen.dropError();
    });
    const drop = required(`drop-${index}`);
    for (const type of ["dragenter", "dragover"] as const)
      drop.addEventListener(type, (event) => {
        if (!event.dataTransfer?.types.includes("Files")) return;
        event.preventDefault();
        drop.classList.add("is-dragging");
      });
    drop.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && drop.contains(event.relatedTarget)) return;
      drop.classList.remove("is-dragging");
    });
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("is-dragging");
      const selected = pickSingleFile(event.dataTransfer?.files);
      if (selected.kind === "file") setInput(index, selected.file);
      else if (selected.kind === "many") screen.dropError();
    });
    if (mode === "pack")
      required(`remove-${index}`).addEventListener("click", () => setInput(index, null));
  });
  for (const button of downloads)
    button.addEventListener("click", () => {
      const output = button.dataset.output;
      if (output === "packed" || ORM_CHANNELS.some((channel) => channel === output))
        void screen.download(output as "packed" | (typeof ORM_CHANNELS)[number]);
    });
  all?.addEventListener("click", () => {
    void screen.downloadAll();
  });
  for (const button of zoomButtons)
    button.addEventListener("click", () => {
      zoom = button.dataset.zoom ?? "fit";
      updateZoom();
    });
  linkTexturePanes(panes);
  updateZoom();
  return {
    ...screen,
    clear() {
      screen.clear();
      for (const input of inputs) input.value = "";
      for (const name of names) name.textContent = "";
    },
  };
}
