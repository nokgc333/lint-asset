import "./style.css";
import { describeProblem, detectCapabilities, findProblems } from "./environment";
import { applyDocument, applyStaticTranslations } from "./i18n/apply";
import { LOCALES } from "./i18n/locale";
import { createLocaleController, type StorageLike } from "./i18n/locale-controller";
import { createTranslator } from "./i18n/translate";

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element;
}

let storage: StorageLike | null = null;
try {
  storage = window.localStorage;
} catch {}
const controller = createLocaleController({
  storage,
  languages: navigator.languages?.length ? navigator.languages : [navigator.language],
});
function translatePage(): void {
  const translator = createTranslator(controller.locale);
  applyDocument(document, translator);
  applyStaticTranslations(document, translator);
  for (const locale of LOCALES)
    required(`language-${locale}`).setAttribute(
      "aria-pressed",
      String(controller.locale === locale),
    );
}
for (const locale of LOCALES)
  required(`language-${locale}`).addEventListener("click", () => controller.set(locale));
translatePage();
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
    const { cause, action } = describeProblem(problem, controller.locale);
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
    startApp(controller);
  } finally {
    starting = false;
  }
}

controller.subscribe(() => {
  translatePage();
  void update();
});
window.addEventListener("resize", () => {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    void update();
  });
});
void update();

for (const screen of ["inspect", "texture"] as const) {
  required(`screen-${screen}-button`).addEventListener("click", () => {
    for (const name of ["inspect", "texture"] as const) {
      required(`screen-${name}`).hidden = name !== screen;
      const button = required(`screen-${name}-button`);
      if (name === screen) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    if (screen === "inspect")
      requestAnimationFrame(() => document.dispatchEvent(new Event("screen-inspect-shown")));
  });
}
