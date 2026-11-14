import { describeCounts } from "./counts";
import { formatMiB } from "./file-size";
import type { Locale } from "./i18n/locale";
import type { Text, TextSlot } from "./i18n/text-slot";
import { createTranslator } from "./i18n/translate";
import { type IntakeEntry, isImageName } from "./intake";
import { cancelLimit, confirmLimit } from "./limit-dialog";
import { type Limits, planAfterLimitError, planIntake, RAISED_LIMITS } from "./load-plan";
import { formatLoadError } from "./messages";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { AnalyzeResult, Thresholds } from "./wasm/lint_core.mjs";

type LoadRequest = Extract<WorkerRequest, { type: "load" }>;
interface Load {
  id: number;
  file: File;
  companions: readonly IntakeEntry[];
  format: "glb" | "gltf";
  size: number;
  limits: Limits;
  rerun: boolean;
  phase: "confirming" | "reading" | "loading" | "done";
}
interface LoaderOptions {
  status: Pick<TextSlot, "set">;
  error: Pick<TextSlot, "set">;
  post: (request: LoadRequest) => void;
  showGeometry: (
    result: AnalyzeResult,
    file: { name: string; size: number; format: "glb" | "gltf" },
  ) => void;
  isReady: () => boolean;
  firstRequestId: number;
  getThresholds: () => Thresholds;
  getLocale?: () => Locale;
}

export function createFileLoader(options: LoaderOptions) {
  let nextId = options.firstRequestId;
  let active: Load | null = null;
  let displayed: Pick<Load, "file" | "companions" | "format" | "size" | "limits"> | null = null;

  function showError(code: string, detail: string | Text): void {
    const message: Text = (locale) =>
      formatLoadError(code, typeof detail === "function" ? detail(locale) : detail, locale);
    options.error.set((locale) =>
      createTranslator(locale).t("load.error", { message: message(locale) }),
    );
    options.status.set(message);
  }

  function failWorker(): void {
    active = null;
    cancelLimit();
    showError("E-LOAD-002", (locale) => createTranslator(locale).t("load.workerUnavailable"));
  }

  async function send(load: Load): Promise<void> {
    load.phase = "reading";
    options.status.set((locale) =>
      createTranslator(locale).t("status.loading", { name: load.file.name }),
    );
    try {
      const bytes = await load.file.arrayBuffer();
      if (active !== load) return;
      const files =
        load.format === "gltf"
          ? await Promise.all(
              load.companions.map(async ({ file, path }) => ({
                name: path,
                bytes: await file.arrayBuffer(),
              })),
            )
          : undefined;
      if (active !== load) return;
      load.phase = "loading";
      options.post({
        id: load.id,
        type: "load",
        bytes,
        ...(files === undefined ? {} : { files }),
        ...load.limits,
        thresholds: options.getThresholds(),
      });
    } catch (error) {
      if (active !== load) return;
      load.phase = "done";
      showError("E-LOAD-002", error instanceof Error ? error.message : String(error));
    }
  }

  function openFile(file: File): Promise<void> {
    return openModel({ file, path: file.name }, []);
  }

  async function openModel(model: IntakeEntry, entries: readonly IntakeEntry[]): Promise<void> {
    const file = model.file;
    const format = /\.gltf$/i.test(model.path) ? "gltf" : "glb";
    const companions = format === "gltf" ? entries.filter((entry) => !isImageName(entry.path)) : [];
    const size = companions.reduce((total, entry) => total + entry.file.size, file.size);
    if (!options.isReady()) return;
    active = null;
    cancelLimit();
    options.error.set(null);
    const id = ++nextId;
    const plan = planIntake(size);
    if (plan.kind === "reject") {
      showError("E-LOAD-003", (locale) =>
        createTranslator(locale).t("load.tooLarge", {
          name: file.name,
          limit: formatMiB(RAISED_LIMITS.maxFileBytes),
        }),
      );
      return;
    }
    const load: Load = {
      id,
      file,
      companions,
      format,
      size,
      limits: plan.limits,
      rerun: false,
      phase: "confirming",
    };
    active = load;
    if (plan.kind === "confirm") {
      const accepted = await confirmLimit(
        {
          reason: "size",
          fileName: file.name,
          fileBytes: size,
          limits: plan.limits,
        },
        options.getLocale ?? (() => "en"),
      );
      if (active !== load) return;
      if (!accepted) {
        load.phase = "done";
        options.status.set((locale) => createTranslator(locale).t("status.cancelled"));
        return;
      }
    }
    await send(load);
  }

  async function handleResponse(response: WorkerResponse): Promise<void> {
    const load = active;
    if (!load || response.id !== load.id || load.phase !== "loading") return;
    if (response.type === "error") {
      load.phase = "done";
      showError("E-LOAD-002", response.message);
    } else if (response.type === "loaded") {
      const result = response.result;
      load.phase = "done";
      if (result.ok) {
        displayed = {
          file: load.file,
          companions: load.companions,
          format: load.format,
          size: load.size,
          limits: load.limits,
        };
        options.showGeometry(result, {
          name: load.file.name,
          size: load.size,
          format: load.format,
        });
        options.error.set(null);
        options.status.set((locale) =>
          createTranslator(locale).t("status.loaded", {
            name: load.file.name,
            counts: describeCounts(result, locale),
          }),
        );
        return;
      }
      showError(
        result.code,
        result.code === "E-LOAD-005" ? result.missing_files.join(", ") : result.message,
      );
      if (load.rerun || result.code !== "E-LOAD-003") return;
      const plan = planAfterLimitError(load.limits);
      if (plan.kind === "final") return;
      load.phase = "confirming";
      const accepted = await confirmLimit(
        {
          reason: "triangles",
          fileName: load.file.name,
          limits: plan.limits,
        },
        options.getLocale ?? (() => "en"),
      );
      if (active !== load) return;
      if (!accepted) {
        load.phase = "done";
        return;
      }
      options.error.set(null);
      load.id = ++nextId;
      load.limits = plan.limits;
      await send(load);
    }
  }

  function rerun(): void {
    if (!displayed || !options.isReady()) return;
    active = null;
    cancelLimit();
    options.error.set(null);
    const load: Load = { id: ++nextId, ...displayed, rerun: true, phase: "reading" };
    active = load;
    void send(load);
  }

  return { openModel, openFile, handleResponse, failWorker, rerun };
}
