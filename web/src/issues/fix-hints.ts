// The "how to fix" guide of the detail panel (SCR-001). For each rule it holds three texts (what it
// means, why it matters, how to fix it in general) and, for the tools below, a one-line pointer to
// the menu or node that does the job. The texts are in the catalog under
// `hint.<rule>.meaning`, `hint.<rule>.why`, `hint.<rule>.fix` and `hint.<rule>.tool.<tool>`.
//
// A tool line is written only where the name is known to be right (checked against the tool's
// documentation, see the pull request that added it). It is a guide: names can differ between
// versions.

export type Tool = "blender" | "maya" | "max" | "houdini" | "unreal";

export const TOOLS: readonly Tool[] = ["blender", "maya", "max", "houdini", "unreal"];

// Product names are not translated.
export const TOOL_NAMES: Record<Tool, string> = {
  blender: "Blender",
  maya: "Maya",
  max: "3ds Max",
  houdini: "Houdini",
  unreal: "Unreal Engine",
};

// The tools that have a line for each rule, in the order they are shown.
export const FIX_HINTS: Record<string, readonly Tool[]> = {
  "normal.flipped": ["blender", "maya", "max"],
  "normal.missing": ["blender", "unreal"],
  "normal.unnormalized": ["blender"],
  "mesh.nonmanifold_edge": ["blender", "maya", "houdini"],
  "mesh.boundary_edge": ["blender", "maya", "max", "houdini"],
  "mesh.degenerate_triangle": ["blender", "maya", "houdini", "unreal"],
  "uv.missing": ["blender", "houdini"],
  "uv.out_of_range": ["blender", "houdini"],
  "uv.overlap": ["blender", "houdini"],
  "asset.triangle_count_exceeded": ["blender", "maya", "max", "unreal"],
  "asset.scale_too_small": ["blender", "maya", "max"],
  "asset.scale_too_large": ["blender", "maya", "max"],
  "asset.external_uri": ["blender"],
};

export function hintKey(rule: string, part: "meaning" | "why" | "fix"): string {
  return `hint.${rule}.${part}`;
}

export function toolHintKey(rule: string, tool: Tool): string {
  return `hint.${rule}.tool.${tool}`;
}
