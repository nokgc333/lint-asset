import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFileLoader } from "./file-loader";
import { cancelLimit, confirmLimit } from "./limit-dialog";
import { DEFAULT_LIMITS, RAISED_LIMITS } from "./load-plan";
import type { WorkerRequest, WorkerResponse } from "./protocol";

vi.mock("./limit-dialog", () => ({ confirmLimit: vi.fn(), cancelLimit: vi.fn() }));

function setup() {
  const status = { textContent: "" };
  const error = { textContent: "" };
  const post = vi.fn<(request: Extract<WorkerRequest, { type: "load" }>) => void>();
  const showGeometry = vi.fn();
  const loader = createFileLoader({
    status,
    error,
    post,
    showGeometry,
    isReady: () => true,
    firstRequestId: 1,
  });
  return { ...loader, status, error, post, showGeometry };
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
    expect(confirmLimit).toHaveBeenCalledWith(expect.objectContaining({ reason: "size" }));
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
