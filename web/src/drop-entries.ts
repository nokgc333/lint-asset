import { entriesFromFileList, type IntakeEntry } from "./intake";

export const MAX_DROPPED_ENTRIES = 10000;

function readFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      entry.file(resolve, () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    try {
      reader.readEntries(resolve, () => resolve([]));
    } catch {
      resolve([]);
    }
  });
}

function snapshotItem(item: DataTransferItem): {
  entry: FileSystemEntry | null;
  file: File | null;
} {
  let entry: FileSystemEntry | null = null;
  let file: File | null = null;
  try {
    entry = item.webkitGetAsEntry?.() ?? null;
  } catch {}
  try {
    file = item.getAsFile?.() ?? null;
  } catch {}
  return { entry, file };
}

export async function readDroppedEntries(dataTransfer: DataTransfer): Promise<IntakeEntry[]> {
  const result: IntakeEntry[] = [];
  let visited = 0;
  async function visit(entry: FileSystemEntry, path: string): Promise<void> {
    if (visited >= MAX_DROPPED_ENTRIES || entry.name.startsWith(".")) return;
    if (entry.isFile) {
      visited += 1;
      const file = await readFile(entry as FileSystemFileEntry);
      if (file) result.push({ file, path });
      return;
    }
    if (!entry.isDirectory) return;
    if (path) visited += 1;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    while (visited < MAX_DROPPED_ENTRIES) {
      const batch = await readBatch(reader);
      if (batch.length === 0) return;
      for (const child of batch) {
        await visit(child, path ? `${path}/${child.name}` : child.name).catch(() => undefined);
        if (visited >= MAX_DROPPED_ENTRIES) return;
      }
    }
  }
  try {
    const fallback = entriesFromFileList(dataTransfer.files);
    const items = Array.from(dataTransfer.items ?? []);
    const roots = items.filter((item) => item.kind === "file").map(snapshotItem);
    if (!roots.some((root) => root.entry)) {
      return fallback
        .filter((entry) => !entry.path.split("/").some((part) => part.startsWith(".")))
        .slice(0, MAX_DROPPED_ENTRIES);
    }
    for (const root of roots) {
      try {
        if (root.entry) await visit(root.entry, root.entry.isDirectory ? "" : root.entry.name);
        else if (root.file && !root.file.name.startsWith(".") && visited < MAX_DROPPED_ENTRIES) {
          visited += 1;
          result.push({ file: root.file, path: root.file.name });
        }
      } catch {}
    }
  } catch {
    return result;
  }
  return result;
}
