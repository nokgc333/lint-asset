import { describe, expect, it, vi } from "vitest";
import { detectCapabilities } from "./environment";

describe("WebGL2 probe cleanup", () => {
  it("releases a context through the optional extension", () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn(() => ({ loseContext }));
    const getContext = vi.fn(() => ({ getExtension }));
    const capabilities = detectCapabilities({
      document: { createElement: () => ({ getContext }) },
    });
    expect(capabilities.webgl2).toBe(true);
    expect(getContext).toHaveBeenCalledWith("webgl2");
    expect(getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it("accepts a context without the cleanup extension", () => {
    expect(
      detectCapabilities({
        document: { createElement: () => ({ getContext: () => ({ getExtension: () => null }) }) },
      }).webgl2,
    ).toBe(true);
  });

  it("rejects null or function WebAssembly and non-function Workers", () => {
    for (const WebAssembly of [null, () => {}, "wasm"]) {
      expect(
        detectCapabilities({
          document: { createElement: () => ({ getContext: () => null }) },
          WebAssembly,
          Worker: {},
        }),
      ).toEqual({ webgl2: false, webassembly: false, worker: false });
    }
  });
});
