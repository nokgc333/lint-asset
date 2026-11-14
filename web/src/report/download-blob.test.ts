import { afterEach, expect, it, vi } from "vitest";
import { downloadBlob } from "./download";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("downloads the original blob and releases its URL even if clicking fails", () => {
  vi.useFakeTimers();
  const blob = new Blob(["png"], { type: "image/png" });
  const anchor = {
    hidden: false,
    download: "",
    href: "",
    click: vi.fn(() => {
      throw new Error("blocked");
    }),
    remove: vi.fn(),
  };
  const createObjectURL = vi.fn(() => "blob:texture");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("document", { createElement: () => anchor, body: { append: vi.fn() } });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  expect(() => downloadBlob("<normal>.gl.png", blob)).toThrow("blocked");
  expect(createObjectURL).toHaveBeenCalledWith(blob);
  expect(anchor.download).toBe("<normal>.gl.png");
  expect(anchor.hidden).toBe(true);
  expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(anchor.remove).toHaveBeenCalledOnce();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:texture");
});
