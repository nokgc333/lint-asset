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

const ALL: Capabilities = { webgl2: true, webassembly: true, worker: true };

function fakeEnvironment(options: {
  webgl2?: unknown;
  throwOnContext?: boolean;
  webassembly?: unknown;
  worker?: unknown;
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

describe("findProblems", () => {
  it("finds none for a capable browser in a wide window", () => {
    expect(findProblems(ALL, MIN_VIEWPORT_WIDTH)).toEqual([]);
    expect(findProblems(ALL, 1920)).toEqual([]);
  });

  it("treats a window narrower than 1024 px as a problem, and 1024 px as fine", () => {
    expect(MIN_VIEWPORT_WIDTH).toBe(1024);
    expect(findProblems(ALL, 1023)).toEqual(["narrow"]);
    expect(findProblems(ALL, 1024)).toEqual([]);
  });

  it("lists every problem, in a stable order", () => {
    const none: Capabilities = { webgl2: false, webassembly: false, worker: false };
    expect(findProblems(none, 800)).toEqual(["webgl2", "webassembly", "worker", "narrow"]);
  });
});

describe("isPermanent", () => {
  it("is true for a missing capability, which a wider window cannot fix", () => {
    for (const problem of ["webgl2", "webassembly", "worker"] as const) {
      expect(isPermanent(problem), problem).toBe(true);
    }
  });

  it("is false for a narrow window", () => {
    expect(isPermanent("narrow")).toBe(false);
  });
});

describe("describeProblem", () => {
  const problems: Problem[] = ["webgl2", "webassembly", "worker", "narrow"];

  it("gives a cause and a next action for each problem", () => {
    for (const problem of problems) {
      const text = describeProblem(problem);
      expect(text.cause.length, problem).toBeGreaterThan(10);
      expect(text.action.length, problem).toBeGreaterThan(10);
    }
  });

  it("describes each problem differently", () => {
    expect(new Set(problems.map((problem) => describeProblem(problem).cause)).size).toBe(4);
  });

  it("names the technology that is missing, and the width that is needed", () => {
    expect(describeProblem("webgl2").cause).toMatch(/WebGL2/);
    expect(describeProblem("webassembly").cause).toMatch(/WebAssembly/);
    expect(describeProblem("worker").cause).toMatch(/Worker/);
    expect(describeProblem("narrow").cause).toMatch(/1024/);
  });
});
