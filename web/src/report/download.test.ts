import { afterEach, expect, it, vi } from "vitest";
import { downloadText } from "./download";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("downloads text without interpreting it and releases the URL on the next tick", async () => {
  vi.useFakeTimers();
  const anchor = { hidden: false, download: "", href: "", click: vi.fn(), remove: vi.fn() };
  const append = vi.fn();
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:report");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body: { append } });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  downloadText("<report>.json", "application/json;charset=utf-8", "<untrusted>");
  const blob = createObjectURL.mock.calls[0]?.[0] as unknown as Blob;
  expect(blob.type).toBe("application/json;charset=utf-8");
  expect(await blob.text()).toBe("<untrusted>");
  expect(anchor.download).toBe("<report>.json");
  expect(anchor.href).toBe("blob:report");
  expect(anchor.hidden).toBe(true);
  expect(append).toHaveBeenCalledWith(anchor);
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(anchor.remove).not.toHaveBeenCalled();
  expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(anchor.remove).toHaveBeenCalledOnce();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
});
