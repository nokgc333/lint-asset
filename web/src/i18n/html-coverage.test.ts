/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogs } from "./catalog";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

const textKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1] as string);
const attributeKeys = [...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((match) =>
  (match[1] as string)
    .split(";")
    .map((pair) => pair.split(":")[1]?.trim())
    .filter((key): key is string => Boolean(key)),
);
const usedKeys = new Set([...textKeys, ...attributeKeys]);

describe("index.html is ready to be translated", () => {
  it("only uses keys that exist in the English and the Japanese catalog", () => {
    for (const key of usedKeys) {
      expect(catalogs.en[key] ?? catalogs.en[`${key}.other`], `en:${key}`).toBeTypeOf("string");
      expect(catalogs.ja[key] ?? catalogs.ja[`${key}.other`], `ja:${key}`).toBeTypeOf("string");
    }
  });

  it("marks every label of the page, the controls, the viewer, the dialog, the export, and the guide", () => {
    const required = [
      "app.heading",
      "app.engineVersion",
      "controls.model",
      "controls.open",
      "controls.view",
      "controls.rotateLeft",
      "controls.rotateRight",
      "controls.rotateUp",
      "controls.rotateDown",
      "controls.zoomIn",
      "controls.zoomOut",
      "controls.panLeft",
      "controls.panRight",
      "controls.panUp",
      "controls.panDown",
      "controls.reset",
      "controls.wireframe",
      "controls.normals",
      "viewer.instructions",
      "viewer.dropHint",
      "viewer.label",
      "panel.title",
      "export.json",
      "export.markdown",
      "export.note",
      "dialog.title",
      "dialog.continue",
      "dialog.cancel",
      "environment.title",
      "environment.guide",
      "environment.supported",
    ];

    for (const key of required) {
      expect(usedKeys.has(key), key).toBe(true);
    }
  });

  it("has two language buttons whose names are in their own language and that are not translated", () => {
    expect(html).toMatch(/lang="en"[^>]*>\s*English\s*</);
    expect(html).toMatch(/lang="ja"[^>]*>\s*日本語\s*</);
  });
});
