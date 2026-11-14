import { expect, it } from "vitest";
import { describeLimitRequest } from "./limit-text";
import { DEFAULT_MAX_PIXELS, RAISED_MAX_PIXELS } from "./texture/texture-plan";

it("describes pixel confirmation in both languages with the default and raised limits", () => {
  for (const locale of ["en", "ja"] as const) {
    const text = describeLimitRequest(
      {
        reason: "pixels",
        fileName: "<normal>.png",
        width: 8193,
        height: 8192,
        maxPixels: RAISED_MAX_PIXELS,
      },
      locale,
    );
    expect(text).toContain("<normal>.png");
    expect(text).toContain("8193 × 8192");
    const numbers = new Intl.NumberFormat(locale);
    expect(text).toContain(numbers.format(DEFAULT_MAX_PIXELS));
    expect(text).toContain(numbers.format(RAISED_MAX_PIXELS));
    expect(text).not.toMatch(/\{\w+\}/);
  }
});
