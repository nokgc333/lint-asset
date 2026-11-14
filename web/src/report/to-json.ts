import type { Report } from "./build-report";

export function reportToJson(report: Report): string {
  return `${JSON.stringify(report, null, 2).replace(
    /"(?:\\.|[^"\\])*"|\[\s*(?:-?\d+\s*(?:,\s*-?\d+\s*)*)?\]/g,
    (value) =>
      value.startsWith("[")
        ? `[${value
            .slice(1, -1)
            .trim()
            .split(/\s*,\s*/)
            .join(", ")}]`
        : value,
  )}\n`;
}
