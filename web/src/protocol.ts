import type {
  AnalyzeResult,
  NormalMapResult,
  PackOrmResult,
  Thresholds,
  UnpackOrmResult,
} from "./wasm/lint_core.mjs";

export type WorkerRequest =
  | {
      id: number;
      type: "packOrm";
      width: number;
      height: number;
      inputs: [ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null];
      maxPixels: number;
    }
  | {
      id: number;
      type: "unpackOrm";
      pixels: ArrayBuffer;
      width: number;
      height: number;
      maxPixels: number;
    }
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
      readonly files?: readonly { name: string; bytes: ArrayBuffer }[];
      readonly thresholds: Thresholds;
      readonly maxFileBytes: number;
      readonly maxTriangles: number;
    };

export type WorkerResponse =
  | { id: number; type: "packedOrm"; result: PackOrmResult }
  | { id: number; type: "unpackedOrm"; result: UnpackOrmResult }
  | { id: number; type: "flipped"; pixels: ArrayBuffer; result: NormalMapResult }
  | { readonly id: number; readonly type: "version"; readonly version: string }
  | { readonly id: number; readonly type: "loaded"; readonly result: AnalyzeResult }
  | { readonly id: number; readonly type: "error"; readonly message: string };
