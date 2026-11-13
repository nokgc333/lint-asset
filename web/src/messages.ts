export interface LoadMessage {
  readonly cause: string;
  readonly action: string;
}

const MESSAGES: Readonly<Record<string, LoadMessage>> & { readonly fallback: LoadMessage } = {
  "E-LOAD-001": {
    cause:
      "This file is not a GLB (binary glTF 2.x), or it depends on files that are not included.",
    action: "Export the model as a single .glb file and open that file.",
  },
  "E-LOAD-002": {
    cause: "The GLB file is damaged or incomplete.",
    action: "Export the model again, or download the file again, and try once more.",
  },
  "E-LOAD-003": {
    cause: "The file or the model is over the size limit this tool can inspect.",
    action: "Reduce the polygon count or split the model, then open it again.",
  },
  "E-LOAD-004": {
    cause: "The file requires a glTF extension this tool cannot read.",
    action: "Export the model without compression extensions such as Draco or meshopt.",
  },
  fallback: {
    cause: "The file could not be loaded.",
    action: "Try a different file, or export the model again.",
  },
};

export function messageFor(code: string): LoadMessage {
  return (Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined) ?? MESSAGES.fallback;
}

export function formatLoadError(code: string, detail: string): string {
  const { cause, action } = messageFor(code);
  return `${code}: ${cause} ${action}${detail ? ` (Detail: ${detail})` : ""}`;
}
