import type { Locale } from "../i18n/locale";
import { createTranslator } from "../i18n/translate";

const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const patterns: Record<string, readonly [RegExp, string][]> = {
  "normal.flipped": [
    [/^Vertex normals point opposite to the face winding\.$/, "checks.normal.flipped"],
  ],
  "normal.missing": [[/^The primitive has no vertex normals\.$/, "checks.normal.missing"]],
  "normal.unnormalized": [
    [
      new RegExp(
        `^Vertex normals are not unit length \\(outside (?<unit>${NUMBER}) \\+/- (?<tolerance>${NUMBER})\\)\\.$`,
      ),
      "checks.normal.unnormalized",
    ],
  ],
  "mesh.nonmanifold_edge": [
    [
      /^(?<count>1) edge is shared by three or more triangles\.$/,
      "checks.mesh.nonmanifold_edge.other",
    ],
    [
      /^(?<count>\d+) edges are each shared by three or more triangles\.$/,
      "checks.mesh.nonmanifold_edge.other",
    ],
  ],
  "mesh.boundary_edge": [
    [
      /^(?<count>1) boundary edge is used by only one triangle\.$/,
      "checks.mesh.boundary_edge.other",
    ],
    [
      /^(?<count>\d+) boundary edges are each used by only one triangle\.$/,
      "checks.mesh.boundary_edge.other",
    ],
  ],
  "mesh.degenerate_triangle": [
    [
      new RegExp(
        `^Triangles with an area below (?<area>${NUMBER}), or with a position that is not a finite number\\.$`,
      ),
      "checks.mesh.degenerate_triangle",
    ],
  ],
  "uv.missing": [[/^The primitive has no UV coordinates\.$/, "checks.uv.missing"]],
  "uv.out_of_range": [
    [/^UV coordinates are outside the (?<min>0) to (?<max>1) range\.$/, "checks.uv.out_of_range"],
  ],
  "uv.overlap": [
    [/^Triangles overlap in UV space\.$/, "checks.uv.overlap"],
    [
      /^Triangles overlap in UV space in a mirrored layout \(for example, left and right halves that share one area\)\.$/,
      "checks.uv.overlapMirrored",
    ],
  ],
  "asset.triangle_count_exceeded": [
    [
      /^The scene draws (?<count>\d+) triangles \(limit (?<limit>\d+)\)\.$/,
      "checks.asset.triangle_count_exceeded",
    ],
  ],
  "asset.scale_too_small": [
    [
      new RegExp(
        `^The longest side of the bounding box is (?<extent>${NUMBER}) m \\(minimum (?<limit>${NUMBER}) m\\)\\.$`,
      ),
      "checks.asset.scale_too_small",
    ],
  ],
  "asset.scale_too_large": [
    [
      new RegExp(
        `^The longest side of the bounding box is (?<extent>${NUMBER}) m \\(limit (?<limit>${NUMBER}) m\\)\\.$`,
      ),
      "checks.asset.scale_too_large",
    ],
  ],
};

export function localizeIssueMessage(rule: string, message: string, locale: Locale): string {
  if (locale === "en") return message;
  const candidates = Object.hasOwn(patterns, rule) ? patterns[rule] : undefined;
  for (const [pattern, key] of candidates ?? []) {
    const match = pattern.exec(message);
    if (match && match[0] === message) return createTranslator(locale).t(key, match.groups);
  }
  return message;
}
