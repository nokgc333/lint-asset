import { describe, expect, it } from "vitest";
import type { ImageInfo } from "./image-info";
import {
  DEFAULT_MAX_PIXELS,
  HEADER_READ_BYTES,
  MAX_SIDE,
  planTexture,
  RAISED_MAX_PIXELS,
  textureOutputName,
  textureWarnings,
} from "./texture-plan";

const png = (width: number, height: number, overrides: Partial<ImageInfo> = {}): ImageInfo =>
  ({
    format: "png",
    width,
    height,
    bitDepth: 8,
    hasAlphaChannel: false,
    hasIccProfile: false,
    ...overrides,
  }) as ImageInfo;

describe("the limits", () => {
  it("are 8192 x 8192 pixels, doubled when the user continues, at most 16384 on a side", () => {
    expect(DEFAULT_MAX_PIXELS).toBe(8192 * 8192);
    expect(RAISED_MAX_PIXELS).toBe(2 * 8192 * 8192);
    expect(MAX_SIDE).toBe(16384);
  });

  it("read a few MiB from the start of the file to find the header", () => {
    expect(HEADER_READ_BYTES).toBe(4 * 1024 * 1024);
  });
});

describe("planTexture", () => {
  it("goes ahead with the default limit for a normal image", () => {
    expect(planTexture(png(2048, 2048))).toEqual({ kind: "go", maxPixels: DEFAULT_MAX_PIXELS });
  });

  it("accepts exactly 8192 x 8192", () => {
    expect(planTexture(png(8192, 8192))).toEqual({ kind: "go", maxPixels: DEFAULT_MAX_PIXELS });
  });

  it("asks the user once the image has more pixels than the default limit", () => {
    expect(planTexture(png(8193, 8192))).toEqual({ kind: "confirm", maxPixels: RAISED_MAX_PIXELS });
    expect(planTexture(png(16384, 8192))).toEqual({
      kind: "confirm",
      maxPixels: RAISED_MAX_PIXELS,
    });
  });

  it("rejects an image over the raised limit with E-TEX-003", () => {
    expect(planTexture(png(16384, 8193))).toEqual({
      kind: "reject",
      code: "E-TEX-003",
      width: 16384,
      height: 8193,
    });
  });

  it("rejects a side over 16384 even when the pixel count is small", () => {
    expect(planTexture(png(16385, 1))).toMatchObject({ kind: "reject", code: "E-TEX-003" });
    expect(planTexture(png(1, 100000))).toMatchObject({ kind: "reject", code: "E-TEX-003" });
  });

  it("rejects a huge size without wrapping", () => {
    expect(planTexture(png(0xffffffff, 0xffffffff))).toMatchObject({
      kind: "reject",
      code: "E-TEX-003",
    });
  });

  it("rejects data that is not a PNG or a JPEG with E-TEX-001", () => {
    expect(planTexture({ format: "unknown" })).toEqual({
      kind: "reject",
      code: "E-TEX-001",
      reason: "unsupported",
    });
  });

  it("rejects an image with a zero side with E-TEX-001", () => {
    expect(planTexture(png(0, 10))).toMatchObject({ kind: "reject", code: "E-TEX-001" });
    expect(planTexture(png(10, 0))).toMatchObject({ kind: "reject", code: "E-TEX-001" });
  });

  it("accepts a JPEG like a PNG", () => {
    expect(planTexture(png(1024, 1024, { format: "jpeg" }))).toEqual({
      kind: "go",
      maxPixels: DEFAULT_MAX_PIXELS,
    });
  });
});

describe("textureWarnings", () => {
  it("has none for an opaque 8-bit image without a profile", () => {
    expect(textureWarnings(png(4, 4), 0)).toEqual([]);
  });

  it("warns about translucent pixels with their count", () => {
    expect(textureWarnings(png(4, 4, { hasAlphaChannel: true }), 12)).toEqual([
      { kind: "translucent", count: 12 },
    ]);
  });

  it("does not warn about translucent pixels when there are none, even with an alpha channel", () => {
    expect(textureWarnings(png(4, 4, { hasAlphaChannel: true }), 0)).toEqual([]);
  });

  it("warns that a 16-bit image is reduced to 8 bits", () => {
    expect(textureWarnings(png(4, 4, { bitDepth: 16 }), 0)).toEqual([{ kind: "depth16" }]);
  });

  it("warns that an embedded colour profile is ignored", () => {
    expect(textureWarnings(png(4, 4, { hasIccProfile: true }), 0)).toEqual([{ kind: "icc" }]);
  });

  it("lists the warnings in a fixed order", () => {
    expect(
      textureWarnings(png(4, 4, { bitDepth: 16, hasIccProfile: true, hasAlphaChannel: true }), 3),
    ).toEqual([{ kind: "translucent", count: 3 }, { kind: "depth16" }, { kind: "icc" }]);
  });

  it("has none for an unknown image", () => {
    expect(textureWarnings({ format: "unknown" }, 0)).toEqual([]);
  });
});

describe("textureOutputName", () => {
  it("names a DirectX to OpenGL result .gl.png and the reverse .dx.png", () => {
    expect(textureOutputName("rock_normal.png", "dx-to-gl")).toBe("rock_normal.gl.png");
    expect(textureOutputName("rock_normal.png", "gl-to-dx")).toBe("rock_normal.dx.png");
  });

  it("replaces a JPEG extension in any case", () => {
    expect(textureOutputName("Rock.JPG", "dx-to-gl")).toBe("Rock.gl.png");
    expect(textureOutputName("rock.jpeg", "gl-to-dx")).toBe("rock.dx.png");
  });

  it("keeps other dots in the name", () => {
    expect(textureOutputName("rock.v2.normal.png", "dx-to-gl")).toBe("rock.v2.normal.gl.png");
  });

  it("removes path separators and control characters", () => {
    expect(textureOutputName("a/b\\c\u0001d.png", "dx-to-gl")).toBe("a_b_c_d.gl.png");
  });

  it("falls back to a default name when nothing is left", () => {
    expect(textureOutputName(".png", "dx-to-gl")).toBe("normal-map.gl.png");
    expect(textureOutputName("", "gl-to-dx")).toBe("normal-map.dx.png");
  });
});
