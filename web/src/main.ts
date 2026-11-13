import "./style.css";
import { describeProblem, detectCapabilities, findProblems } from "./environment";

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element;
}

const app = required("app");
const unsupported = required("unsupported");
const list = required("unsupported-list");
const capabilities = detectCapabilities(window);
let started = false;
let starting = false;
let resizePending = false;

async function update(): Promise<void> {
  const problems = findProblems(capabilities, window.innerWidth);
  list.textContent = "";
  for (const problem of problems) {
    const { cause, action } = describeProblem(problem);
    const item = document.createElement("li");
    item.textContent = `${cause} ${action}`;
    list.append(item);
  }
  unsupported.hidden = problems.length === 0;
  app.hidden = problems.length > 0;
  if (problems.length > 0 || started || starting) return;
  starting = true;
  try {
    const { startApp } = await import("./app");
    if (findProblems(capabilities, window.innerWidth).length > 0) return;
    started = true;
    startApp();
  } finally {
    starting = false;
  }
}

window.addEventListener("resize", () => {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    void update();
  });
});
void update();
