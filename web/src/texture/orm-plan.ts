import type { ImageInfo } from "./image-info";
import { DEFAULT_MAX_PIXELS, planTexture, RAISED_MAX_PIXELS } from "./texture-plan";

export const ORM_CHANNELS = ["occlusion", "roughness", "metallic"] as const;
export type OrmChannel = (typeof ORM_CHANNELS)[number];
export const ORM_DEFAULTS = { occlusion: 255, roughness: 255, metallic: 0 } as const;
export type OrmWarning =
  | { kind: "depth16" | "icc"; channel: OrmChannel }
  | { kind: "nonGray"; channel: OrmChannel; count: number }
  | { kind: "translucent"; count: number };
export type OrmPackPlan =
  | { kind: "go" | "confirm"; width: number; height: number; maxPixels: number }
  | { kind: "reject"; code: "E-TEX-001"; reason: "none" | "unsupported" }
  | { kind: "reject"; code: "E-TEX-002" }
  | { kind: "reject"; code: "E-TEX-003"; width: number; height: number };

export function ormDefaultsUsed(present: readonly boolean[]) {
  return ORM_CHANNELS.filter((_, index) => !present[index]).map((channel) => ({
    channel,
    value: ORM_DEFAULTS[channel],
  }));
}
export function planOrmPack(infos: readonly (ImageInfo | null)[]): OrmPackPlan {
  const given = infos.filter((info) => info !== null);
  if (!given.length) return { kind: "reject", code: "E-TEX-001", reason: "none" };
  for (const info of given) {
    const plan = planTexture(info);
    if (plan.kind === "reject") return plan;
  }
  const first = given[0];
  if (!first || first.format === "unknown")
    return { kind: "reject", code: "E-TEX-001", reason: "unsupported" };
  const { width, height } = first;
  if (given.some((info) => info.width !== width || info.height !== height))
    return { kind: "reject", code: "E-TEX-002" };
  return {
    kind: width * height > DEFAULT_MAX_PIXELS ? "confirm" : "go",
    maxPixels: width * height > DEFAULT_MAX_PIXELS ? RAISED_MAX_PIXELS : DEFAULT_MAX_PIXELS,
    width,
    height,
  };
}
export function ormPackWarnings(
  infos: readonly (ImageInfo | null)[],
  counts: { nonGray: readonly number[]; translucent: number },
): OrmWarning[] {
  const warnings: OrmWarning[] = [];
  ORM_CHANNELS.forEach((channel, index) => {
    const info = infos[index];
    if (!info || info.format === "unknown") return;
    if (info.bitDepth === 16) warnings.push({ kind: "depth16", channel });
    if (info.hasIccProfile) warnings.push({ kind: "icc", channel });
    const count = counts.nonGray[index] ?? 0;
    if (count > 0) warnings.push({ kind: "nonGray", channel, count });
  });
  if (counts.translucent > 0) warnings.push({ kind: "translucent", count: counts.translucent });
  return warnings;
}
function stem(name: string, suffix: string): string {
  return name
    .replace(/[/\\\p{Cc}]/gu, "_")
    .replace(/\.(png|jpe?g)$/i, "")
    .replace(new RegExp(`(^|[_.-])(${suffix})$`, "i"), "");
}
export function ormPackOutputName(names: readonly (string | null)[]): string {
  const base = stem(
    names.find((name) => name !== null) ?? "",
    "ao|occlusion|roughness|metallic|metalness",
  );
  return base ? `${base}_orm.png` : "orm.png";
}
export function ormUnpackOutputNames(name: string): Record<OrmChannel, string> {
  const base = stem(name, "orm") || "orm";
  return {
    occlusion: `${base}_occlusion.png`,
    roughness: `${base}_roughness.png`,
    metallic: `${base}_metallic.png`,
  };
}
