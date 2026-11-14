import { describe, expect, it } from "vitest";
import { entriesFromFileList, isImageName, planSelection } from "./intake";

const file = (name: string): File => new File([new Uint8Array(1)], name);
const entry = (path: string) => ({ file: file(path.split("/").pop() ?? path), path });

describe("entriesFromFileList", () => {
  it("uses the file name as the path for a plain selection", () => {
    const a = file("a.glb");
    expect(entriesFromFileList([a])).toEqual([{ file: a, path: "a.glb" }]);
  });

  it("uses webkitRelativePath when the browser gives one", () => {
    const a = file("a.png");
    Object.defineProperty(a, "webkitRelativePath", { value: "model/textures/a.png" });
    expect(entriesFromFileList([a])[0]?.path).toBe("model/textures/a.png");
  });

  it("returns nothing for no list", () => {
    expect(entriesFromFileList(null)).toEqual([]);
    expect(entriesFromFileList(undefined)).toEqual([]);
  });
});

describe("planSelection", () => {
  it("reports nothing when there is no entry", () => {
    expect(planSelection([])).toEqual({ kind: "none" });
  });

  it("takes a single GLB as the model", () => {
    const glb = entry("a.glb");
    expect(planSelection([glb])).toEqual({
      kind: "model",
      format: "glb",
      model: glb,
      companions: [],
    });
  });

  it("takes the one .gltf as the model and everything else as companions, in order", () => {
    const gltf = entry("scene.gltf");
    const bin = entry("scene.bin");
    const png = entry("textures/a.png");
    expect(planSelection([bin, gltf, png])).toEqual({
      kind: "model",
      format: "gltf",
      model: gltf,
      companions: [bin, png],
    });
  });

  it("matches the extension without regard to case, on the last part of the path", () => {
    expect(planSelection([entry("dir.gltf/SCENE.GLTF")])).toMatchObject({ format: "gltf" });
    expect(planSelection([entry("A.GLB")])).toMatchObject({ format: "glb" });
  });

  it("reports noModel when files were given but none is a .glb or .gltf", () => {
    expect(planSelection([entry("scene.bin"), entry("a.png")])).toEqual({ kind: "noModel" });
  });

  it("reports manyModels instead of silently picking one", () => {
    expect(planSelection([entry("a.glb"), entry("b.glb")])).toEqual({ kind: "manyModels" });
    expect(planSelection([entry("a.gltf"), entry("b.glb")])).toEqual({ kind: "manyModels" });
  });
});

describe("isImageName", () => {
  it.each(["a.png", "A.JPG", "x/y.jpeg", "t.webp", "t.ktx2", "t.tga", "t.exr"])(
    "%s is an image",
    (name) => expect(isImageName(name)).toBe(true),
  );
  it.each(["a.bin", "scene.gltf", "data", "png", "a.png.bin"])("%s is not", (name) =>
    expect(isImageName(name)).toBe(false),
  );
});
