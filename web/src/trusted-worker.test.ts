import { describe, expect, it } from "vitest";
import { sameOriginScriptUrl } from "./trusted-worker";

const PAGE = "https://example.test/app/index.html";

describe("sameOriginScriptUrl", () => {
  it("accepts an absolute URL on the page's origin", () => {
    expect(sameOriginScriptUrl("https://example.test/assets/worker.js", PAGE)).toBe(
      "https://example.test/assets/worker.js",
    );
  });

  it("resolves a relative path against the page", () => {
    expect(sameOriginScriptUrl("/assets/worker.js", PAGE)).toBe(
      "https://example.test/assets/worker.js",
    );
  });

  it("rejects another origin", () => {
    expect(() => sameOriginScriptUrl("https://evil.test/worker.js", PAGE)).toThrow(TypeError);
  });

  it("rejects a different port or scheme on the same host", () => {
    expect(() => sameOriginScriptUrl("https://example.test:8443/w.js", PAGE)).toThrow(TypeError);
    expect(() => sameOriginScriptUrl("http://example.test/w.js", PAGE)).toThrow(TypeError);
  });

  it("rejects data, blob, and javascript URLs", () => {
    for (const url of ["data:text/javascript,1", "blob:https://example.test/x", "javascript:1"]) {
      expect(() => sameOriginScriptUrl(url, PAGE)).toThrow(TypeError);
    }
  });
});
