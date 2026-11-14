import { describe, expect, it } from "vitest";
import { MAX_DROPPED_ENTRIES, readDroppedEntries } from "./drop-entries";

interface FakeFileEntry {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (ok: (file: File) => void, fail: (error: Error) => void) => void;
}
interface FakeDirectoryEntry {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => { readEntries: (ok: (entries: FakeEntry[]) => void) => void };
}
type FakeEntry = FakeFileEntry | FakeDirectoryEntry;

const fileEntry = (name: string): FakeFileEntry => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (ok) => ok(new File([new Uint8Array(1)], name)),
});
// readEntries hands out at most `batch` entries per call, then an empty list, as browsers do.
const directory = (name: string, children: FakeEntry[], batch = 2): FakeDirectoryEntry => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let offset = 0;
    return {
      readEntries: (ok) => {
        ok(children.slice(offset, offset + batch));
        offset += batch;
      },
    };
  },
});
const item = (entry: FakeEntry | null, file: File | null = null) => ({
  kind: "file" as const,
  webkitGetAsEntry: () => entry,
  getAsFile: () => file,
});
const transfer = (items: ReturnType<typeof item>[], files: File[] = []) =>
  ({ items, files }) as unknown as DataTransfer;

describe("readDroppedEntries", () => {
  it("reads plain files with their names as paths", async () => {
    const result = await readDroppedEntries(
      transfer([item(fileEntry("a.gltf")), item(fileEntry("a.bin"))]),
    );
    expect(result.map((e) => e.path)).toEqual(["a.gltf", "a.bin"]);
    expect(result[0]?.file.name).toBe("a.gltf");
  });

  it("reads a dropped folder, all batches, with paths relative to the folder", async () => {
    const folder = directory("model", [
      fileEntry("scene.gltf"),
      fileEntry("scene.bin"),
      directory("textures", [fileEntry("a.png"), fileEntry("b.png"), fileEntry("c.png")]),
    ]);
    const result = await readDroppedEntries(transfer([item(folder)]));
    expect(result.map((e) => e.path).sort()).toEqual([
      "scene.bin",
      "scene.gltf",
      "textures/a.png",
      "textures/b.png",
      "textures/c.png",
    ]);
  });

  it("skips hidden files and folders", async () => {
    const folder = directory("model", [
      fileEntry(".DS_Store"),
      directory(".git", [fileEntry("config")]),
      fileEntry("scene.gltf"),
    ]);
    const result = await readDroppedEntries(transfer([item(folder)]));
    expect(result.map((e) => e.path)).toEqual(["scene.gltf"]);
  });

  it("stops at the cap instead of reading an enormous folder", async () => {
    const many = Array.from({ length: MAX_DROPPED_ENTRIES + 50 }, (_, i) => fileEntry(`f${i}.bin`));
    const result = await readDroppedEntries(transfer([item(directory("big", many, 500))]));
    expect(result).toHaveLength(MAX_DROPPED_ENTRIES);
  });

  it("falls back to dataTransfer.files when entries are not available", async () => {
    const a = new File([new Uint8Array(1)], "a.glb");
    const result = await readDroppedEntries(transfer([item(null, a)], [a]));
    expect(result).toEqual([{ file: a, path: "a.glb" }]);
  });

  it("does not throw when a file cannot be read; it leaves that file out", async () => {
    const broken: FakeFileEntry = {
      ...fileEntry("bad.bin"),
      file: (_ok, fail) => fail(new Error("denied")),
    };
    const result = await readDroppedEntries(transfer([item(broken), item(fileEntry("ok.gltf"))]));
    expect(result.map((e) => e.path)).toEqual(["ok.gltf"]);
  });
});

it("captures every item entry before the first asynchronous file read", async () => {
  let live = true;
  const first = fileEntry("scene.gltf");
  first.file = (ok) => {
    queueMicrotask(() => {
      live = false;
      ok(new File(["{}"], first.name));
    });
  };
  const second = item(fileEntry("scene.bin"));
  const getEntry = second.webkitGetAsEntry;
  second.webkitGetAsEntry = () => (live ? getEntry() : null);
  const result = await readDroppedEntries(transfer([item(first), second]));
  expect(result.map((entry) => entry.path)).toEqual(["scene.gltf", "scene.bin"]);
});

it("continues with siblings after an unreadable subfolder", async () => {
  const broken = directory("broken", []);
  broken.createReader = () => {
    throw new Error("denied");
  };
  const result = await readDroppedEntries(
    transfer([item(directory("model", [broken, fileEntry("scene.gltf")]))]),
  );
  expect(result.map((entry) => entry.path)).toEqual(["scene.gltf"]);
});

it("falls back to files when the entry API throws", async () => {
  const file = new File(["data"], "scene.glb");
  const broken = item(null, file);
  broken.webkitGetAsEntry = () => {
    throw new Error("unavailable");
  };
  expect(await readDroppedEntries(transfer([broken], [file]))).toEqual([{ file, path: file.name }]);
});
