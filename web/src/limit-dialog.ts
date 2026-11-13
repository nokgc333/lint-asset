import { formatMiB } from "./file-size";
import { DEFAULT_LIMITS, type Limits } from "./load-plan";

export type LimitRequest =
  | { reason: "size"; fileName: string; fileBytes: number; limits: Limits }
  | { reason: "triangles"; fileName: string; limits: Limits };

const numbers = new Intl.NumberFormat("en");
let pending: (() => void) | null = null;

export function cancelLimit(): void {
  pending?.();
}

export function confirmLimit(request: LimitRequest): Promise<boolean> {
  cancelLimit();
  const dialog = document.querySelector<HTMLDialogElement>("#limit-dialog");
  const text = document.querySelector<HTMLParagraphElement>("#limit-dialog-text");
  const proceed = document.querySelector<HTMLButtonElement>("#limit-continue");
  const cancel = document.querySelector<HTMLButtonElement>("#limit-cancel");
  if (!dialog || !text || !proceed || !cancel) return Promise.resolve(false);

  text.textContent =
    request.reason === "size"
      ? `${request.fileName} is ${formatMiB(request.fileBytes, 1)}. Files over ${formatMiB(DEFAULT_LIMITS.maxFileBytes)} can be slow or run out of memory. Continue? Files over ${formatMiB(request.limits.maxFileBytes)} cannot be opened.`
      : `${request.fileName} has more than ${numbers.format(DEFAULT_LIMITS.maxTriangles)} triangles. Large models can be slow or run out of memory. Continue? Models over ${numbers.format(request.limits.maxTriangles)} triangles cannot be opened.`;

  return new Promise((resolve) => {
    function finish(accepted: boolean): void {
      proceed?.removeEventListener("click", onContinue);
      cancel?.removeEventListener("click", onCancel);
      dialog?.removeEventListener("cancel", onEscape);
      dialog?.removeEventListener("close", onClose);
      pending = null;
      if (dialog?.open) dialog.close();
      resolve(accepted);
    }
    const onContinue = () => finish(true);
    const onCancel = () => finish(false);
    const onEscape = (event: Event) => {
      event.preventDefault();
      finish(false);
    };
    const onClose = () => {
      if (!dialog.open) finish(false);
    };
    pending = onCancel;
    proceed.addEventListener("click", onContinue);
    cancel.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onEscape);
    dialog.addEventListener("close", onClose);
    try {
      dialog.showModal();
      cancel.focus();
    } catch {
      finish(false);
    }
  });
}
