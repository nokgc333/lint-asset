import { afterEach, expect, it, vi } from "vitest";
import type { WorkerResponse } from "./protocol";
import type { AnalyzeResult } from "./wasm/lint_core.mjs";

const { worker, downloadText, setGeometry } = vi.hoisted(() => ({
  worker: { addEventListener: vi.fn(), postMessage: vi.fn() },
  downloadText: vi.fn(),
  setGeometry: vi.fn(),
}));
vi.mock("./trusted-worker", () => ({ createModuleWorker: () => worker }));
vi.mock("./report/download", () => ({ downloadText }));
vi.mock("./issues/panel", () => ({ createIssuePanel: () => ({ setIssues: vi.fn() }) }));
vi.mock("./viewer/viewer", () => ({ createViewer: () => ({ setGeometry }) }));
vi.mock("./worker.ts?worker&url", () => ({ default: "/worker.js" }));

import { startApp } from "./app";

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
  ];
  const elements = new Map(
    selectors.map((id) => [
      id,
      Object.assign(new EventTarget(), {
        disabled: true,
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
  vi.stubGlobal("document", {
    querySelector: (selector: string) => elements.get(selector.slice(1)),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  startApp();
  await vi.dynamicImportSettled();
  const receive = (response: WorkerResponse) => {
    const listener = worker.addEventListener.mock.calls.find(([type]) => type === "message")?.[1];
    listener({ data: response });
  };
  receive({ id: 1, type: "version", version: "1.2.3" });
  expect(element("export-json").disabled).toBe(true);
  expect(element("export-markdown").disabled).toBe(true);
  const input = element("file");
  input.files = [new File(["data"], "<crate>.glb")];
  input.dispatchEvent(new Event("change"));
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
    issues: [],
    thresholds: { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 },
  };
  receive({ id: 2, type: "loaded", result });
  expect(setGeometry).toHaveBeenCalledWith(result);
  expect(element("export-json").disabled).toBe(false);
  expect(element("export-markdown").disabled).toBe(false);
  element("export-json").dispatchEvent(new Event("click"));
  const [name, mime, text] = downloadText.mock.calls[0] ?? [];
  expect(name).toBe("<crate>.lint.json");
  expect(mime).toBe("application/json;charset=utf-8");
  const report = JSON.parse(text);
  expect(report.asset).toEqual({ name: "<crate>.glb", format: "glb", size_bytes: 4 });
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
  expect(setGeometry).toHaveBeenCalledOnce();
});
