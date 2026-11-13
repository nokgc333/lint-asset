import type { GeometryResult } from "./wasm/lint_core.mjs";

export type WorkerRequest =
  | { readonly id: number; readonly type: "version" }
  | {
      readonly id: number;
      readonly type: "load";
      readonly bytes: ArrayBuffer;
      readonly maxFileBytes: number;
      readonly maxTriangles: number;
    };

export type WorkerResponse =
  | { readonly id: number; readonly type: "version"; readonly version: string }
  | { readonly id: number; readonly type: "loaded"; readonly result: GeometryResult }
  | { readonly id: number; readonly type: "error"; readonly message: string };
