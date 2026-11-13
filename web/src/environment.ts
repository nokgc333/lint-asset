export const MIN_VIEWPORT_WIDTH = 1024;

export interface Capabilities {
  webgl2: boolean;
  webassembly: boolean;
  worker: boolean;
}

export type Problem = "webgl2" | "webassembly" | "worker" | "narrow";

type Environment = {
  document: {
    createElement(tag: "canvas"): { getContext(type: string): unknown };
  };
  WebAssembly?: unknown;
  Worker?: unknown;
};

export function detectCapabilities(env: Environment): Capabilities {
  let webgl2 = false;
  try {
    const context = env.document.createElement("canvas").getContext("webgl2");
    webgl2 = Boolean(context);
    if (
      context &&
      typeof context === "object" &&
      "getExtension" in context &&
      typeof context.getExtension === "function"
    ) {
      const extension = context.getExtension("WEBGL_lose_context");
      if (extension && typeof extension.loseContext === "function") extension.loseContext();
    }
  } catch {
    webgl2 = false;
  }
  return {
    webgl2,
    webassembly: typeof env.WebAssembly === "object" && env.WebAssembly !== null,
    worker: typeof env.Worker === "function",
  };
}

export function findProblems(capabilities: Capabilities, viewportWidth: number): Problem[] {
  const problems: Problem[] = [];
  for (const capability of ["webgl2", "webassembly", "worker"] as const) {
    if (!capabilities[capability]) problems.push(capability);
  }
  if (viewportWidth < MIN_VIEWPORT_WIDTH) problems.push("narrow");
  return problems;
}

export function isPermanent(problem: Problem): boolean {
  return problem !== "narrow";
}

const descriptions: Record<Problem, { cause: string; action: string }> = {
  webgl2: {
    cause: "WebGL2 is not available in this browser.",
    action:
      "Use the latest Chrome, Edge, Firefox, or Safari on a desktop computer, and turn on hardware acceleration in the browser settings.",
  },
  webassembly: {
    cause: "WebAssembly is not available in this browser.",
    action: "Use the latest Chrome, Edge, Firefox, or Safari on a desktop computer.",
  },
  worker: {
    cause: "Web Workers are not available in this browser.",
    action: "Use the latest Chrome, Edge, Firefox, or Safari on a desktop computer.",
  },
  narrow: {
    cause: `The window is narrower than ${MIN_VIEWPORT_WIDTH} px.`,
    action:
      "Make the window wider, or open this page on a desktop computer. Phones and tablets are not supported yet.",
  },
};

export function describeProblem(problem: Problem): { cause: string; action: string } {
  return descriptions[problem];
}
