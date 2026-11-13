import { describe, expect, it } from "vitest";
import { pickSingleFile } from "./intake";

const file = (name: string): File => new File([new Uint8Array(1)], name);

describe("pickSingleFile", () => {
  it("returns the file when exactly one is given", () => {
    const only = file("a.glb");
    expect(pickSingleFile([only])).toEqual({ kind: "file", file: only });
  });

  it("reports nothing when there is no file", () => {
    expect(pickSingleFile([])).toEqual({ kind: "none" });
    expect(pickSingleFile(null)).toEqual({ kind: "none" });
    expect(pickSingleFile(undefined)).toEqual({ kind: "none" });
  });

  it("reports many when more than one file is given, instead of silently picking one", () => {
    expect(pickSingleFile([file("a.glb"), file("b.glb")])).toEqual({ kind: "many" });
  });
});
