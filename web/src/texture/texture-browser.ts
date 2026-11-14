import type { Locale } from "../i18n/locale";
import { createTextSlot } from "../i18n/text-slot";
import { createTranslator } from "../i18n/translate";
import { cancelLimit, confirmLimit } from "../limit-dialog";
import type { WorkerRequest } from "../protocol";
import { downloadBlob } from "../report/download";
import { selectTextureFile } from "./file-selection";
import { HEADER_READ_BYTES } from "./texture-plan";
import { createTextureScreen } from "./texture-screen";

export function createTextureBrowser(options: {
  getLocale(): Locale;
  post(request: WorkerRequest, transfer: Transferable[]): void;
}) {
  function required<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing element: ${id}`);
    return element as T;
  }
  const before = required<HTMLCanvasElement>("texture-before");
  const after = required<HTMLCanvasElement>("texture-after");
  const input = required<HTMLInputElement>("texture-file");
  const drop = required("texture-drop-zone");
  const download = required<HTMLButtonElement>("texture-download");
  const warningList = required("texture-warnings");
  const compare = required("texture-compare");
  const panes = [required("texture-before-pane"), required("texture-after-pane")];
  const zoomButtons =
    required("texture-zoom").querySelectorAll<HTMLButtonElement>("button[data-zoom]");
  const status = createTextSlot(required("texture-status"), options.getLocale);
  const error = createTextSlot(required("texture-error"), options.getLocale);
  let generation = 0;
  let zoom = "fit";
  let imageWidth = 1;
  function updateZoom(): void {
    compare.classList.toggle("texture-fit", zoom === "fit");
    compare.classList.toggle("texture-pixelated", Number(zoom) >= 200);
    for (const canvas of [before, after])
      canvas.style.setProperty("--texture-width", `${imageWidth * (Number(zoom) / 100 || 1)}px`);
    for (const button of zoomButtons)
      button.setAttribute("aria-pressed", String(button.dataset.zoom === zoom));
  }
  updateZoom();
  const screen = createTextureScreen({
    ...options,
    status,
    error,
    readHeader: async (file) =>
      new Uint8Array(await file.slice(0, HEADER_READ_BYTES).arrayBuffer()),
    async decode(file) {
      const current = generation;
      const bitmap = await createImageBitmap(file, {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
        imageOrientation: "none",
      });
      try {
        if (current !== generation) throw new Error("Superseded image");
        before.width = bitmap.width;
        before.height = bitmap.height;
        const context = before.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(bitmap, 0, 0);
        const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        imageWidth = bitmap.width;
        updateZoom();
        return { width: bitmap.width, height: bitmap.height, pixels: data.buffer as ArrayBuffer };
      } finally {
        bitmap.close();
      }
    },
    showAfter(pixels, width, height) {
      after.width = width;
      after.height = height;
      const context = after.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    },
    toPngBlob: () =>
      new Promise((resolve, reject) =>
        after.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
          "image/png",
        ),
      ),
    confirm: (request) => confirmLimit(request, options.getLocale),
    download: (blob, name) => downloadBlob(name, blob),
    showWarnings(texts) {
      warningList.replaceChildren();
      for (const text of texts) {
        const item = document.createElement("li");
        item.textContent = text;
        warningList.append(item);
      }
    },
    setDownloadEnabled: (enabled) => {
      download.disabled = !enabled;
    },
  });
  function openFile(file: File): void {
    generation++;
    cancelLimit();
    before.width = after.width = 1;
    before.height = after.height = 1;
    for (const pane of panes) {
      pane.scrollTop = 0;
      pane.scrollLeft = 0;
    }
    void screen.openFile(file);
  }
  input.addEventListener("change", () => {
    const selected = selectTextureFile(input.files);
    input.value = "";
    if (selected.kind === "file") openFile(selected.file);
  });
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
    const selected = selectTextureFile(event.dataTransfer?.files);
    if (selected.kind === "file") openFile(selected.file);
    else if (selected.kind === "many") {
      const text = (locale: Locale) => createTranslator(locale).t("texture.error.drop");
      status.set(text);
      error.set(text);
    }
  });
  for (const radio of document.querySelectorAll<HTMLInputElement>(
    'input[name="texture-direction"]',
  ))
    radio.addEventListener("change", () => {
      if (radio.checked) screen.setDirection(radio.value === "gl-to-dx" ? "gl-to-dx" : "dx-to-gl");
    });
  for (const button of zoomButtons)
    button.addEventListener("click", () => {
      zoom = button.dataset.zoom ?? "fit";
      updateZoom();
    });
  for (const [index, pane] of panes.entries())
    pane.addEventListener("scroll", () => {
      const other = panes[1 - index];
      if (!other) return;
      if (other.scrollTop !== pane.scrollTop) other.scrollTop = pane.scrollTop;
      if (other.scrollLeft !== pane.scrollLeft) other.scrollLeft = pane.scrollLeft;
    });
  download.addEventListener("click", () => {
    void screen.download();
  });
  return {
    ...screen,
    clear() {
      generation++;
      cancelLimit();
      screen.clear();
      input.value = "";
      before.width = after.width = before.height = after.height = 1;
    },
  };
}
