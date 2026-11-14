export const SEVERITY_COLORS = { error: "#ff6b6b", warning: "#ffb020", info: "#5cb8ff" };
export const PANEL_BACKGROUND = "#18212d";
export const MODEL_COLOR = "#92a8bf";
export const MODEL_COLOR_WITH_ISSUES = "#3d4b5c";
export const TEXT_COLOR = "#f0f4fa";
export const MUTED_TEXT_COLOR = "#bdc9d9";

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const linear = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
