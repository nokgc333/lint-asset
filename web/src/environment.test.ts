import { describe, expect, it } from "vitest";
import {
  type Capabilities,
  describeProblem,
  detectCapabilities,
  findProblems,
  isPermanent,
  MIN_VIEWPORT_WIDTH,
  type Problem,
} from "./environment";

const ALL: Capabilities = { webgl2: true, webassembly: true, worker: true, touchOnly: false };

function fakeEnvironment(options: {
  webgl2?: unknown;
  throwOnContext?: boolean;
  webassembly?: unknown;
  worker?: unknown;
  pointers?: { coarse?: boolean; anyFine?: boolean };
}) {
  return {
    document: {
      createElement: () => ({
        getContext: (type: string) => {
          if (options.throwOnContext) throw new Error("context creation failed");
          return type === "webgl2" ? (options.webgl2 ?? null) : null;
        },
      }),
    },
    WebAssembly: options.webassembly,
    Worker: options.worker,
    ...(options.pointers
      ? {
          matchMedia: (query: string) => ({
            matches:
              query === "(pointer: coarse)"
                ? Boolean(options.pointers?.coarse)
                : query === "(any-pointer: fine)"
                  ? Boolean(options.pointers?.anyFine)
                  : false,
          }),
        }
      : {}),
  };
}

describe("detectCapabilities", () => {
  it("finds everything in a capable browser", () => {
    const env = fakeEnvironment({ webgl2: {}, webassembly: {}, worker: function Worker() {} });
    expect(detectCapabilities(env)).toEqual(ALL);
  });

  it("reports WebGL2 missing when the context cannot be created", () => {
    const env = fakeEnvironment({ webassembly: {}, worker: function Worker() {} });
    expect(detectCapabilities(env)).toEqual({ ...ALL, webgl2: false });
  });

  it("reports WebGL2 missing when creating the context throws", () => {
    const env = fakeEnvironment({
      throwOnContext: true,
      webassembly: {},
      worker: function Worker() {},
    });
    expect(detectCapabilities(env).webgl2).toBe(false);
  });

  it("reports WebAssembly missing", () => {
    const env = fakeEnvironment({ webgl2: {}, worker: function Worker() {} });
    expect(detectCapabilities(env)).toEqual({ ...ALL, webassembly: false });
  });

  it("reports Web Workers missing", () => {
    const env = fakeEnvironment({ webgl2: {}, webassembly: {} });
    expect(detectCapabilities(env)).toEqual({ ...ALL, worker: false });
  });
});

describe("detectCapabilities and touch devices", () => {
  const capable = { webgl2: {}, webassembly: {}, worker: function Worker() {} };

  it("finds a phone or a tablet: only a coarse pointer and no fine pointer", () => {
    const env = fakeEnvironment({ ...capable, pointers: { coarse: true, anyFine: false } });
    expect(detectCapabilities(env).touchOnly).toBe(true);
  });

  it("does not take a device with a mouse or a trackpad for a touch device", () => {
    for (const pointers of [
      { coarse: false, anyFine: true },
      { coarse: true, anyFine: true },
      { coarse: false, anyFine: false },
    ]) {
      expect(detectCapabilities(fakeEnvironment({ ...capable, pointers })).touchOnly).toBe(false);
    }
  });

  it("does not block a browser that cannot answer the question", () => {
    expect(detectCapabilities(fakeEnvironment(capable)).touchOnly).toBe(false);
  });

  it("does not block when asking throws", () => {
    const env = {
      ...fakeEnvironment(capable),
      matchMedia: () => {
        throw new Error("no media queries");
      },
    };
    expect(detectCapabilities(env).touchOnly).toBe(false);
  });
});

describe("findProblems", () => {
  it("finds none for a capable browser in a wide window", () => {
    expect(findProblems(ALL, MIN_VIEWPORT_WIDTH)).toEqual([]);
    expect(findProblems(ALL, 1920)).toEqual([]);
  });

  it("lets a zoomed page and a narrow window work: only below 320 px is a problem", () => {
    expect(MIN_VIEWPORT_WIDTH).toBe(320);
    expect(findProblems(ALL, 319)).toEqual(["narrow"]);
    expect(findProblems(ALL, 320)).toEqual([]);
    // 200% zoom on a 1440 px screen, and 400% on a 1280 px screen
    expect(findProblems(ALL, 720)).toEqual([]);
    expect(findProblems(ALL, 320)).toEqual([]);
  });

  it("treats a touch-only device as a problem, whatever its width", () => {
    expect(findProblems({ ...ALL, touchOnly: true }, 1400)).toEqual(["touch"]);
  });

  it("lists every problem, in a stable order", () => {
    const none: Capabilities = {
      webgl2: false,
      webassembly: false,
      worker: false,
      touchOnly: true,
    };
    expect(findProblems(none, 200)).toEqual(["webgl2", "webassembly", "worker", "touch", "narrow"]);
  });
});

describe("isPermanent", () => {
  it("is true for a missing capability, which a wider window cannot fix", () => {
    for (const problem of ["webgl2", "webassembly", "worker", "touch"] as const) {
      expect(isPermanent(problem), problem).toBe(true);
    }
  });

  it("is false for a narrow window", () => {
    expect(isPermanent("narrow")).toBe(false);
  });
});

describe("describeProblem", () => {
  const problems: Problem[] = ["webgl2", "webassembly", "worker", "touch", "narrow"];

  it("gives a cause and a next action for each problem", () => {
    for (const problem of problems) {
      const text = describeProblem(problem);
      expect(text.cause.length, problem).toBeGreaterThan(10);
      expect(text.action.length, problem).toBeGreaterThan(10);
    }
  });

  it("describes each problem differently", () => {
    expect(new Set(problems.map((problem) => describeProblem(problem).cause)).size).toBe(5);
  });

  it("names the technology that is missing, and the width that is needed", () => {
    expect(describeProblem("webgl2").cause).toMatch(/WebGL2/);
    expect(describeProblem("webassembly").cause).toMatch(/WebAssembly/);
    expect(describeProblem("worker").cause).toMatch(/Worker/);
    expect(describeProblem("touch").cause).toMatch(/phone|tablet/i);
    expect(describeProblem("narrow").cause).toMatch(/320/);
  });
});
