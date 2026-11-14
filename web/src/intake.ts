export interface IntakeEntry {
  file: File;
  path: string;
}

type Selection =
  | { kind: "none" | "noModel" | "manyModels" }
  | {
      kind: "model";
      format: "glb" | "gltf" | "obj";
      model: IntakeEntry;
      companions: readonly IntakeEntry[];
    };

export function entriesFromFileList(files: ArrayLike<File> | null | undefined): IntakeEntry[] {
  return Array.from(files ?? [], (file) => ({
    file,
    path: file.webkitRelativePath || file.name,
  }));
}

export function planSelection(entries: readonly IntakeEntry[]): Selection {
  if (entries.length === 0) return { kind: "none" };
  const models = entries.filter((entry) => /\.(glb|gltf|obj)$/i.test(entry.path));
  const model = models[0];
  if (!model) return { kind: "noModel" };
  if (models.length > 1) return { kind: "manyModels" };
  const format = /\.obj$/i.test(model.path) ? "obj" : /\.gltf$/i.test(model.path) ? "gltf" : "glb";
  return {
    kind: "model",
    format,
    model,
    companions: format === "gltf" ? entries.filter((entry) => entry !== model) : [],
  };
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|webp|ktx2?|tga|exr|gif|bmp|tiff?|avif|hdr|dds|svg|ico)$/i.test(name);
}
