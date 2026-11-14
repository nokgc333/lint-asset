import { describe, expect, it, vi } from "vitest";
import type { Locale } from "../i18n/locale";
import { createTextSlot } from "../i18n/text-slot";
import type { WorkerRequest } from "../protocol";
import { createTextureScreen } from "./texture-screen";

function header(width = 2, height = 2, depth = 8) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = depth;
  bytes[25] = 6;
  return bytes;
}
function setup(bytes = header()) {
  let locale: Locale = "en";
  const status = { textContent: "" };
  const error = { textContent: "" };
  const post = vi.fn();
  const readHeader = vi.fn(async () => bytes);
  const toPngBlob = vi.fn(async () => new Blob(["png"]));
  const decode = vi.fn(async () => ({ width: 2, height: 2, pixels: new ArrayBuffer(16) }));
  const confirm = vi.fn(async () => true);
  const showAfter = vi.fn();
  const warnings = vi.fn();
  const enabled = vi.fn();
  const download = vi.fn();
  const screen = createTextureScreen({
    status: createTextSlot(status, () => locale),
    error: createTextSlot(error, () => locale),
    getLocale: () => locale,
    readHeader,
    decode,
    post,
    confirm,
    showAfter,
    toPngBlob,
    download,
    showWarnings: warnings,
    setDownloadEnabled: enabled,
  });
  const respond = (overrides = {}) =>
    screen.handleResponse({
      id: (post.mock.calls.at(-1)?.[0] as WorkerRequest | undefined)?.id ?? -1,
      type: "flipped",
      pixels: new ArrayBuffer(16),
      result: { ok: true, code: "", message: "", translucent_pixels: 0 },
      ...overrides,
    });
  return {
    screen,
    readHeader,
    toPngBlob,
    status,
    error,
    post,
    decode,
    confirm,
    showAfter,
    warnings,
    enabled,
    download,
    respond,
    locale: () => {
      locale = "ja";
      screen.refresh();
    },
  };
}
const file = new File(["x"], "<normal>.png");
describe("texture controller", () => {
  it("transfers pixels, displays a result and downloads a relabelled PNG", async () => {
    const s = setup();
    await s.screen.openFile(file);
    const [request, transfer] = s.post.mock.calls[0] ?? [];
    expect(request.id).toBeGreaterThanOrEqual(1_000_000);
    expect(transfer).toEqual([request.pixels]);
    s.respond();
    expect(s.showAfter).toHaveBeenCalledOnce();
    expect(s.enabled).toHaveBeenLastCalledWith(true);
    s.screen.setDirection("gl-to-dx");
    expect(s.status.textContent).toContain("OpenGL to DirectX");
    await s.screen.download();
    expect(s.download).toHaveBeenCalledWith(expect.any(Blob), "<normal>.dx.png");
    expect(s.post).toHaveBeenCalledOnce();
    s.locale();
    expect(s.status.textContent).toContain("変換しました");
  });
  it.each([new Uint8Array(), header(0, 1), header(16385, 1), header(16384, 8193)])(
    "rejects invalid headers before decode",
    async (bytes) => {
      const s = setup(bytes);
      await s.screen.openFile(file);
      expect(s.decode).not.toHaveBeenCalled();
      expect(s.error.textContent).toMatch(/E-TEX-00[13]/);
      expect(s.status.textContent).toBe(s.error.textContent);
      s.locale();
      expect(s.error.textContent).toContain("画像");
    },
  );
  it.each([true, false])("confirms large images (%s)", async (accepted) => {
    const s = setup(header(8193, 8192));
    s.confirm.mockResolvedValue(accepted);
    await s.screen.openFile(file);
    expect(s.confirm).toHaveBeenCalledWith(expect.objectContaining({ reason: "pixels" }));
    expect(s.decode).toHaveBeenCalledTimes(accepted ? 1 : 0);
    if (!accepted) expect(s.status.textContent).toContain("Cancelled");
  });
  it("ignores an older worker result", async () => {
    const s = setup();
    await s.screen.openFile(file);
    const old = s.post.mock.calls[0]?.[0].id;
    await s.screen.openFile(new File(["x"], "new.png"));
    s.respond({ id: old });
    expect(s.showAfter).not.toHaveBeenCalled();
    s.respond();
    expect(s.status.textContent).toContain("new.png");
  });
  it("renders warnings and refreshes them in the current locale", async () => {
    const s = setup(header(2, 2, 16));
    await s.screen.openFile(file);
    s.respond({ result: { ok: true, code: "", message: "", translucent_pixels: 1 } });
    expect(s.warnings.mock.calls.at(-1)?.[0]).toEqual([
      expect.stringContaining("1 pixel"),
      expect.stringContaining("16-bit"),
    ]);
    s.locale();
    expect(s.warnings.mock.calls.at(-1)?.[0][0]).toContain("半透明");
  });
  it.each(["E-TEX-001", "E-TEX-003"])("translates core error %s", async (code) => {
    const s = setup();
    await s.screen.openFile(file);
    s.respond({ result: { ok: false, code, message: "raw", translucent_pixels: 0 } });
    expect(s.error.textContent).toContain(code);
    expect(s.status.textContent).toBe(s.error.textContent);
    expect(s.showAfter).not.toHaveBeenCalled();
  });
  it("reports decode and worker failures in both slots", async () => {
    const s = setup();
    s.decode.mockRejectedValueOnce(new Error("decode"));
    await s.screen.openFile(file);
    expect(s.error.textContent).toContain("E-TEX-001");
    await s.screen.openFile(file);
    s.respond({ type: "error", message: "raw" });
    expect(s.error.textContent).toContain("worker");
    expect(s.status.textContent).toBe(s.error.textContent);
    s.screen.failWorker();
    await s.screen.openFile(file);
    expect(s.post).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it("ignores a superseded header and a superseded confirmation", async () => {
  const s = setup();
  const headerRead = deferred<ReturnType<typeof header>>();
  s.readHeader.mockReturnValueOnce(headerRead.promise);
  const old = s.screen.openFile(file);
  await s.screen.openFile(new File(["x"], "new.png"));
  headerRead.resolve(header());
  await old;
  expect(s.decode).toHaveBeenCalledOnce();
  expect(s.post).toHaveBeenCalledOnce();
  const large = setup(header(8193, 8192));
  const confirmation = deferred<boolean>();
  large.confirm.mockReturnValueOnce(confirmation.promise);
  const pending = large.screen.openFile(file);
  await Promise.resolve();
  large.readHeader.mockResolvedValueOnce(header());
  await large.screen.openFile(new File(["x"], "new.png"));
  confirmation.resolve(false);
  await pending;
  expect(large.decode).toHaveBeenCalledOnce();
  expect(large.status.textContent).toContain("new.png");
});
it("ignores a superseded decode, but translates an in-flight result using the current locale", async () => {
  const s = setup();
  const pixels = deferred<{ width: number; height: number; pixels: ArrayBuffer }>();
  s.decode.mockReturnValueOnce(pixels.promise);
  const old = s.screen.openFile(file);
  await Promise.resolve();
  await s.screen.openFile(new File(["x"], "new.png"));
  pixels.resolve({ width: 2, height: 2, pixels: new ArrayBuffer(16) });
  await old;
  expect(s.post).toHaveBeenCalledOnce();
  s.locale();
  expect(s.status.textContent).toContain("読み込んでいます");
  s.respond();
  expect(s.status.textContent).toContain("変換しました");
  expect(s.showAfter).toHaveBeenCalledOnce();
});
it("reports header read failures and invalid decoded dimensions", async () => {
  const s = setup();
  s.readHeader.mockRejectedValueOnce(new Error("read"));
  await s.screen.openFile(file);
  expect(s.error.textContent).toContain("E-TEX-001");
  s.decode.mockResolvedValueOnce({ width: 3, height: 2, pixels: new ArrayBuffer(24) });
  await s.screen.openFile(file);
  expect(s.status.textContent).toBe(s.error.textContent);
  expect(s.post).not.toHaveBeenCalled();
});
it("reports a failed post as a worker error", async () => {
  const s = setup();
  s.post.mockImplementationOnce(() => {
    throw new Error("post failed");
  });
  await s.screen.openFile(file);
  expect(s.error.textContent).toContain("worker");
  expect(s.status.textContent).toBe(s.error.textContent);
});
it("does not download a stale PNG and reports encoding failures", async () => {
  const s = setup();
  await s.screen.openFile(file);
  s.respond();
  const png = deferred<Blob>();
  s.toPngBlob.mockReturnValueOnce(png.promise);
  const saving = s.screen.download();
  await s.screen.openFile(new File(["x"], "new.png"));
  png.resolve(new Blob(["old"]));
  await saving;
  expect(s.download).not.toHaveBeenCalled();
  s.respond();
  s.toPngBlob.mockRejectedValueOnce(new Error("encode"));
  await s.screen.download();
  expect(s.error.textContent).toContain("E-TEX-001");
  expect(s.enabled).toHaveBeenLastCalledWith(false);
});
it("shows the ICC warning after a conversion", async () => {
  const bytes = new Uint8Array(45);
  bytes.set(header());
  bytes.set([105, 67, 67, 80], 37);
  const s = setup(bytes);
  await s.screen.openFile(file);
  s.respond();
  expect(s.warnings).toHaveBeenLastCalledWith([expect.stringContaining("embedded color profile")]);
});
