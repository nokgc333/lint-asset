import type { ImageInfo } from "./image-info";

export const DEFAULT_MAX_PIXELS = 8192 * 8192;
export const RAISED_MAX_PIXELS = 2 * DEFAULT_MAX_PIXELS;
export const MAX_SIDE = 16384;
export const HEADER_READ_BYTES = 4 * 1024 * 1024;
export type Direction = "dx-to-gl" | "gl-to-dx";
export type TextureWarning = { kind: "translucent"; count: number } | { kind: "depth16" | "icc" };

export function planTexture(info: ImageInfo) {
  if (info.format === "unknown" || info.width <= 0 || info.height <= 0)
    return { kind: "reject", code: "E-TEX-001", reason: "unsupported" } as const;
  if (
    info.width > MAX_SIDE ||
    info.height > MAX_SIDE ||
    info.width * info.height > RAISED_MAX_PIXELS
  )
    return { kind: "reject", code: "E-TEX-003", width: info.width, height: info.height } as const;
  return info.width * info.height > DEFAULT_MAX_PIXELS
    ? ({ kind: "confirm", maxPixels: RAISED_MAX_PIXELS } as const)
    : ({ kind: "go", maxPixels: DEFAULT_MAX_PIXELS } as const);
}
export function textureWarnings(info: ImageInfo, translucentPixels: number): TextureWarning[] {
  if (info.format === "unknown") return [];
  const warnings: TextureWarning[] = [];
  if (translucentPixels > 0) warnings.push({ kind: "translucent", count: translucentPixels });
  if (info.bitDepth === 16) warnings.push({ kind: "depth16" });
  if (info.hasIccProfile) warnings.push({ kind: "icc" });
  return warnings;
}
export function textureOutputName(name: string, direction: Direction): string {
  const stem = name.replace(/[/\\\p{Cc}]/gu, "_").replace(/\.(png|jpe?g)$/i, "") || "normal-map";
  return `${stem}.${direction === "dx-to-gl" ? "gl" : "dx"}.png`;
}
