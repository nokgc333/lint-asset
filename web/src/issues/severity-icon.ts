import type { severityMark } from "./describe";

export function createSeverityIcon(
  shapeName: ReturnType<typeof severityMark>["shape"],
): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.setAttribute("class", "issue-icon");
  const shape = document.createElementNS(
    namespace,
    shapeName === "triangle" ? "polygon" : shapeName === "square" ? "rect" : "circle",
  );
  const attributes: Record<string, string> =
    shapeName === "circle"
      ? { cx: "12", cy: "12", r: "9" }
      : shapeName === "triangle"
        ? { points: "12,2 23,22 1,22" }
        : { x: "3", y: "3", width: "18", height: "18" };
  for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
  icon.append(shape);
  return icon;
}
