import type { Locale } from "./i18n/locale";
import { describeLimitRequest } from "./limit-text";
import type { Limits } from "./load-plan";

export type LimitRequest =
  | { reason: "pixels"; fileName: string; width: number; height: number; maxPixels: number }
  | { reason: "size"; fileName: string; fileBytes: number; limits: Limits }
  | { reason: "triangles"; fileName: string; limits: Limits };

let refreshText: (() => void) | null = null;
export function refreshLimitText(): void {
  refreshText?.();
}
let pending: (() => void) | null = null;

export function cancelLimit(): void {
  pending?.();
}

export function confirmLimit(
  request: LimitRequest,
  getLocale: () => Locale = () => "en",
): Promise<boolean> {
  cancelLimit();
  const dialog = document.querySelector<HTMLDialogElement>("#limit-dialog");
  const text = document.querySelector<HTMLParagraphElement>("#limit-dialog-text");
  const proceed = document.querySelector<HTMLButtonElement>("#limit-continue");
  const cancel = document.querySelector<HTMLButtonElement>("#limit-cancel");
  if (!dialog || !text || !proceed || !cancel) return Promise.resolve(false);

  refreshText = () => {
    text.textContent = describeLimitRequest(request, getLocale());
  };
  refreshLimitText();

  return new Promise((resolve) => {
    function finish(accepted: boolean): void {
      proceed?.removeEventListener("click", onContinue);
      cancel?.removeEventListener("click", onCancel);
      dialog?.removeEventListener("cancel", onEscape);
      dialog?.removeEventListener("close", onClose);
      pending = null;
      refreshText = null;
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
