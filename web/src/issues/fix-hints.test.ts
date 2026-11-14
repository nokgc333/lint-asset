import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogs } from "../i18n/catalog";
import { FIX_HINTS, hintKey, TOOL_NAMES, TOOLS, type Tool, toolHintKey } from "./fix-hints";
import { FIX_HINT_TEXTS_EN } from "./fix-hints-en";

const schema = JSON.parse(
  readFileSync(new URL("../../../schemas/report.schema.json", import.meta.url), "utf8"),
) as { $defs?: { rule?: { enum: string[] } }; definitions?: { rule?: { enum: string[] } } };
const rules =
  schema.$defs?.rule?.enum ?? schema.definitions?.rule?.enum ?? findRuleEnum(schema as unknown);

function findRuleEnum(node: unknown): string[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRuleEnum(item);
      if (found.length) return found;
    }
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.enum) && record.enum.includes("normal.flipped")) {
      return record.enum as string[];
    }
    for (const value of Object.values(record)) {
      const found = findRuleEnum(value);
      if (found.length) return found;
    }
  }
  return [];
}

// The names of menus, options, and nodes that must stay in English, in every language. A text that
// mentions one of them in English has to mention it, unchanged, in Japanese too.
const KEPT_NAMES = [
  "Mesh > Normals > Recalculate Outside",
  "Mesh > Normals > Flip",
  "Object > Apply > Scale",
  "Face Orientation",
  "Mesh Display > Reverse",
  "Mesh Display > Conform",
  "Unify normals",
  "Flip normals",
  "Normal modifier",
  "Edit Poly",
  "Data > Mesh",
  "Normal Import Method > Compute Normals",
  "Select > Select All by Trait > Non Manifold",
  "Multiple Faces",
  "Merge by Distance",
  "Mesh > Cleanup",
  "Fuse SOP",
  "Boundaries",
  "Mesh > Clean Up > Fill Holes",
  "Face Fill",
  "Grid Fill",
  "Mesh > Fill Hole",
  "Cap Holes",
  "PolyFill SOP",
  "Mesh > Clean Up > Degenerate Dissolve",
  "Clean SOP",
  "Remove Degenerate Primitives",
  "Remove Repeated Vertices",
  "Remove Degenerates",
  "UV > Unwrap",
  "Smart UV Project",
  "UV Auto Seam SOP",
  "UV Flatten SOP",
  "UV Unwrap SOP",
  "UV Layout SOP",
  "UV > Pack Islands",
  "UV Editor",
  "Decimate modifier",
  "Ratio",
  "Mesh > Reduce",
  "Percentage",
  "ProOptimizer modifier",
  "Vertex %",
  "Static Mesh Editor",
  "Percent Triangles",
  "Scene > Units",
  "Unit Scale 1.0",
  "Preferences > Settings > Working Units",
  "Customize > Units Setup",
  "glTF Binary (.glb)",
];

describe("the rules that have a fix guide", () => {
  it("are all the rules of the report schema, and nothing else", () => {
    expect(rules.length).toBeGreaterThan(10);
    expect(Object.keys(FIX_HINTS).sort()).toEqual([...rules].sort());
  });

  it("only name tools that exist, each at most once, in the fixed order", () => {
    for (const [rule, tools] of Object.entries(FIX_HINTS)) {
      expect(new Set(tools).size, rule).toBe(tools.length);
      const order = tools.map((tool) => TOOLS.indexOf(tool));
      expect(order, rule).toEqual([...order].sort((a, b) => a - b));
      for (const tool of tools) expect(TOOLS, `${rule} ${tool}`).toContain(tool);
    }
  });

  it("have a name for every tool", () => {
    expect(TOOL_NAMES).toEqual({
      blender: "Blender",
      maya: "Maya",
      max: "3ds Max",
      houdini: "Houdini",
      unreal: "Unreal Engine",
    });
  });
});

describe("the texts of the fix guide", () => {
  const locales = ["en", "ja"] as const;

  it("have, for every rule, what it means, why it matters, and how to fix it, in both languages", () => {
    for (const locale of locales) {
      for (const rule of Object.keys(FIX_HINTS)) {
        for (const part of ["meaning", "why", "fix"] as const) {
          const text = catalogs[locale][hintKey(rule, part)];
          expect(text?.trim().length ?? 0, `${locale} ${rule} ${part}`).toBeGreaterThan(10);
        }
      }
    }
  });

  it("have a line for each tool a rule lists, and no line for a tool it does not list", () => {
    for (const locale of locales) {
      for (const [rule, tools] of Object.entries(FIX_HINTS)) {
        for (const tool of TOOLS) {
          const has = Object.hasOwn(catalogs[locale], toolHintKey(rule, tool));
          expect(has, `${locale} ${rule} ${tool}`).toBe(tools.includes(tool as Tool));
        }
      }
    }
  });

  it("have no text that belongs to no rule", () => {
    for (const locale of locales) {
      const known = new Set<string>();
      for (const [rule, tools] of Object.entries(FIX_HINTS)) {
        for (const part of ["meaning", "why", "fix"] as const) known.add(hintKey(rule, part));
        for (const tool of tools) known.add(toolHintKey(rule, tool));
      }
      const orphans = Object.keys(catalogs[locale]).filter(
        (key) => key.startsWith("hint.") && !known.has(key),
      );
      expect(orphans, locale).toEqual([]);
    }
  });

  it("keep the names of menus, options, and nodes unchanged in Japanese", () => {
    let checked = 0;
    for (const [rule, tools] of Object.entries(FIX_HINTS)) {
      for (const tool of tools) {
        const key = toolHintKey(rule, tool);
        const english = FIX_HINT_TEXTS_EN[key] ?? "";
        const japanese = catalogs.ja[key] ?? "";
        for (const name of KEPT_NAMES) {
          if (!english.includes(name)) continue;
          checked += 1;
          expect(japanese, `${key}: ${name}`).toContain(name);
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("name every tool line's menus from the list above, so a new name is not forgotten", () => {
    for (const [rule, tools] of Object.entries(FIX_HINTS)) {
      for (const tool of tools) {
        const english = FIX_HINT_TEXTS_EN[toolHintKey(rule, tool)] ?? "";
        const covered = KEPT_NAMES.some((name) => english.includes(name));
        expect(covered, `${rule} ${tool}`).toBe(true);
      }
    }
  });

  it("do not contain markup or addresses, which would not be shown as such", () => {
    for (const locale of locales) {
      for (const [key, text] of Object.entries(catalogs[locale])) {
        if (!key.startsWith("hint.")) continue;
        expect(text, `${locale} ${key}`).not.toMatch(/[<>]{1}[a-z/]|https?:\/\//i);
      }
    }
  });

  it("keep each line short enough to read in a narrow panel", () => {
    for (const locale of locales) {
      for (const [key, text] of Object.entries(catalogs[locale])) {
        if (key.startsWith("hint."))
          expect(text.length, `${locale} ${key}`).toBeLessThanOrEqual(420);
      }
    }
  });
});
