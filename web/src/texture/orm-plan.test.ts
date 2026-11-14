import { describe, expect, it } from "vitest";
import type { ImageInfo } from "./image-info";
import {
  ORM_CHANNELS,
  ORM_DEFAULTS,
  ormDefaultsUsed,
  ormPackOutputName,
  ormPackWarnings,
  ormUnpackOutputNames,
  planOrmPack,
} from "./orm-plan";
import { DEFAULT_MAX_PIXELS, RAISED_MAX_PIXELS } from "./texture-plan";

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

describe("the channels and their defaults", () => {
  it("are occlusion, roughness, metallic, in the order of red, green, blue", () => {
    expect(ORM_CHANNELS).toEqual(["occlusion", "roughness", "metallic"]);
  });

  it("fill a missing texture with white occlusion, white roughness, and black metallic", () => {
    expect(ORM_DEFAULTS).toEqual({ occlusion: 255, roughness: 255, metallic: 0 });
  });
});

describe("ormDefaultsUsed", () => {
  it("lists nothing when all three textures are given", () => {
    expect(ormDefaultsUsed([true, true, true])).toEqual([]);
  });

  it("lists each missing texture with the value it is filled with, in channel order", () => {
    expect(ormDefaultsUsed([false, true, false])).toEqual([
      { channel: "occlusion", value: 255 },
      { channel: "metallic", value: 0 },
    ]);
    expect(ormDefaultsUsed([true, false, true])).toEqual([{ channel: "roughness", value: 255 }]);
    expect(ormDefaultsUsed([false, false, false])).toHaveLength(3);
  });
});

describe("planOrmPack", () => {
  it("goes ahead when the given textures have the same size", () => {
    expect(planOrmPack([png(512, 256), png(512, 256), png(512, 256)])).toEqual({
      kind: "go",
      maxPixels: DEFAULT_MAX_PIXELS,
      width: 512,
      height: 256,
    });
  });

  it("works with one or two textures; the missing ones are left out of the comparison", () => {
    expect(planOrmPack([null, png(64, 32), null])).toEqual({
      kind: "go",
      maxPixels: DEFAULT_MAX_PIXELS,
      width: 64,
      height: 32,
    });
    expect(planOrmPack([png(8, 8), null, png(8, 8)])).toMatchObject({ kind: "go" });
  });

  it("needs at least one texture", () => {
    expect(planOrmPack([null, null, null])).toEqual({
      kind: "reject",
      code: "E-TEX-001",
      reason: "none",
    });
  });

  it("rejects textures of different sizes with E-TEX-002", () => {
    expect(planOrmPack([png(512, 512), png(256, 256), null])).toEqual({
      kind: "reject",
      code: "E-TEX-002",
    });
    expect(planOrmPack([png(512, 256), png(256, 512), null])).toEqual({
      kind: "reject",
      code: "E-TEX-002",
    });
  });

  it("rejects data that is not a PNG or a JPEG with E-TEX-001", () => {
    expect(planOrmPack([png(8, 8), { format: "unknown" }, null])).toEqual({
      kind: "reject",
      code: "E-TEX-001",
      reason: "unsupported",
    });
  });

  it("rejects a texture over the largest size with E-TEX-003, before comparing sizes", () => {
    expect(planOrmPack([png(8, 8), png(20000, 20000), null])).toEqual({
      kind: "reject",
      code: "E-TEX-003",
      width: 20000,
      height: 20000,
    });
  });

  it("asks the user when the textures are over the default size, and rejects over the raised one", () => {
    expect(planOrmPack([png(9000, 9000), png(9000, 9000), null])).toEqual({
      kind: "confirm",
      maxPixels: RAISED_MAX_PIXELS,
      width: 9000,
      height: 9000,
    });
    expect(planOrmPack([png(16384, 8193), null, null])).toMatchObject({
      kind: "reject",
      code: "E-TEX-003",
    });
  });
});

describe("ormPackWarnings", () => {
  const none = { nonGray: [0, 0, 0], translucent: 0 };

  it("has none for opaque, gray, 8-bit images without a profile", () => {
    expect(ormPackWarnings([png(4, 4), png(4, 4), png(4, 4)], none)).toEqual([]);
  });

  it("names the texture that is not gray, with the number of pixels", () => {
    expect(
      ormPackWarnings([png(4, 4), png(4, 4), png(4, 4)], { nonGray: [0, 12, 0], translucent: 0 }),
    ).toEqual([{ kind: "nonGray", channel: "roughness", count: 12 }]);
  });

  it("warns once about translucent pixels, with the total over the inputs", () => {
    expect(
      ormPackWarnings([png(4, 4), null, null], { nonGray: [0, 0, 0], translucent: 5 }),
    ).toEqual([{ kind: "translucent", count: 5 }]);
  });

  it("names the texture that is 16-bit or has a color profile", () => {
    expect(
      ormPackWarnings(
        [png(4, 4), png(4, 4, { bitDepth: 16 }), png(4, 4, { hasIccProfile: true })],
        none,
      ),
    ).toEqual([
      { kind: "depth16", channel: "roughness" },
      { kind: "icc", channel: "metallic" },
    ]);
  });

  it("skips a missing texture", () => {
    expect(ormPackWarnings([null, png(4, 4, { bitDepth: 16 }), null], none)).toEqual([
      { kind: "depth16", channel: "roughness" },
    ]);
  });

  it("lists the warnings per texture in channel order, then the translucent one", () => {
    expect(
      ormPackWarnings([png(4, 4, { hasIccProfile: true, bitDepth: 16 }), png(4, 4), png(4, 4)], {
        nonGray: [3, 0, 2],
        translucent: 7,
      }),
    ).toEqual([
      { kind: "depth16", channel: "occlusion" },
      { kind: "icc", channel: "occlusion" },
      { kind: "nonGray", channel: "occlusion", count: 3 },
      { kind: "nonGray", channel: "metallic", count: 2 },
      { kind: "translucent", count: 7 },
    ]);
  });
});

describe("ormPackOutputName", () => {
  it("takes the name of the first given texture and drops its channel word", () => {
    expect(ormPackOutputName(["rock_ao.png", "rock_roughness.png", "rock_metallic.png"])).toBe(
      "rock_orm.png",
    );
    expect(ormPackOutputName([null, "Rock-Roughness.PNG", null])).toBe("Rock_orm.png");
    expect(ormPackOutputName([null, null, "wall.metalness.jpg"])).toBe("wall_orm.png");
    expect(ormPackOutputName(["a_occlusion.jpeg", null, null])).toBe("a_orm.png");
  });

  it("keeps the name when it has no channel word", () => {
    expect(ormPackOutputName(["bricks.png", null, null])).toBe("bricks_orm.png");
    expect(ormPackOutputName(["rock.v2.png", null, null])).toBe("rock.v2_orm.png");
  });

  it("removes path separators and control characters", () => {
    expect(ormPackOutputName(["a/b\\c\u0001d_ao.png", null, null])).toBe("a_b_c_d_orm.png");
  });

  it("falls back to a default when nothing is left or no name is given", () => {
    expect(ormPackOutputName([null, null, null])).toBe("orm.png");
    expect(ormPackOutputName(["_ao.png", null, null])).toBe("orm.png");
    expect(ormPackOutputName(["", null, null])).toBe("orm.png");
  });
});

describe("ormUnpackOutputNames", () => {
  it("names the three results after the packed texture, without its orm word", () => {
    expect(ormUnpackOutputNames("rock_orm.png")).toEqual({
      occlusion: "rock_occlusion.png",
      roughness: "rock_roughness.png",
      metallic: "rock_metallic.png",
    });
    expect(ormUnpackOutputNames("Rock-ORM.JPG")).toEqual({
      occlusion: "Rock_occlusion.png",
      roughness: "Rock_roughness.png",
      metallic: "Rock_metallic.png",
    });
  });

  it("keeps a name that has no orm word", () => {
    expect(ormUnpackOutputNames("bricks.png").occlusion).toBe("bricks_occlusion.png");
  });

  it("removes path separators and control characters, and falls back to a default", () => {
    expect(ormUnpackOutputNames("a/b\u0002c.png").roughness).toBe("a_b_c_roughness.png");
    expect(ormUnpackOutputNames(".png").metallic).toBe("orm_metallic.png");
    expect(ormUnpackOutputNames("_orm.png").occlusion).toBe("orm_occlusion.png");
  });
});
