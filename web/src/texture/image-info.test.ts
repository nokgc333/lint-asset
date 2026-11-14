import { describe, expect, it } from "vitest";
import { readImageInfo } from "./image-info";

function u32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// The header reader never checks a CRC, so a zero CRC is enough for these tests.
function chunk(type: string, data: number[]): number[] {
  return [...u32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

function ihdr(width: number, height: number, bitDepth: number, colorType: number): number[] {
  return chunk("IHDR", [...u32(width), ...u32(height), bitDepth, colorType, 0, 0, 0]);
}

function png(...chunks: number[][]): Uint8Array {
  return Uint8Array.from([...PNG_SIGNATURE, ...chunks.flat()]);
}

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 255, length & 255, ...payload];
}

function sof0(width: number, height: number, precision = 8): number[] {
  return segment(0xc0, [
    precision,
    (height >> 8) & 255,
    height & 255,
    (width >> 8) & 255,
    width & 255,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);
}

function jpeg(...segments: number[][]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xd9]);
}

describe("readImageInfo with a PNG", () => {
  it("reads the size and an 8-bit RGB image as opaque", () => {
    const info = readImageInfo(png(ihdr(512, 256, 8, 2), chunk("IDAT", [0])));
    expect(info).toEqual({
      format: "png",
      width: 512,
      height: 256,
      bitDepth: 8,
      hasAlphaChannel: false,
      hasIccProfile: false,
    });
  });

  it("reports 16-bit depth", () => {
    expect(readImageInfo(png(ihdr(4, 4, 16, 2)))).toMatchObject({ format: "png", bitDepth: 16 });
  });

  it("treats colour types 4 and 6 as having an alpha channel", () => {
    expect(readImageInfo(png(ihdr(4, 4, 8, 6)))?.hasAlphaChannel).toBe(true);
    expect(readImageInfo(png(ihdr(4, 4, 8, 4)))?.hasAlphaChannel).toBe(true);
    expect(readImageInfo(png(ihdr(4, 4, 8, 0)))?.hasAlphaChannel).toBe(false);
  });

  it("treats a tRNS chunk before the image data as transparency", () => {
    const indexed = png(ihdr(4, 4, 8, 3), chunk("PLTE", [0, 0, 0]), chunk("tRNS", [128]));
    expect(readImageInfo(indexed)?.hasAlphaChannel).toBe(true);
    const rgb = png(ihdr(4, 4, 8, 2), chunk("tRNS", [0, 0, 0, 0, 0, 0]));
    expect(readImageInfo(rgb)?.hasAlphaChannel).toBe(true);
  });

  it("detects an embedded ICC profile (iCCP)", () => {
    const info = readImageInfo(
      png(ihdr(4, 4, 8, 2), chunk("iCCP", [0x73, 0, 0]), chunk("IDAT", [0])),
    );
    expect(info?.hasIccProfile).toBe(true);
  });

  it("does not read chunks after the image data", () => {
    const info = readImageInfo(png(ihdr(4, 4, 8, 2), chunk("IDAT", [0]), chunk("iCCP", [0, 0, 0])));
    expect(info?.hasIccProfile).toBe(false);
  });

  it("returns the header fields even when the data after them is cut off", () => {
    const whole = png(ihdr(64, 32, 8, 2));
    expect(readImageInfo(whole.slice(0, 8 + 8 + 13))).toMatchObject({ width: 64, height: 32 });
  });

  it("returns unknown when the header is cut before the size", () => {
    expect(readImageInfo(png(ihdr(64, 32, 8, 2)).slice(0, 20))).toEqual({ format: "unknown" });
  });

  it("returns unknown when the first chunk is not IHDR", () => {
    expect(readImageInfo(png(chunk("IDAT", [0])))).toEqual({ format: "unknown" });
  });

  it("does not run past the end when a chunk claims a huge length", () => {
    const bytes = Uint8Array.from([
      ...PNG_SIGNATURE,
      ...ihdr(4, 4, 8, 2),
      ...u32(0xffffffff),
      ...ascii("iCCP"),
      1,
      2,
    ]);
    expect(readImageInfo(bytes)).toMatchObject({ format: "png", hasIccProfile: true });
  });

  it("handles the largest 32-bit size without wrapping", () => {
    const info = readImageInfo(png(ihdr(0xffffffff, 0x80000000, 8, 2)));
    expect(info).toMatchObject({ width: 4294967295, height: 2147483648 });
  });
});

describe("readImageInfo with a JPEG", () => {
  it("reads the size and treats it as an opaque 8-bit image", () => {
    expect(readImageInfo(jpeg(sof0(640, 480)))).toEqual({
      format: "jpeg",
      width: 640,
      height: 480,
      bitDepth: 8,
      hasAlphaChannel: false,
      hasIccProfile: false,
    });
  });

  it("skips other segments before the frame header", () => {
    const app0 = segment(0xe0, ascii("JFIF").concat([0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
    expect(readImageInfo(jpeg(app0, sof0(100, 50)))).toMatchObject({ width: 100, height: 50 });
  });

  it("reads progressive frames (SOF2)", () => {
    const frame = sof0(300, 200);
    frame[1] = 0xc2;
    expect(readImageInfo(jpeg(frame))).toMatchObject({ width: 300, height: 200 });
  });

  it("detects an ICC profile in an APP2 segment", () => {
    const icc = segment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, 9, 9]);
    expect(readImageInfo(jpeg(icc, sof0(8, 8)))?.hasIccProfile).toBe(true);
  });

  it("does not treat an APP2 segment of another kind as ICC", () => {
    const other = segment(0xe2, [...ascii("MPF"), 0, 1, 2]);
    expect(readImageInfo(jpeg(other, sof0(8, 8)))?.hasIccProfile).toBe(false);
  });

  it("returns unknown when no frame header is found", () => {
    expect(readImageInfo(jpeg(segment(0xe0, [0, 0])))).toEqual({ format: "unknown" });
  });

  it("returns unknown for a truncated frame header", () => {
    expect(readImageInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8, 0]))).toEqual({
      format: "unknown",
    });
  });

  it("does not loop forever on a zero-length segment", () => {
    expect(
      readImageInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9])),
    ).toEqual({
      format: "unknown",
    });
  });
});

describe("readImageInfo with other data", () => {
  it("returns unknown for an empty array", () => {
    expect(readImageInfo(new Uint8Array(0))).toEqual({ format: "unknown" });
  });

  it("returns unknown for text and other image formats", () => {
    expect(readImageInfo(Uint8Array.from(ascii("hello world, this is not an image")))).toEqual({
      format: "unknown",
    });
    expect(readImageInfo(Uint8Array.from([...ascii("GIF89a"), 1, 0, 1, 0]))).toEqual({
      format: "unknown",
    });
  });
});
