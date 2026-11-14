export function exportFileName(assetName: string, kind: "json" | "md"): string {
  const base =
    assetName
      .split("")
      .map((character) =>
        character === "/" ||
        character === "\\" ||
        character.charCodeAt(0) <= 31 ||
        character.charCodeAt(0) === 127
          ? "_"
          : character,
      )
      .join("")
      .replace(/\.glb$/i, "") || "model";
  return `${base}.lint.${kind}`;
}
