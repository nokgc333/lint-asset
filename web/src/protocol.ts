// Messages between the page and the worker (IF-003).

export type WorkerRequest = { readonly id: number; readonly type: "version" };

export type WorkerResponse =
  | { readonly id: number; readonly type: "version"; readonly version: string }
  | { readonly id: number; readonly type: "error"; readonly message: string };
