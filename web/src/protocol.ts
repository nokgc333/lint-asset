import type { AnalyzeResult, NormalMapResult } from "./wasm/lint_core.mjs";

export type WorkerRequest =
  | { readonly id: number; readonly type: "version" }
  | {
      id: number;
      type: "flip";
      pixels: ArrayBuffer;
      width: number;
      height: number;
      maxPixels: number;
    }
  | {
      readonly id: number;
      readonly type: "load";
      readonly bytes: ArrayBuffer;
      readonly maxFileBytes: number;
      readonly maxTriangles: number;
    };

export type WorkerResponse =
  | { id: number; type: "flipped"; pixels: ArrayBuffer; result: NormalMapResult }
  | { readonly id: number; readonly type: "version"; readonly version: string }
  | { readonly id: number; readonly type: "loaded"; readonly result: AnalyzeResult }
  | { readonly id: number; readonly type: "error"; readonly message: string };
