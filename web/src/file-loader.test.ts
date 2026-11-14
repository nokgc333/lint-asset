import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFileLoader } from "./file-loader";
import { createTextSlot } from "./i18n/text-slot";
import { cancelLimit, confirmLimit } from "./limit-dialog";
import { DEFAULT_LIMITS, RAISED_LIMITS } from "./load-plan";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { DEFAULT_THRESHOLDS } from "./settings/thresholds";

vi.mock("./limit-dialog", () => ({ confirmLimit: vi.fn(), cancelLimit: vi.fn() }));

function setup(
  getLocale: () => "en" | "ja" = () => "en",
  getThresholds = () => DEFAULT_THRESHOLDS,
) {
  const status = { textContent: "" };
  const error = { textContent: "" };
  const post = vi.fn<(request: Extract<WorkerRequest, { type: "load" }>) => void>();
  const showGeometry = vi.fn();
  const statusSlot = createTextSlot(status, getLocale);
  const errorSlot = createTextSlot(error, getLocale);
  const refresh = () => {
    statusSlot.refresh();
    errorSlot.refresh();
  };
  const loader = createFileLoader({
    status: statusSlot,
    error: errorSlot,
    getLocale,
    getThresholds,
    post,
    showGeometry,
    isReady: () => true,
    firstRequestId: 1,
  });
  return { ...loader, status, error, post, showGeometry, refresh };
}

function fileOfSize(size: number, name = "model.glb") {
  const file = new File([new Uint8Array(1)], name);
  Object.defineProperty(file, "size", { value: size });
  const read = vi.spyOn(file, "arrayBuffer");
  return { file, read };
}

function failure(id: number, code = "E-LOAD-003"): WorkerResponse {
  return {
    id,
    type: "loaded",
    result: {
      ok: false,
      code: code as "E-LOAD-003",
      message: "Technical detail",
      meshes: 0,
      primitives: 0,
      triangles: 0,
      parts: [],
      instances: [],
      issues: [],
      thresholds: { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 },
    },
  };
}

beforeEach(() => vi.resetAllMocks());

describe("file loading", () => {
  it("refreshes loading, size rejection and worker errors without losing untrusted file text", async () => {
    let locale: "en" | "ja" = "en";
    const loader = setup(() => locale);
    await loader.openFile(fileOfSize(1, "<img>.glb").file);
    locale = "ja";
    loader.refresh();
    expect(loader.status.textContent).toContain("<img>.glb");
    expect(loader.status.textContent).not.toContain("Loading");
    await loader.openFile(fileOfSize(RAISED_LIMITS.maxFileBytes + 1, "<img>.glb").file);
    expect(loader.error.textContent).toContain("<img>.glb");
    expect(loader.error.textContent).not.toContain("is larger than");
    locale = "en";
    loader.refresh();
    expect(loader.error.textContent).toContain("<img>.glb is larger than 200 MiB");
    loader.failWorker();
    expect(loader.error.textContent).toContain("The geometry worker is unavailable.");
    locale = "ja";
    loader.refresh();
    expect(loader.error.textContent).not.toContain("The geometry worker is unavailable.");
  });
  it("rejects oversized files before reading and treats names as text", async () => {
    const loader = setup();
    const { file, read } = fileOfSize(RAISED_LIMITS.maxFileBytes + 1, "<img>.glb");
    await loader.openFile(file);
    expect(read).not.toHaveBeenCalled();
    expect(loader.post).not.toHaveBeenCalled();
    expect(loader.error.textContent).toContain("<img>.glb is larger than 200 MiB");
  });

  it("does not read a large file when its confirmation is cancelled", async () => {
    vi.mocked(confirmLimit).mockResolvedValue(false);
    const loader = setup();
    const { file, read } = fileOfSize(DEFAULT_LIMITS.maxFileBytes + 1);
    await loader.openFile(file);
    expect(read).not.toHaveBeenCalled();
    expect(loader.status.textContent).toBe("Cancelled.");
  });

  it("loads a confirmed large file with raised limits", async () => {
    vi.mocked(confirmLimit).mockResolvedValue(true);
    const loader = setup();
    const { file } = fileOfSize(DEFAULT_LIMITS.maxFileBytes + 1);
    await loader.openFile(file);
    expect(loader.post).toHaveBeenCalledWith(expect.objectContaining(RAISED_LIMITS));
    expect(confirmLimit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "size" }),
      expect.any(Function),
    );
  });

  it("re-reads and retries a triangle failure once with a new id and raised limits", async () => {
    vi.mocked(confirmLimit).mockResolvedValue(true);
    const loader = setup();
    const { file, read } = fileOfSize(1);
    await loader.openFile(file);
    const first = loader.post.mock.calls[0]?.[0];
    expect(first).toMatchObject(DEFAULT_LIMITS);
    await loader.handleResponse(failure(first?.id ?? 0));
    const retry = loader.post.mock.calls[1]?.[0];
    expect(read).toHaveBeenCalledTimes(2);
    expect(retry).toMatchObject(RAISED_LIMITS);
    expect(retry?.id).not.toBe(first?.id);
    await loader.handleResponse(failure(retry?.id ?? 0));
    expect(confirmLimit).toHaveBeenCalledTimes(1);
    expect(loader.error.textContent).toContain("E-LOAD-003");
    expect(loader.showGeometry).not.toHaveBeenCalled();
  });

  it("keeps the error and previous geometry when a triangle retry is cancelled", async () => {
    vi.mocked(confirmLimit).mockResolvedValue(false);
    const loader = setup();
    await loader.openFile(fileOfSize(1).file);
    await loader.handleResponse(failure(loader.post.mock.calls[0]?.[0].id ?? 0));
    expect(loader.error.textContent).toContain("Technical detail");
    expect(loader.post).toHaveBeenCalledTimes(1);
    expect(loader.showGeometry).not.toHaveBeenCalled();
  });

  it("ignores old responses and a confirmation that finishes after a new selection", async () => {
    let confirm: (value: boolean) => void = () => {};
    vi.mocked(confirmLimit).mockImplementation(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const loader = setup();
    const old = fileOfSize(DEFAULT_LIMITS.maxFileBytes + 1);
    const pending = loader.openFile(old.file);
    await loader.openFile(fileOfSize(1, "new.glb").file);
    confirm(true);
    await pending;
    await loader.handleResponse(failure(2));
    expect(old.read).not.toHaveBeenCalled();
    expect(loader.post).toHaveBeenCalledTimes(1);
    expect(loader.error.textContent).toBe("");
    expect(cancelLimit).toHaveBeenCalledTimes(2);
  });

  it("reports read failures in the alert region", async () => {
    const loader = setup();
    const { file, read } = fileOfSize(1);
    read.mockRejectedValue(new Error("Read failed"));
    await loader.openFile(file);
    expect(loader.error.textContent).toContain("E-LOAD-002");
    expect(loader.error.textContent).toContain("Read failed");
  });

  it("shows non-limit errors without offering a retry", async () => {
    const loader = setup();
    await loader.openFile(fileOfSize(1).file);
    await loader.handleResponse(failure(loader.post.mock.calls[0]?.[0].id ?? 0, "E-LOAD-004"));
    expect(confirmLimit).not.toHaveBeenCalled();
    expect(loader.error.textContent).toContain("extension");
  });

  it("clears an earlier error on success and displays geometry counts", async () => {
    const loader = setup();
    await loader.openFile(fileOfSize(1).file);
    loader.error.textContent = "Earlier error";
    await loader.handleResponse({
      id: loader.post.mock.calls[0]?.[0].id ?? 0,
      type: "loaded",
      result: {
        ok: true,
        code: "",
        message: "",
        meshes: 1,
        primitives: 1,
        triangles: 3,
        parts: [],
        instances: [],
        issues: [],
        thresholds: { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 },
      },
    });
    expect(loader.error.textContent).toBe("");
    expect(loader.status.textContent).toBe("model.glb: 1 mesh, 1 primitive, 3 triangles");
    expect(loader.showGeometry).toHaveBeenCalledTimes(1);
    expect(loader.showGeometry).toHaveBeenCalledWith(expect.objectContaining({ ok: true }), {
      name: "model.glb",
      size: 1,
    });
    await loader.openFile(fileOfSize(2, "failed.glb").file);
    await loader.handleResponse(failure(loader.post.mock.calls.at(-1)?.[0].id ?? 0, "E-LOAD-004"));
    expect(loader.showGeometry).toHaveBeenCalledTimes(1);
  });
});

function success(id: number): WorkerResponse {
  return {
    id,
    type: "loaded",
    result: {
      ok: true,
      code: "",
      message: "",
      meshes: 1,
      primitives: 1,
      triangles: 12,
      parts: [],
      instances: [],
      issues: [],
      thresholds: DEFAULT_THRESHOLDS,
    },
  };
}

it("reruns the displayed file with current thresholds and the same raised limits without confirmation", async () => {
  let thresholds = DEFAULT_THRESHOLDS;
  const loader = setup(
    () => "en",
    () => thresholds,
  );
  loader.rerun();
  expect(loader.post).not.toHaveBeenCalled();
  vi.mocked(confirmLimit).mockResolvedValue(true);
  await loader.openFile(fileOfSize(DEFAULT_LIMITS.maxFileBytes + 1).file);
  await loader.handleResponse(success(loader.post.mock.calls[0]?.[0].id ?? 0));
  thresholds = { max_triangles: 50, min_extent_m: 0.1, max_extent_m: 20 };
  loader.rerun();
  expect(loader.status.textContent).toContain("Loading");
  await vi.waitFor(() => expect(loader.post).toHaveBeenCalledTimes(2));
  const request = loader.post.mock.calls[1]?.[0];
  expect(request).toMatchObject({ ...RAISED_LIMITS, thresholds });
  expect(confirmLimit).toHaveBeenCalledTimes(1);
  await loader.handleResponse(success(request?.id ?? 0));
  expect(loader.showGeometry).toHaveBeenCalledTimes(2);
  expect(loader.status.textContent).toContain("12 triangles");
});

it("ignores stale reruns and reports rerun failure without offering raised limits", async () => {
  const loader = setup();
  await loader.openFile(fileOfSize(1).file);
  await loader.handleResponse(success(loader.post.mock.calls[0]?.[0].id ?? 0));
  loader.rerun();
  await vi.waitFor(() => expect(loader.post).toHaveBeenCalledTimes(2));
  const stale = loader.post.mock.calls[1]?.[0].id ?? 0;
  loader.rerun();
  await vi.waitFor(() => expect(loader.post).toHaveBeenCalledTimes(3));
  await loader.handleResponse(success(stale));
  expect(loader.showGeometry).toHaveBeenCalledTimes(1);
  await loader.handleResponse(failure(loader.post.mock.calls[2]?.[0].id ?? 0));
  expect(loader.error.textContent).toContain("E-LOAD-003");
  expect(confirmLimit).not.toHaveBeenCalled();
});
