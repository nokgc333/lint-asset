import { createFileLoader } from "./file-loader";
import type { Locale } from "./i18n/locale";
import type { LocaleController } from "./i18n/locale-controller";
import { createTextSlot } from "./i18n/text-slot";
import { createTranslator } from "./i18n/translate";
import { pickSingleFile } from "./intake";
import { createDetailPanel } from "./issues/detail-panel";
import { issueKey } from "./issues/filter-sort";
import { createIssuePanel } from "./issues/panel";
import { refreshLimitText } from "./limit-dialog";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { buildReport } from "./report/build-report";
import { downloadText } from "./report/download";
import { exportFileName } from "./report/export-name";
import { reportToJson } from "./report/to-json";
import { reportToMarkdown } from "./report/to-markdown";
import { fetchSampleFile } from "./sample";
import { createOrmBrowser } from "./texture/orm-browser";
import { createTextureBrowser } from "./texture/texture-browser";
import { createModuleWorker } from "./trusted-worker";
import { ORBIT_STEP, PAN_STEP, ZOOM_FACTOR } from "./viewer/controls";
import type { Viewer } from "./viewer/viewer";
import type { AnalyzeResult, Issue, Thresholds } from "./wasm/lint_core.mjs";
import workerUrl from "./worker.ts?worker&url";

export function startApp(
  controller: LocaleController,
  getThresholds: () => Thresholds,
): () => void {
  function required<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }

  const getLocale = () => controller.locale;
  const output = createTextSlot(required<HTMLOutputElement>("#engine-version"), getLocale);
  const status = createTextSlot(required<HTMLParagraphElement>("#status"), getLocale);
  const canvas = required<HTMLCanvasElement>("#viewer");
  const input = required<HTMLInputElement>("#file");
  const controls = required<HTMLFieldSetElement>("#controls");
  const error = createTextSlot(required<HTMLParagraphElement>("#error"), getLocale);
  const dropZone = required<HTMLDivElement>("#drop-zone");
  const wireframe = required<HTMLInputElement>("#wireframe");
  const normals = required<HTMLInputElement>("#normals");
  const jsonButton = required<HTMLButtonElement>("#export-json");
  const markdownButton = required<HTMLButtonElement>("#export-markdown");
  let engineVersion = "";
  let displayed: { name: string; size: number; result: AnalyzeResult } | null = null;
  function exportReport(kind: "json" | "md"): void {
    if (!displayed) return;
    const report = buildReport({
      fileName: displayed.name,
      fileSize: displayed.size,
      toolVersion: engineVersion,
      generatedAt: new Date(),
      result: displayed.result,
    });
    const text =
      kind === "json" ? reportToJson(report) : reportToMarkdown(report, controller.locale);
    const mime = kind === "json" ? "application/json" : "text/markdown";
    downloadText(exportFileName(report.asset.name, kind), `${mime};charset=utf-8`, text);
  }
  jsonButton.addEventListener("click", () => exportReport("json"));
  markdownButton.addEventListener("click", () => exportReport("md"));
  const worker = createModuleWorker(workerUrl);
  const VERSION_REQUEST_ID = 1;
  let viewer: Viewer | null = null;
  let workerAvailable = true;
  const detail = createDetailPanel({ getLocale });
  let selectedIssue: Issue | null = null;
  let loadingGeometry = false;
  let visibleIssues: readonly Issue[] = [];
  const panel = createIssuePanel({
    getLocale,
    onSelect: (issue) => {
      selectedIssue = issue;
      viewer?.selectIssue(issue);
      detail.show(issue);
    },
    onVisibleChange: (visible) => {
      const previous = new Set(visibleIssues);
      const changed =
        visible.length !== visibleIssues.length || visible.some((issue) => !previous.has(issue));
      visibleIssues = visible;
      if (!loadingGeometry && changed) viewer?.setVisibleIssues(visible);
      const selectedKey = selectedIssue ? issueKey(selectedIssue) : null;
      if (selectedKey !== null && !visible.some((issue) => issueKey(issue) === selectedKey)) {
        selectedIssue = null;
        detail.show(null);
      }
    },
  });

  const texture = createTextureBrowser({ getLocale, post });
  const ormPack = createOrmBrowser({ getLocale, post }, "pack");
  const ormUnpack = createOrmBrowser({ getLocale, post }, "unpack");
  const textureModes = [texture, ormPack, ormUnpack];
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="texture-mode"]'))
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      for (const screen of textureModes) screen.clear();
      required<HTMLElement>("#texture-normal-panel").hidden = radio.value !== "normal";
      required<HTMLElement>("#orm-pack-panel").hidden = radio.value !== "pack";
      required<HTMLElement>("#orm-unpack-panel").hidden = radio.value !== "unpack";
    });
  document.addEventListener("screen-inspect-shown", () => viewer?.resize());

  output.set((locale) => createTranslator(locale).t("app.loading"));
  status.set((locale) => createTranslator(locale).t("status.preparing"));
  controller.subscribe(() => {
    for (const slot of [output, status, error]) slot.refresh();
    panel.refresh();
    detail.refresh();
    for (const screen of textureModes) screen.refresh();
    refreshLimitText();
  });

  function post(request: WorkerRequest, transfer: Transferable[] = []): void {
    worker.postMessage(request, transfer);
  }

  const loader = createFileLoader({
    getThresholds,
    status,
    error,
    getLocale,
    post: (request) => post(request, [request.bytes]),
    showGeometry: (result, file) => {
      loadingGeometry = true;
      panel.setIssues(result.issues);
      loadingGeometry = false;
      viewer?.setGeometry(result, visibleIssues);
      selectedIssue = null;
      detail.show(null);
      displayed = { ...file, result };
      jsonButton.disabled = false;
      markdownButton.disabled = false;
    },
    isReady: () => viewer !== null && workerAvailable,
    firstRequestId: VERSION_REQUEST_ID,
  });
  function openFile(file: File): Promise<void> {
    selectedIssue = null;
    panel.select(null);
    viewer?.selectIssue(null);
    detail.show(null);
    return loader.openFile(file);
  }

  const sampleButton = required<HTMLButtonElement>("#sample-button");
  sampleButton.addEventListener("click", async () => {
    error.set(null);
    status.set((locale) => createTranslator(locale).t("sample.loading"));
    try {
      await openFile(await fetchSampleFile());
    } catch {
      const text = (locale: Locale) => createTranslator(locale).t("sample.error");
      error.set(text);
      status.set(text);
    }
  });

  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    if (response.id === VERSION_REQUEST_ID) {
      if (response.type === "version") engineVersion = response.version;
      output.set((locale) =>
        response.type === "version"
          ? response.version
          : response.type === "error"
            ? createTranslator(locale).t("app.error", { message: response.message })
            : createTranslator(locale).t("app.unavailable"),
      );
      return;
    }
    for (const screen of textureModes) screen.handleResponse(response);
    void loader.handleResponse(response);
  });

  worker.addEventListener("error", () => {
    workerAvailable = false;
    output.set((locale) => createTranslator(locale).t("app.unavailable"));
    loader.failWorker();
    for (const screen of textureModes) screen.failWorker();
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
      error.set((locale) => createTranslator(locale).t("load.dropError"));
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
        status.set((locale) => createTranslator(locale).t("status.ready"));
      }
    } catch {
      status.set((locale) => createTranslator(locale).t("environment.webgl2.cause"));
      controls.disabled = true;
      canvas.setAttribute("aria-disabled", "true");
      canvas.tabIndex = -1;
    }
  }
  void initialize();
  return loader.rerun;
}
