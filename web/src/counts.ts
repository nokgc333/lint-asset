// The counts line shown after a file loads. English plurals follow Intl.PluralRules (§7.9).

export interface Counts {
  readonly meshes: number;
  readonly primitives: number;
  readonly triangles: number;
}

const numbers = new Intl.NumberFormat("en");
const plurals = new Intl.PluralRules("en");

function noun(count: number, singular: string, plural: string): string {
  return `${numbers.format(count)} ${plurals.select(count) === "one" ? singular : plural}`;
}

export function describeCounts(counts: Counts): string {
  return [
    noun(counts.meshes, "mesh", "meshes"),
    noun(counts.primitives, "primitive", "primitives"),
    noun(counts.triangles, "triangle", "triangles"),
  ].join(", ");
}
