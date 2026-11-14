import type { Locale } from "../i18n/locale";
import type { TextSlot } from "../i18n/text-slot";
import { createTranslator } from "../i18n/translate";
import type { LimitRequest } from "../limit-dialog";
import type { WorkerRequest, WorkerResponse } from "../protocol";
import { type ImageInfo, readImageInfo } from "./image-info";
import {
  type Direction,
  planTexture,
  RAISED_MAX_PIXELS,
  type TextureWarning,
  textureOutputName,
  textureWarnings,
} from "./texture-plan";

type FlipRequest = Extract<WorkerRequest, { type: "flip" }>;
interface Options {
  status: TextSlot;
  error: TextSlot;
  getLocale(): Locale;
  readHeader(file: File): Promise<Uint8Array>;
  decode(file: File): Promise<{ width: number; height: number; pixels: ArrayBuffer }>;
  post(request: FlipRequest, transfer: Transferable[]): void;
  showAfter(pixels: ArrayBuffer, width: number, height: number): void;
  toPngBlob(): Promise<Blob>;
  confirm(request: LimitRequest): Promise<boolean>;
  download(blob: Blob, fileName: string): void;
  showWarnings(text: string[]): void;
  setDownloadEnabled(enabled: boolean): void;
}
export function createTextureScreen(options: Options) {
  let token = 0;
  let nextId = 1_000_000;
  let available = true;
  let direction: Direction = "dx-to-gl";
  let active: {
    token: number;
    id: number;
    file: File;
    info: ImageInfo;
    width: number;
    height: number;
    waiting: boolean;
    done: boolean;
  } | null = null;
  let warnings: TextureWarning[] = [];
  function renderWarnings(): void {
    const translator = createTranslator(options.getLocale());
    options.showWarnings(
      warnings.map((warning) =>
        warning.kind === "translucent"
          ? translator.plural("texture.warning.translucent", warning.count)
          : translator.t(`texture.warning.${warning.kind}`),
      ),
    );
  }
  function fail(code: string, width = 0, height = 0): void {
    if (active) {
      active.waiting = false;
      active.done = false;
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
  function converted(): void {
    const result = active;
    if (!result?.done) return;
    options.status.set((locale) => {
      const { t } = createTranslator(locale);
      return t("texture.status.converted", {
        name: result.file.name,
        width: result.width,
        height: result.height,
        direction: t(`texture.direction.${direction}`),
      });
    });
  }
  async function openFile(file: File): Promise<void> {
    const current = ++token;
    active = null;
    warnings = [];
    renderWarnings();
    options.error.set(null);
    options.setDownloadEnabled(false);
    if (!available) {
      fail("worker");
      return;
    }
    options.status.set((locale) =>
      createTranslator(locale).t("texture.status.reading", { name: file.name }),
    );
    try {
      const info = readImageInfo(await options.readHeader(file));
      if (current !== token) return;
      const plan = planTexture(info);
      if (plan.kind === "reject") {
        fail(plan.code, info.width, info.height);
        return;
      }
      if (info.format === "unknown") return;
      if (plan.kind === "confirm") {
        const accepted = await options.confirm({
          reason: "pixels",
          fileName: file.name,
          width: info.width,
          height: info.height,
          maxPixels: plan.maxPixels,
        });
        if (current !== token) return;
        if (!accepted) {
          options.status.set((locale) => createTranslator(locale).t("texture.status.cancelled"));
          return;
        }
      }
      const decoded = await options.decode(file);
      if (current !== token) return;
      if (decoded.width !== info.width || decoded.height !== info.height) {
        fail("E-TEX-001");
        return;
      }
      active = {
        token: current,
        id: nextId++,
        file,
        info,
        width: decoded.width,
        height: decoded.height,
        waiting: true,
        done: false,
      };
      try {
        options.post({ id: active.id, type: "flip", ...decoded, maxPixels: plan.maxPixels }, [
          decoded.pixels,
        ]);
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
    if (!result || result.token !== token || result.id !== response.id || !result.waiting) return;
    if (response.type === "error") {
      fail("worker");
      return;
    }
    if (response.type !== "flipped") return;
    result.waiting = false;
    if (!response.result.ok) {
      fail(response.result.code, result.width, result.height);
      return;
    }
    try {
      options.showAfter(response.pixels, result.width, result.height);
      result.done = true;
      warnings = textureWarnings(result.info, response.result.translucent_pixels);
      renderWarnings();
      converted();
      options.setDownloadEnabled(true);
    } catch {
      fail("E-TEX-001");
    }
  }
  function refresh(): void {
    options.status.refresh();
    options.error.refresh();
    renderWarnings();
  }
  options.status.set((locale) => createTranslator(locale).t("texture.status.idle"));
  options.setDownloadEnabled(false);
  return {
    openFile,
    handleResponse,
    refresh,
    setDirection(next: Direction) {
      direction = next;
      converted();
    },
    failWorker() {
      available = false;
      token++;
      fail("worker");
    },
    async download() {
      const result = active;
      if (!result?.done) return;
      try {
        const blob = await options.toPngBlob();
        if (active === result && result.token === token && result.done)
          options.download(blob, textureOutputName(result.file.name, direction));
      } catch {
        if (active === result) fail("E-TEX-001");
      }
    },
  };
}
