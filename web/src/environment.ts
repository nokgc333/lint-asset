import type { Locale } from "./i18n/locale";
import { createTranslator } from "./i18n/translate";
// Narrower than this the layout cannot fit. A window or a zoomed page wider than this works: a user
// who zooms to 200% on a 1440 px screen has a 720 px page and must be able to use the tool.
export const MIN_VIEWPORT_WIDTH = 320;

export interface Capabilities {
  webgl2: boolean;
  webassembly: boolean;
  worker: boolean;
  // The device has only a coarse pointer (a finger), like a phone or a tablet without a mouse.
  touchOnly: boolean;
}

export type Problem = "webgl2" | "webassembly" | "worker" | "touch" | "narrow";

type Environment = {
  document: {
    createElement(tag: "canvas"): { getContext(type: string): unknown };
  };
  WebAssembly?: unknown;
  Worker?: unknown;
  matchMedia?: (query: string) => { matches: boolean };
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
  let touchOnly = false;
  try {
    touchOnly = Boolean(
      env.matchMedia?.("(pointer: coarse)").matches &&
        !env.matchMedia("(any-pointer: fine)").matches,
    );
  } catch {
    touchOnly = false;
  }
  return {
    webgl2,
    webassembly: typeof env.WebAssembly === "object" && env.WebAssembly !== null,
    worker: typeof env.Worker === "function",
    touchOnly,
  };
}

export function findProblems(capabilities: Capabilities, viewportWidth: number): Problem[] {
  const problems: Problem[] = [];
  for (const capability of ["webgl2", "webassembly", "worker"] as const) {
    if (!capabilities[capability]) problems.push(capability);
  }
  if (capabilities.touchOnly) problems.push("touch");
  if (viewportWidth < MIN_VIEWPORT_WIDTH) problems.push("narrow");
  return problems;
}

export function isPermanent(problem: Problem): boolean {
  return problem !== "narrow";
}

export function describeProblem(
  problem: Problem,
  locale: Locale = "en",
): { cause: string; action: string } {
  const { t } = createTranslator(locale);
  return {
    cause: t(`environment.${problem}.cause`, { width: MIN_VIEWPORT_WIDTH }),
    action: t(`environment.${problem}.action`),
  };
}
