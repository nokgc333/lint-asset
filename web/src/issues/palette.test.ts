/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEVERITIES } from "./describe";
import {
  contrastRatio,
  hexToRgb,
  MODEL_COLOR,
  MODEL_COLOR_WITH_ISSUES,
  MUTED_TEXT_COLOR,
  PANEL_BACKGROUND,
  SEVERITY_COLORS,
  TEXT_COLOR,
} from "./palette";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for the same colour", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 9);
  });

  it("does not depend on which colour comes first", () => {
    expect(contrastRatio("#ff6b6b", "#18212d")).toBeCloseTo(contrastRatio("#18212d", "#ff6b6b"), 9);
  });
});

describe("hexToRgb", () => {
  it("gives red, green, and blue as numbers from 0 to 1", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
  });
});

describe("the severity colours", () => {
  it("meet the 3:1 contrast for interface parts on the panel (§7.8)", () => {
    for (const severity of SEVERITIES) {
      expect(
        contrastRatio(SEVERITY_COLORS[severity], PANEL_BACKGROUND),
        severity,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("stand out, at 3:1, from the dimmed model they are drawn on", () => {
    for (const severity of SEVERITIES) {
      expect(
        contrastRatio(SEVERITY_COLORS[severity], MODEL_COLOR_WITH_ISSUES),
        severity,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("differ from each other in lightness as well as in hue", () => {
    const [error, warning, info] = SEVERITIES.map((severity) => SEVERITY_COLORS[severity]) as [
      string,
      string,
      string,
    ];
    expect(contrastRatio(error, warning)).toBeGreaterThanOrEqual(1.15);
    expect(contrastRatio(error, info)).toBeGreaterThanOrEqual(1.15);
    expect(contrastRatio(warning, info)).toBeGreaterThanOrEqual(1.15);
  });

  it("is darker model colour when problems are shown than when they are not", () => {
    expect(contrastRatio(MODEL_COLOR_WITH_ISSUES, PANEL_BACKGROUND)).toBeLessThan(
      contrastRatio(MODEL_COLOR, PANEL_BACKGROUND),
    );
  });
});

describe("the text colours", () => {
  it("meet the 4.5:1 contrast for text on the panel (§7.8)", () => {
    expect(contrastRatio(TEXT_COLOR, PANEL_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(MUTED_TEXT_COLOR, PANEL_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the style sheet", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

  it("defines the same colours as the palette, so the list and the 3D view agree", () => {
    for (const severity of SEVERITIES) {
      expect(css.toLowerCase()).toContain(`--severity-${severity}: ${SEVERITY_COLORS[severity]};`);
    }
    expect(css.toLowerCase()).toContain(`--panel-background: ${PANEL_BACKGROUND};`);
  });
});
