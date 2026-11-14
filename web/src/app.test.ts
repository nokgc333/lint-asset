import { afterEach, expect, it, vi } from "vitest";
import type { WorkerResponse } from "./protocol";
import type { AnalyzeResult, Issue } from "./wasm/lint_core.mjs";

const {
  worker,
  downloadText,
  setGeometry,
  setVisibleIssues,
  selectIssue,
  detail,
  issuePanel,
  createIssuePanel,
  textureScreens,
} = vi.hoisted(() => {
  const issuePanel = { setIssues: vi.fn(), refresh: vi.fn(), select: vi.fn() };
  return {
    worker: { addEventListener: vi.fn(), postMessage: vi.fn() },
    downloadText: vi.fn(),
    setGeometry: vi.fn(),
    setVisibleIssues: vi.fn(),
    selectIssue: vi.fn(),
    detail: { show: vi.fn(), refresh: vi.fn() },
    issuePanel,
    createIssuePanel: vi.fn(
      (options: {
        onSelect: (issue: Issue | null) => void;
        onVisibleChange: (visible: readonly Issue[]) => void;
      }) => {
        issuePanel.setIssues.mockImplementation((issues: readonly Issue[]) =>
          options.onVisibleChange(issues.slice(0, 1)),
        );
        return issuePanel;
      },
    ),
    textureScreens: Array.from({ length: 3 }, () => ({
      clear: vi.fn(),
      refresh: vi.fn(),
      handleResponse: vi.fn(),
      failWorker: vi.fn(),
    })),
  };
});
vi.mock("./texture/texture-browser", () => ({
  createTextureBrowser: () => textureScreens[0],
}));
vi.mock("./texture/orm-browser", () => ({
  createOrmBrowser: (_options: unknown, mode: string) => textureScreens[mode === "pack" ? 1 : 2],
}));
vi.mock("./trusted-worker", () => ({ createModuleWorker: () => worker }));
vi.mock("./report/download", () => ({ downloadText }));
vi.mock("./issues/panel", () => ({
  createIssuePanel,
}));
vi.mock("./issues/detail-panel", () => ({ createDetailPanel: () => detail }));
vi.mock("./viewer/viewer", () => ({
  createViewer: () => ({ setGeometry, setVisibleIssues, selectIssue }),
}));
vi.mock("./worker.ts?worker&url", () => ({ default: "/worker.js" }));

import { startApp } from "./app";
import { createLocaleController } from "./i18n/locale-controller";
import { DEFAULT_THRESHOLDS } from "./settings/thresholds";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("exports the displayed model with the engine version and retains it after a failed load", async () => {
  const selectors = [
    "engine-version",
    "status",
    "viewer",
    "file",
    "controls",
    "error",
    "drop-zone",
    "wireframe",
    "normals",
    "export-json",
    "export-markdown",
    "sample-button",
    "texture-normal-panel",
    "orm-pack-panel",
    "orm-unpack-panel",
  ];
  const elements = new Map(
    selectors.map((id) => [
      id,
      Object.assign(new EventTarget(), {
        disabled: true,
        hidden: false,
        textContent: "",
        value: "",
        files: [] as File[],
        querySelectorAll: () => [],
      }),
    ]),
  );
  const element = (id: string) => {
    const value = elements.get(id);
    if (!value) throw new Error(`Missing test element: ${id}`);
    return value;
  };
  const radios = ["normal", "pack", "unpack"].map((value) =>
    Object.assign(new EventTarget(), { value, checked: false }),
  );
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    querySelector: (selector: string) => elements.get(selector.slice(1)),
    querySelectorAll: () => radios,
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  const controller = createLocaleController({ storage: null, languages: ["en"] });
  startApp(controller, () => DEFAULT_THRESHOLDS);
  await vi.dynamicImportSettled();
  const receive = (response: WorkerResponse) => {
    const listener = worker.addEventListener.mock.calls.find(([type]) => type === "message")?.[1];
    listener({ data: response });
  };
  receive({ id: 1, type: "version", version: "1.2.3" });
  expect(element("export-json").disabled).toBe(true);
  expect(element("export-markdown").disabled).toBe(true);
  const selected: Issue = {
    rule: "uv.missing",
    severity: "warning",
    message: "The primitive has no UV coordinates.",
    element_kind: "triangle",
    target: { mesh: 0, primitive: 0 },
    count: 1,
    elements: [0],
    truncated: false,
  };
  const onSelect = createIssuePanel.mock.calls[0]?.[0].onSelect;
  onSelect?.(selected);
  expect(selectIssue).toHaveBeenLastCalledWith(selected);
  expect(detail.show).toHaveBeenLastCalledWith(selected);
  onSelect?.(null);
  expect(selectIssue).toHaveBeenLastCalledWith(null);
  expect(detail.show).toHaveBeenLastCalledWith(null);
  onSelect?.(selected);
  const input = element("file");
  input.files = [new File(["data"], "<crate>.glb")];
  input.dispatchEvent(new Event("change"));
  expect(issuePanel.select).toHaveBeenLastCalledWith(null);
  expect(selectIssue).toHaveBeenLastCalledWith(null);
  expect(detail.show).toHaveBeenLastCalledWith(null);
  await vi.dynamicImportSettled();
  const result: AnalyzeResult = {
    ok: true,
    code: "",
    message: "",
    meshes: 1,
    primitives: 1,
    triangles: 12,
    parts: [],
    instances: [],
    issues: [selected, { ...selected, severity: "info" }],
    thresholds: { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 },
  };
  receive({ id: 2, type: "loaded", result });
  expect(setGeometry).toHaveBeenCalledWith(result, [selected]);
  expect(setVisibleIssues).not.toHaveBeenCalled();
  const onVisibleChange = createIssuePanel.mock.calls[0]?.[0].onVisibleChange;
  onSelect?.(selected);
  onVisibleChange?.([selected]);
  expect(setVisibleIssues).not.toHaveBeenCalled();
  onVisibleChange?.(result.issues);
  expect(setVisibleIssues).toHaveBeenCalledOnce();
  onVisibleChange?.([...result.issues].reverse());
  expect(setVisibleIssues).toHaveBeenCalledOnce();
  expect(detail.show).toHaveBeenLastCalledWith(selected);
  onVisibleChange?.([]);
  expect(setVisibleIssues).toHaveBeenLastCalledWith([]);
  expect(detail.show).toHaveBeenLastCalledWith(null);
  expect(element("export-json").disabled).toBe(false);
  expect(element("export-markdown").disabled).toBe(false);
  element("export-json").dispatchEvent(new Event("click"));
  const [name, mime, text] = downloadText.mock.calls[0] ?? [];
  expect(name).toBe("<crate>.lint.json");
  expect(mime).toBe("application/json;charset=utf-8");
  const report = JSON.parse(text);
  expect(report.asset).toEqual({ name: "<crate>.glb", format: "glb", size_bytes: 4 });
  expect(report.issues).toEqual(result.issues);
  expect(report.tool.version).toBe("1.2.3");
  expect(report.thresholds).toEqual(result.thresholds);
  expect(report.generated_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
  input.files = [new File(["bad"], "failed.glb")];
  input.dispatchEvent(new Event("change"));
  await vi.dynamicImportSettled();
  receive({
    id: 3,
    type: "loaded",
    result: { ...result, ok: false, code: "E-LOAD-002", message: "Damaged" },
  });
  expect(element("export-json").disabled).toBe(false);
  expect(element("export-markdown").disabled).toBe(false);
  element("export-markdown").dispatchEvent(new Event("click"));
  expect(downloadText).toHaveBeenLastCalledWith(
    "<crate>.lint.md",
    "text/markdown;charset=utf-8",
    expect.stringContaining("# lint-asset report: \\<crate\\>.glb"),
  );
  controller.set("ja");
  expect(detail.refresh).toHaveBeenCalledOnce();
  expect(element("status").textContent).toContain("GLB");
  expect(element("error").textContent).toContain("壊れている");
  element("export-markdown").dispatchEvent(new Event("click"));
  expect(downloadText.mock.calls.at(-1)?.[2]).toContain("レポート");
  element("export-json").dispatchEvent(new Event("click"));
  expect(JSON.parse(downloadText.mock.calls.at(-1)?.[2]).asset).toEqual(report.asset);
  expect(setGeometry).toHaveBeenCalledOnce();
  for (const screen of textureScreens) expect(screen.refresh).toHaveBeenCalled();
  for (const radio of radios) {
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));
    expect(element("texture-normal-panel").hidden).toBe(radio.value !== "normal");
    expect(element("orm-pack-panel").hidden).toBe(radio.value !== "pack");
    expect(element("orm-unpack-panel").hidden).toBe(radio.value !== "unpack");
    radio.checked = false;
  }
  for (const screen of textureScreens) expect(screen.clear).toHaveBeenCalledTimes(3);
  const ormResponse: WorkerResponse = {
    id: 2_000_000,
    type: "unpackedOrm",
    result: {
      ok: true,
      code: "",
      message: "",
      occlusion: new Uint8ClampedArray(4),
      roughness: new Uint8ClampedArray(4),
      metallic: new Uint8ClampedArray(4),
      translucent_pixels: 0,
    },
  };
  receive(ormResponse);
  for (const screen of textureScreens)
    expect(screen.handleResponse).toHaveBeenLastCalledWith(ormResponse);
  const failure = worker.addEventListener.mock.calls.find(([type]) => type === "error")?.[1];
  failure();
  for (const screen of textureScreens) expect(screen.failWorker).toHaveBeenCalledOnce();
});
