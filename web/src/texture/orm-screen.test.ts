import { describe, expect, it, vi } from "vitest";
import type { Locale } from "../i18n/locale";
import { createTextSlot } from "../i18n/text-slot";
import type { WorkerRequest, WorkerResponse } from "../protocol";
import { ORM_CHANNELS } from "./orm-plan";
import { createOrmScreen } from "./orm-screen";
import { DEFAULT_MAX_PIXELS, RAISED_MAX_PIXELS } from "./texture-plan";

function header(width = 2, height = 2, depth = 8, icc = false) {
  const bytes = new Uint8Array(icc ? 45 : 33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = depth;
  bytes[25] = 6;
  if (icc) bytes.set([105, 67, 67, 80], 37);
  return bytes;
}
const files = ["rock_ao.png", "rock_roughness.png", "rock_metallic.png"].map(
  (name) => new File(["image"], name),
);
const packed = () => ({
  ok: true as const,
  code: "" as const,
  message: "" as const,
  pixels: new Uint8ClampedArray(16),
  non_gray_pixels: [0, 0, 0] as [number, number, number],
  translucent_pixels: 0,
});
const unpacked = () => ({
  ok: true as const,
  code: "" as const,
  message: "" as const,
  occlusion: new Uint8ClampedArray(16),
  roughness: new Uint8ClampedArray(16),
  metallic: new Uint8ClampedArray(16),
  translucent_pixels: 0,
});
function setup(mode: "pack" | "unpack" = "pack") {
  let locale: Locale = "en";
  const status = { textContent: "" };
  const error = { textContent: "" };
  const readHeader = vi.fn(async (_file: File) => header());
  const decode = vi.fn(async (_file: File, _index: number) => ({
    width: 2,
    height: 2,
    pixels: new ArrayBuffer(16),
  }));
  const post = vi.fn();
  const showResult = vi.fn();
  const showWarnings = vi.fn();
  const showDefaults = vi.fn();
  const enabled = vi.fn();
  const confirm = vi.fn(async () => true);
  const toPngBlob = vi.fn(async (_output: string) => new Blob(["png"]));
  const download = vi.fn();
  const delay = vi.fn(async () => {});
  const clear = vi.fn();
  const screen = createOrmScreen({
    mode,
    getLocale: () => locale,
    status: createTextSlot(status, () => locale),
    error: createTextSlot(error, () => locale),
    readHeader,
    decode,
    post,
    showResult,
    showWarnings,
    showDefaults,
    setDownloadEnabled: enabled,
    confirm,
    toPngBlob,
    download,
    delay,
    clear,
  });
  function respond(response?: WorkerResponse) {
    const request = post.mock.calls.at(-1)?.[0] as WorkerRequest;
    screen.handleResponse(
      response ??
        (mode === "pack"
          ? { id: request.id, type: "packedOrm", result: packed() }
          : { id: request.id, type: "unpackedOrm", result: unpacked() }),
    );
  }
  return {
    screen,
    readHeader,
    decode,
    post,
    showResult,
    showWarnings,
    showDefaults,
    enabled,
    confirm,
    toPngBlob,
    download,
    delay,
    clear,
    status,
    error,
    respond,
    request: () => post.mock.calls.at(-1)?.[0] as WorkerRequest,
    japanese() {
      locale = "ja";
      screen.refresh();
    },
  };
}

describe("ORM packing controller", () => {
  it.each([1, 2, 3])(
    "automatically packs %i input(s), transfers only present buffers and names defaults",
    async (count) => {
      const s = setup();
      for (let index = 0; index < count; index++)
        await s.screen.setInput(index, files[index] ?? null);
      const request = s.request();
      expect(request.type).toBe("packOrm");
      if (request.type !== "packOrm") throw new Error("Expected packing request");
      expect(request.id).toBeGreaterThanOrEqual(2_000_000);
      expect(request.maxPixels).toBe(DEFAULT_MAX_PIXELS);
      expect(request.inputs.map(Boolean)).toEqual([true, count >= 2, count === 3]);
      expect(s.post.mock.calls.at(-1)?.[1]).toEqual(request.inputs.filter(Boolean));
      s.respond();
      expect(s.showResult).toHaveBeenCalledWith("packed", expect.any(Uint8ClampedArray), 2, 2);
      expect(s.enabled).toHaveBeenLastCalledWith(true);
      const notes = s.showDefaults.mock.calls.at(-1)?.[0] as string[];
      expect(notes).toHaveLength(3 - count);
      if (count === 1)
        expect(notes).toEqual([
          "No roughness texture: filled with white (255).",
          "No metallic texture: filled with black (0).",
        ]);
      expect(s.status.textContent).toContain(
        `packed from ${count} texture${count === 1 ? "" : "s"}`,
      );
      await s.screen.download("packed");
      expect(s.download).toHaveBeenCalledWith(expect.any(Blob), "rock_orm.png");
      s.japanese();
      expect(s.status.textContent).toContain("合成しました");
      expect(s.showDefaults.mock.calls.at(-1)?.[0]).toHaveLength(3 - count);
    },
  );

  it("uses the first present channel and removes an input", async () => {
    const s = setup();
    await s.screen.setInput(1, files[1] ?? null);
    s.respond();
    expect(s.showDefaults.mock.calls.at(-1)?.[0]).toEqual([
      "No occlusion texture: filled with white (255).",
      "No metallic texture: filled with black (0).",
    ]);
    await s.screen.setInput(1, null);
    expect(s.status.textContent).toContain("Open at least one");
    expect(s.enabled).toHaveBeenLastCalledWith(false);
    await s.screen.download("packed");
    expect(s.download).not.toHaveBeenCalled();
  });

  it.each([
    [header(3, 2), "E-TEX-002"],
    [new Uint8Array(), "E-TEX-001"],
    [header(20000, 20000), "E-TEX-003"],
  ])(
    "rejects mismatched, unsupported and oversized inputs before decoding",
    async (bytes, code) => {
      const s = setup();
      s.readHeader.mockImplementation(async (file) => (file === files[0] ? header() : bytes));
      await s.screen.setInput(0, files[0] ?? null);
      s.decode.mockClear();
      s.post.mockClear();
      await s.screen.setInput(1, files[1] ?? null);
      expect(s.decode).not.toHaveBeenCalled();
      expect(s.post).not.toHaveBeenCalled();
      expect(s.error.textContent).toContain(code);
      expect(s.status.textContent).toBe(s.error.textContent);
      s.japanese();
      expect(s.error.textContent).toContain(code);
    },
  );

  it.each([true, false])("confirms before decoding large inputs: %s", async (accepted) => {
    const s = setup();
    s.readHeader.mockResolvedValue(header(9000, 9000));
    s.decode.mockResolvedValue({ width: 9000, height: 9000, pixels: new ArrayBuffer(4) });
    s.confirm.mockResolvedValue(accepted);
    await s.screen.setInput(0, files[0] ?? null);
    expect(s.confirm).toHaveBeenCalledWith({
      reason: "pixels",
      fileName: "rock_ao.png",
      width: 9000,
      height: 9000,
      maxPixels: RAISED_MAX_PIXELS,
    });
    expect(s.decode).toHaveBeenCalledTimes(accepted ? 1 : 0);
    if (accepted) expect(s.request()).toMatchObject({ maxPixels: RAISED_MAX_PIXELS });
    else {
      expect(s.post).not.toHaveBeenCalled();
      expect(s.status.textContent).toBe("Cancelled.");
      s.japanese();
      expect(s.status.textContent).toBe("キャンセルしました。");
    }
  });

  it("ignores superseded worker replies, duplicate replies and replies for other operations", async () => {
    const s = setup();
    await s.screen.setInput(0, files[0] ?? null);
    const old = s.request().id;
    await s.screen.setInput(1, files[1] ?? null);
    s.respond({ id: old, type: "packedOrm", result: packed() });
    s.respond({ id: s.request().id, type: "unpackedOrm", result: unpacked() });
    expect(s.showResult).not.toHaveBeenCalled();
    s.respond();
    s.respond();
    expect(s.showResult).toHaveBeenCalledOnce();
  });

  it.each(["header", "confirm", "decode"])(
    "cancels a conversion while awaiting %s",
    async (stage) => {
      const s = setup();
      let finish = () => {};
      if (stage === "header")
        s.readHeader.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(header());
            }),
        );
      if (stage === "confirm") {
        s.readHeader.mockResolvedValue(header(9000, 9000));
        s.confirm.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(true);
            }),
        );
      }
      if (stage === "decode")
        s.decode.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve({ width: 2, height: 2, pixels: new ArrayBuffer(16) });
            }),
        );
      const opening = s.screen.setInput(0, files[0] ?? null);
      await vi.waitFor(() =>
        expect(
          stage === "header" ? s.readHeader : stage === "confirm" ? s.confirm : s.decode,
        ).toHaveBeenCalled(),
      );
      s.screen.clear();
      finish();
      await opening;
      expect(s.post).not.toHaveBeenCalled();
      expect(s.status.textContent).toBe("");
    },
  );

  it("names non-gray, 16-bit and ICC inputs, totals transparency and translates the warnings", async () => {
    const s = setup();
    s.readHeader.mockResolvedValue(header(2, 2, 16, true));
    await s.screen.setInput(1, files[1] ?? null);
    s.respond({
      id: s.request().id,
      type: "packedOrm",
      result: { ...packed(), non_gray_pixels: [0, 3, 0], translucent_pixels: 2 },
    });
    const warnings = s.showWarnings.mock.calls.at(-1)?.[0] as string[];
    expect(warnings).toHaveLength(4);
    expect(warnings.join(" ")).toContain("roughness");
    expect(warnings.join(" ")).toContain("16-bit");
    expect(warnings.join(" ")).toContain("color profile");
    expect(warnings.join(" ")).toContain("3 pixels that are not gray");
    expect(warnings.join(" ")).toContain("2 pixels");
    s.japanese();
    expect(s.showWarnings.mock.calls.at(-1)?.[0].join(" ")).toContain("ラフネス");
    expect(s.showDefaults.mock.calls.at(-1)?.[0].join(" ")).toContain("オクルージョン");
  });
});

describe("ORM unpacking controller", () => {
  it("transfers an input, shows three results and downloads each PNG", async () => {
    const s = setup("unpack");
    await s.screen.setInput(0, new File(["png"], "rock_orm.png"));
    const request = s.request();
    expect(request).toMatchObject({
      type: "unpackOrm",
      width: 2,
      height: 2,
      maxPixels: DEFAULT_MAX_PIXELS,
    });
    if (request.type !== "unpackOrm") throw new Error("Expected unpacking request");
    expect(s.post.mock.calls.at(-1)?.[1]).toEqual([request.pixels]);
    s.respond();
    expect(s.showResult.mock.calls.map(([channel]) => channel)).toEqual(ORM_CHANNELS);
    expect(s.status.textContent).toContain("split into three");
    expect(s.enabled).toHaveBeenLastCalledWith(true);
    for (const channel of ORM_CHANNELS) await s.screen.download(channel);
    expect(s.download.mock.calls.map(([, name]) => name)).toEqual([
      "rock_occlusion.png",
      "rock_roughness.png",
      "rock_metallic.png",
    ]);
    s.download.mockClear();
    await s.screen.downloadAll();
    expect(s.download).toHaveBeenCalledTimes(3);
    expect(s.delay).toHaveBeenCalledTimes(2);
    expect(s.download.mock.invocationCallOrder[0]).toBeLessThan(
      s.delay.mock.invocationCallOrder[0] ?? 0,
    );
    expect(s.delay.mock.invocationCallOrder[0]).toBeLessThan(
      s.download.mock.invocationCallOrder[1] ?? 0,
    );
    expect(s.delay.mock.invocationCallOrder[1]).toBeLessThan(
      s.download.mock.invocationCallOrder[2] ?? 0,
    );
    s.japanese();
    expect(s.status.textContent).toContain("分解しました");
  });

  it("cancels save-all between downloads when cleared", async () => {
    const s = setup("unpack");
    await s.screen.setInput(0, files[0] ?? null);
    s.respond();
    s.delay.mockImplementation(async () => {
      s.screen.clear();
    });
    await s.screen.downloadAll();
    expect(s.download).toHaveBeenCalledOnce();
  });

  it("shows the normal-map image warnings and translates them", async () => {
    const s = setup("unpack");
    s.readHeader.mockResolvedValue(header(2, 2, 16, true));
    await s.screen.setInput(0, files[0] ?? null);
    s.respond({
      id: s.request().id,
      type: "unpackedOrm",
      result: { ...unpacked(), translucent_pixels: 1 },
    });
    expect(s.showWarnings.mock.calls.at(-1)?.[0]).toHaveLength(3);
    s.japanese();
    expect(s.showWarnings.mock.calls.at(-1)?.[0].join(" ")).toContain("16 ビット");
  });

  it.each([true, false])(
    "uses the same confirmation limits as normal maps (%s)",
    async (accepted) => {
      const s = setup("unpack");
      s.readHeader.mockResolvedValue(header(9000, 9000));
      s.decode.mockResolvedValue({ width: 9000, height: 9000, pixels: new ArrayBuffer(4) });
      s.confirm.mockResolvedValue(accepted);
      await s.screen.setInput(0, files[0] ?? null);
      expect(s.confirm).toHaveBeenCalledOnce();
      expect(s.post).toHaveBeenCalledTimes(accepted ? 1 : 0);
      if (accepted) expect(s.request()).toMatchObject({ maxPixels: RAISED_MAX_PIXELS });
      else expect(s.status.textContent).toBe("Cancelled.");
    },
  );
});

describe.each(["pack", "unpack"] as const)("ORM %s failures", (mode) => {
  it.each(["E-TEX-001", "E-TEX-002", "E-TEX-003"] as const)(
    "renders a core rejection %s",
    async (code) => {
      const s = setup(mode);
      await s.screen.setInput(0, files[0] ?? null);
      s.respond(
        mode === "pack"
          ? {
              id: s.request().id,
              type: "packedOrm",
              result: {
                ...packed(),
                ok: false,
                code,
                message: "failure",
                non_gray_pixels: [0, 0, 0],
                translucent_pixels: 0,
              },
            }
          : {
              id: s.request().id,
              type: "unpackedOrm",
              result: { ...unpacked(), ok: false, code, message: "failure", translucent_pixels: 0 },
            },
      );
      expect(s.error.textContent).toContain(code);
      expect(s.status.textContent).toBe(s.error.textContent);
      expect(s.enabled).toHaveBeenLastCalledWith(false);
      await s.screen.download(mode === "pack" ? "packed" : "occlusion");
      expect(s.download).not.toHaveBeenCalled();
    },
  );

  it("handles worker errors and a permanently unavailable worker", async () => {
    const s = setup(mode);
    await s.screen.setInput(0, files[0] ?? null);
    s.respond({ id: s.request().id, type: "error", message: "untrusted detail" });
    expect(s.error.textContent).toContain("worker is unavailable");
    expect(s.error.textContent).not.toContain("untrusted detail");
    s.screen.failWorker();
    s.post.mockClear();
    await s.screen.setInput(0, files[0] ?? null);
    expect(s.post).not.toHaveBeenCalled();
    s.japanese();
    expect(s.error.textContent).toContain("変換処理を実行できません");
  });

  it.each(["header", "decode", "dimensions", "post", "display", "encode"])(
    "handles %s failures",
    async (stage) => {
      const s = setup(mode);
      if (stage === "header") s.readHeader.mockRejectedValue(new Error("bad"));
      if (stage === "decode") s.decode.mockRejectedValue(new Error("bad"));
      if (stage === "dimensions")
        s.decode.mockResolvedValue({ width: 3, height: 2, pixels: new ArrayBuffer(24) });
      if (stage === "post")
        s.post.mockImplementation(() => {
          throw new Error("bad");
        });
      if (stage === "display")
        s.showResult.mockImplementation(() => {
          throw new Error("bad");
        });
      if (stage === "encode") s.toPngBlob.mockRejectedValue(new Error("bad"));
      await s.screen.setInput(0, files[0] ?? null);
      if (stage === "display" || stage === "encode") s.respond();
      if (stage === "encode") await s.screen.download(mode === "pack" ? "packed" : "occlusion");
      expect(s.error.textContent).toContain(
        stage === "post" ? "worker is unavailable" : "E-TEX-001",
      );
      expect(s.enabled).toHaveBeenLastCalledWith(false);
    },
  );

  it("cancels a pending PNG download and clears previous results on mode change", async () => {
    const s = setup(mode);
    await s.screen.setInput(0, files[0] ?? null);
    s.respond();
    let finish = (_blob: Blob) => {};
    s.toPngBlob.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const downloading = s.screen.download(mode === "pack" ? "packed" : "occlusion");
    s.screen.clear();
    finish(new Blob(["png"]));
    await downloading;
    expect(s.download).not.toHaveBeenCalled();
    expect(s.status.textContent).toBe("");
    expect(s.error.textContent).toBe("");
    expect(s.showWarnings).toHaveBeenLastCalledWith([]);
    expect(s.showDefaults).toHaveBeenLastCalledWith([]);
    expect(s.clear).toHaveBeenCalledTimes(2);
  });

  it("reports multiple-file drops and ignores the old reply", async () => {
    const s = setup(mode);
    await s.screen.setInput(0, files[0] ?? null);
    s.screen.dropError();
    s.respond();
    expect(s.showResult).not.toHaveBeenCalled();
    expect(s.error.textContent).toBe("Open one file at a time.");
    expect(s.enabled).toHaveBeenLastCalledWith(false);
  });
});
