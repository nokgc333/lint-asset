import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelLimit, confirmLimit } from "./limit-dialog";
import { RAISED_LIMITS } from "./load-plan";

class Dialog extends EventTarget {
  open = false;
  showModal = vi.fn(() => {
    this.open = true;
  });
  close() {
    this.open = false;
    queueMicrotask(() => this.dispatchEvent(new Event("close")));
  }
}

class Button extends EventTarget {
  focus = vi.fn();
}

let dialog: Dialog;
let proceed: Button;
let cancel: Button;
let text: { textContent: string };
const request = { reason: "triangles", fileName: "model.glb", limits: RAISED_LIMITS } as const;

beforeEach(() => {
  dialog = new Dialog();
  proceed = new Button();
  cancel = new Button();
  text = { textContent: "" };
  const elements: Record<string, unknown> = {
    "#limit-dialog": dialog,
    "#limit-dialog-text": text,
    "#limit-continue": proceed,
    "#limit-cancel": cancel,
  };
  vi.stubGlobal("document", { querySelector: (selector: string) => elements[selector] });
});

afterEach(() => {
  cancelLimit();
  vi.unstubAllGlobals();
});

describe("limit confirmation", () => {
  it("uses plain text, English numbers and focuses Cancel", async () => {
    const pending = confirmLimit({
      reason: "size",
      fileName: "<img>.glb",
      fileBytes: 150 * 1024 * 1024,
      limits: RAISED_LIMITS,
    });
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(cancel.focus).toHaveBeenCalledOnce();
    expect(text.textContent).toBe(
      "<img>.glb is 150.0 MiB. Files over 100 MiB can be slow or run out of memory. Continue? Files over 200 MiB cannot be opened.",
    );
    proceed.dispatchEvent(new Event("click"));
    await expect(pending).resolves.toBe(true);
    expect(dialog.open).toBe(false);
  });

  it("describes triangle limits and resolves false for Cancel", async () => {
    const pending = confirmLimit(request);
    expect(text.textContent).toContain("more than 2,000,000 triangles");
    expect(text.textContent).toContain("over 4,000,000 triangles cannot be opened");
    cancel.dispatchEvent(new Event("click"));
    await expect(pending).resolves.toBe(false);
  });

  it("resolves false for Escape", async () => {
    const pending = confirmLimit(request);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(pending).resolves.toBe(false);
  });

  it("resolves false when the dialog is closed externally", async () => {
    const pending = confirmLimit(request);
    dialog.close();
    await expect(pending).resolves.toBe(false);
  });

  it("cancels the earlier promise on reopening without cancelling the new dialog", async () => {
    const first = confirmLimit(request);
    const second = confirmLimit(request);
    await expect(first).resolves.toBe(false);
    expect(dialog.open).toBe(true);
    proceed.dispatchEvent(new Event("click"));
    await expect(second).resolves.toBe(true);
  });

  it("settles false when opening the dialog fails", async () => {
    dialog.showModal.mockImplementation(() => {
      throw new Error("Unavailable");
    });
    await expect(confirmLimit(request)).resolves.toBe(false);
  });
});
