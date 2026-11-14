import { describe, expect, it } from "vitest";
import { fetchSampleFile, SAMPLE_FILE_NAME } from "./sample";

describe("fetchSampleFile", () => {
  it("returns the response as a GLB file with the sample's name", async () => {
    const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
    const file = await fetchSampleFile(
      async () => ({ ok: true, status: 200, blob: async () => new Blob([bytes]) }),
      "/sample.glb",
    );
    expect(file.name).toBe(SAMPLE_FILE_NAME);
    expect(file.type).toBe("model/gltf-binary");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it("asks only for the address it was given", async () => {
    const asked: string[] = [];
    await fetchSampleFile(async (url) => {
      asked.push(url);
      return { ok: true, status: 200, blob: async () => new Blob([]) };
    }, "/assets/sample-abc.glb");
    expect(asked).toEqual(["/assets/sample-abc.glb"]);
  });

  it("throws when the sample cannot be read", async () => {
    await expect(
      fetchSampleFile(
        async () => ({ ok: false, status: 404, blob: async () => new Blob([]) }),
        "/missing.glb",
      ),
    ).rejects.toThrow("HTTP 404");
  });

  it("uses an address on this site by default, not an external one", async () => {
    const asked: string[] = [];
    await fetchSampleFile(async (url) => {
      asked.push(url);
      return { ok: true, status: 200, blob: async () => new Blob([]) };
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(/^[a-z]+:\/\//i);
    expect(asked[0]).not.toMatch(/^\/\//);
    expect(asked[0]).toMatch(/toy-house-broken/);
  });
});
