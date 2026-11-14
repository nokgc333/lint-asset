import type { Locale } from "../i18n/locale";
import type { TextSlot } from "../i18n/text-slot";
import { createTranslator } from "../i18n/translate";
import type { LimitRequest } from "../limit-dialog";
import type { WorkerRequest, WorkerResponse } from "../protocol";
import { type ImageInfo, readImageInfo } from "./image-info";
import {
  ORM_CHANNELS,
  type OrmChannel,
  type OrmWarning,
  ormDefaultsUsed,
  ormPackOutputName,
  ormPackWarnings,
  ormUnpackOutputNames,
  planOrmPack,
} from "./orm-plan";
import {
  planTexture,
  RAISED_MAX_PIXELS,
  type TextureWarning,
  textureWarnings,
} from "./texture-plan";

type OrmRequest = Extract<WorkerRequest, { type: "packOrm" | "unpackOrm" }>;
type Inputs = [File | null, File | null, File | null];
type Output = "packed" | OrmChannel;
interface Options {
  mode: "pack" | "unpack";
  status: TextSlot;
  error: TextSlot;
  getLocale(): Locale;
  readHeader(file: File): Promise<Uint8Array>;
  decode(
    file: File,
    index: number,
  ): Promise<{ width: number; height: number; pixels: ArrayBuffer }>;
  post(request: OrmRequest, transfer: Transferable[]): void;
  clear(): void;
  showResult(output: Output, pixels: Uint8ClampedArray, width: number, height: number): void;
  showDefaults(text: string[]): void;
  showWarnings(text: string[]): void;
  setDownloadEnabled(enabled: boolean): void;
  toPngBlob(output: Output): Promise<Blob>;
  confirm(request: LimitRequest): Promise<boolean>;
  download(blob: Blob, name: string): void;
  delay(): Promise<void>;
}
let nextId = 2_000_000;
export function createOrmScreen(options: Options) {
  let token = 0;
  let available = true;
  let files: Inputs = [null, null, null];
  let warnings: (OrmWarning | TextureWarning)[] = [];
  let defaults: ReturnType<typeof ormDefaultsUsed> = [];
  let active: {
    id: number;
    token: number;
    files: Inputs;
    infos: (ImageInfo | null)[];
    width: number;
    height: number;
    done: boolean;
    waiting: boolean;
  } | null = null;
  function renderNotes(): void {
    const { t, plural } = createTranslator(options.getLocale());
    options.showDefaults(
      defaults.map(({ channel, value }) =>
        t(`texture.orm.default.${channel}`, {
          channel: t(`texture.orm.channel.${channel}`),
          value,
        }),
      ),
    );
    options.showWarnings(
      warnings.map((warning) => {
        if (warning.kind === "translucent")
          return plural(
            options.mode === "pack"
              ? "texture.orm.warning.translucent"
              : "texture.warning.translucent",
            warning.count,
          );
        if ("channel" in warning) {
          const params = { channel: t(`texture.orm.channel.${warning.channel}`) };
          return warning.kind === "nonGray"
            ? plural("texture.orm.warning.nonGray", warning.count, params)
            : t(`texture.orm.warning.${warning.kind}`, params);
        }
        return t(`texture.warning.${warning.kind}`);
      }),
    );
  }
  function reset(): void {
    token++;
    active = null;
    warnings = [];
    defaults = [];
    options.clear();
    options.error.set(null);
    options.status.set(null);
    options.setDownloadEnabled(false);
    renderNotes();
  }
  function fail(code: string, width = 0, height = 0): void {
    if (active) {
      active.done = false;
      active.waiting = false;
    }
    options.setDownloadEnabled(false);
    const text = (locale: Locale) =>
      createTranslator(locale).t(`texture.error.${code}`, {
        width,
        height,
        limit: new Intl.NumberFormat(locale).format(RAISED_MAX_PIXELS),
      });
    options.error.set(text);
    options.status.set(text);
  }
  async function convert(): Promise<void> {
    reset();
    const current = token;
    const selected: Inputs = [...files];
    const first = selected.find((file) => file !== null);
    if (!first) {
      options.status.set((locale) =>
        createTranslator(locale).t(`texture.orm.status.idle.${options.mode}`),
      );
      return;
    }
    if (!available) {
      fail("worker");
      return;
    }
    options.status.set((locale) =>
      createTranslator(locale).t("texture.status.reading", { name: first.name }),
    );
    try {
      const infos = await Promise.all(
        selected.map(async (file) => (file ? readImageInfo(await options.readHeader(file)) : null)),
      );
      if (current !== token) return;
      const firstInfo = infos.find((info) => info !== null);
      if (!firstInfo) return;
      const plan = options.mode === "pack" ? planOrmPack(infos) : planTexture(firstInfo);
      if (plan.kind === "reject") {
        fail(
          plan.code,
          "width" in plan ? plan.width : firstInfo.width,
          "height" in plan ? plan.height : firstInfo.height,
        );
        return;
      }
      if (firstInfo.format === "unknown") return;
      const { width, height } = firstInfo;
      if (plan.kind === "confirm") {
        const accepted = await options.confirm({
          reason: "pixels",
          fileName: first.name,
          width,
          height,
          maxPixels: plan.maxPixels,
        });
        if (current !== token) return;
        if (!accepted) {
          options.status.set((locale) =>
            createTranslator(locale).t("texture.orm.status.cancelled"),
          );
          return;
        }
      }
      const buffers: [ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null] = [
        null,
        null,
        null,
      ];
      for (const [index, file] of selected.entries()) {
        if (!file) continue;
        const decoded = await options.decode(file, index);
        if (current !== token) return;
        if (decoded.width !== width || decoded.height !== height) {
          fail("E-TEX-001");
          return;
        }
        buffers[index] = decoded.pixels;
      }
      active = {
        id: nextId++,
        token: current,
        files: selected,
        infos,
        width,
        height,
        done: false,
        waiting: true,
      };
      try {
        if (options.mode === "pack")
          options.post(
            {
              id: active.id,
              type: "packOrm",
              width,
              height,
              inputs: buffers,
              maxPixels: plan.maxPixels,
            },
            buffers.filter((buffer) => buffer !== null),
          );
        else if (buffers[0])
          options.post(
            {
              id: active.id,
              type: "unpackOrm",
              width,
              height,
              pixels: buffers[0],
              maxPixels: plan.maxPixels,
            },
            [buffers[0]],
          );
      } catch {
        available = false;
        fail("worker");
      }
    } catch {
      if (current === token) fail("E-TEX-001");
    }
  }
  function handleResponse(response: WorkerResponse): void {
    const result = active;
    if (!result || result.token !== token || response.id !== result.id || !result.waiting) return;
    if (response.type === "error") {
      fail("worker");
      return;
    }
    if (response.type !== (options.mode === "pack" ? "packedOrm" : "unpackedOrm")) return;
    if (response.type !== "packedOrm" && response.type !== "unpackedOrm") return;
    result.waiting = false;
    if (!response.result.ok) {
      fail(response.result.code, result.width, result.height);
      return;
    }
    try {
      if (response.type === "packedOrm") {
        options.showResult("packed", response.result.pixels, result.width, result.height);
        defaults = ormDefaultsUsed(result.files.map(Boolean));
        warnings = ormPackWarnings(result.infos, {
          nonGray: response.result.non_gray_pixels,
          translucent: response.result.translucent_pixels,
        });
      } else {
        for (const channel of ORM_CHANNELS)
          options.showResult(channel, response.result[channel], result.width, result.height);
        const info = result.infos[0];
        warnings = info ? textureWarnings(info, response.result.translucent_pixels) : [];
      }
      result.done = true;
      renderNotes();
      options.status.set((locale) => {
        const { t, plural } = createTranslator(locale);
        const params = {
          name: result.files.find(Boolean)?.name ?? "",
          width: result.width,
          height: result.height,
        };
        return options.mode === "pack"
          ? plural("texture.orm.status.packed", result.files.filter(Boolean).length, params)
          : t("texture.orm.status.unpacked", params);
      });
      options.setDownloadEnabled(true);
    } catch {
      fail("E-TEX-001");
    }
  }
  async function download(output: Output): Promise<void> {
    const result = active;
    if (!result?.done) return;
    if (options.mode === "pack" ? output !== "packed" : output === "packed") return;
    try {
      const blob = await options.toPngBlob(output);
      if (active !== result || token !== result.token || !result.done) return;
      const name =
        output === "packed"
          ? ormPackOutputName(result.files.map((file) => file?.name ?? null))
          : ormUnpackOutputNames(result.files[0]?.name ?? "")[output];
      options.download(blob, name);
    } catch {
      if (active === result) fail("E-TEX-001");
    }
  }
  options.setDownloadEnabled(false);
  options.status.set((locale) =>
    createTranslator(locale).t(`texture.orm.status.idle.${options.mode}`),
  );
  return {
    handleResponse,
    download,
    async downloadAll() {
      const current = token;
      for (const [index, channel] of ORM_CHANNELS.entries()) {
        if (index) await options.delay();
        if (current !== token || !active?.done) return;
        await download(channel);
      }
    },
    async setInput(index: number, file: File | null) {
      if (index < 0 || index >= (options.mode === "pack" ? 3 : 1)) return;
      files[index] = file;
      await convert();
    },
    clear() {
      files = [null, null, null];
      reset();
    },
    dropError() {
      reset();
      fail("drop");
    },
    failWorker() {
      available = false;
      reset();
      fail("worker");
    },
    refresh() {
      options.status.refresh();
      options.error.refresh();
      renderNotes();
    },
  };
}
