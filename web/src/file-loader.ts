import { describeCounts } from "./counts";
import { formatMiB } from "./file-size";
import { cancelLimit, confirmLimit } from "./limit-dialog";
import { type Limits, planAfterLimitError, planIntake, RAISED_LIMITS } from "./load-plan";
import { formatLoadError } from "./messages";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { GeometryResult } from "./wasm/lint_core.mjs";

type LoadRequest = Extract<WorkerRequest, { type: "load" }>;
interface Load {
  id: number;
  file: File;
  limits: Limits;
  phase: "confirming" | "reading" | "loading" | "done";
}
interface LoaderOptions {
  status: Pick<HTMLElement, "textContent">;
  error: Pick<HTMLElement, "textContent">;
  post: (request: LoadRequest) => void;
  showGeometry: (result: GeometryResult) => void;
  isReady: () => boolean;
  firstRequestId: number;
}

export function createFileLoader(options: LoaderOptions) {
  let nextId = options.firstRequestId;
  let active: Load | null = null;

  function showError(code: string, detail: string): void {
    const message = formatLoadError(code, detail);
    options.error.textContent = `Error: ${message}`;
    options.status.textContent = message;
  }

  function failWorker(): void {
    active = null;
    cancelLimit();
    showError("E-LOAD-002", "The geometry worker is unavailable.");
  }

  async function send(load: Load): Promise<void> {
    load.phase = "reading";
    options.status.textContent = `Loading ${load.file.name}…`;
    try {
      const bytes = await load.file.arrayBuffer();
      if (active !== load) return;
      load.phase = "loading";
      options.post({ id: load.id, type: "load", bytes, ...load.limits });
    } catch (error) {
      if (active !== load) return;
      load.phase = "done";
      showError("E-LOAD-002", error instanceof Error ? error.message : String(error));
    }
  }

  async function openFile(file: File): Promise<void> {
    if (!options.isReady()) return;
    active = null;
    cancelLimit();
    options.error.textContent = "";
    const id = ++nextId;
    const plan = planIntake(file.size);
    if (plan.kind === "reject") {
      showError(
        "E-LOAD-003",
        `${file.name} is larger than ${formatMiB(RAISED_LIMITS.maxFileBytes)}`,
      );
      return;
    }
    const load: Load = { id, file, limits: plan.limits, phase: "confirming" };
    active = load;
    if (plan.kind === "confirm") {
      const accepted = await confirmLimit({
        reason: "size",
        fileName: file.name,
        fileBytes: file.size,
        limits: plan.limits,
      });
      if (active !== load) return;
      if (!accepted) {
        load.phase = "done";
        options.status.textContent = "Cancelled.";
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
        options.showGeometry(result);
        options.error.textContent = "";
        options.status.textContent = `${load.file.name}: ${describeCounts(result)}`;
        return;
      }
      showError(result.code, result.message);
      if (result.code !== "E-LOAD-003") return;
      const plan = planAfterLimitError(load.limits);
      if (plan.kind === "final") return;
      load.phase = "confirming";
      const accepted = await confirmLimit({
        reason: "triangles",
        fileName: load.file.name,
        limits: plan.limits,
      });
      if (active !== load) return;
      if (!accepted) {
        load.phase = "done";
        return;
      }
      options.error.textContent = "";
      load.id = ++nextId;
      load.limits = plan.limits;
      await send(load);
    }
  }

  return { openFile, handleResponse, failWorker };
}
