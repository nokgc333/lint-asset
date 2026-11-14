// Checks the built app for accessibility (TC-013, NFR-003): axe on every screen and state, in both
// languages, and a keyboard-only run through the main flow with real key presses.
//
// Usage: npm run build && node scripts/audit-accessibility.mjs
// It serves build/web itself and drives a Chrome that is already installed: set CHROME_PATH, or
// let the script look in the usual places. axe finds what a tool can find; reading the page with a
// screen reader (VoiceOver) is still a manual check.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const axeSource = require("axe-core").source;
const root = resolve(process.argv[2] ?? "build/web");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium executable.");
  process.exit(2);
}
if (!existsSync(join(root, "index.html"))) {
  console.error(`No built app in ${root}. Run npm run build first.`);
  process.exit(2);
}

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
};
const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  const file = join(root, path === "/" ? "index.html" : path);
  if (!file.startsWith(root)) return response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response
      .writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
      .end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox"],
});
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
let failures = 0;
const report = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
};

// Opens the page in a window; the Content-Security-Policy is not in play here (the built page is
// served without the production headers), and axe has to be injected as a script.
async function openPage(locale, width = 1400) {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width, height: 900 });
  await page.evaluateOnNewDocument(
    (value) => localStorage.setItem("lint-asset.locale", value),
    locale,
  );
  await page.goto(base, { waitUntil: "networkidle0" });
  return page;
}

async function runAxe(label, page) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() =>
    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      },
      resultTypes: ["violations"],
    }),
  );
  const detail = result.violations
    .map((v) => {
      const why = v.nodes[0]?.any?.[0] ?? v.nodes[0]?.all?.[0];
      return `${v.id} x${v.nodes.length} ${v.nodes[0]?.target?.join(" ")} (${why?.message ?? v.help} ${JSON.stringify(why?.data ?? "").slice(0, 200)} :: ${v.nodes[0]?.html?.slice(0, 400)})`;
    })
    .join("; ");
  report(result.violations.length === 0, `axe: ${label}`, detail);
}

async function loadTexture(page, selector, name, gray) {
  await page.evaluate(
    async ({ selector, name, gray }) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const context = canvas.getContext("2d");
      const image = context.createImageData(canvas.width, canvas.height);
      for (let at = 0; at < image.data.length; at += 4) {
        const value = (at / 4) % 256;
        image.data.set(gray ? [value, value, value, 255] : [value, 128, 220, 255], at);
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
      const data = new DataTransfer();
      data.items.add(new File([blob], name, { type: "image/png" }));
      const input = document.querySelector(selector);
      input.files = data.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, name, gray },
  );
}

async function auditOrm(page, label) {
  await page.click('input[name="texture-mode"][value="pack"]');
  await loadTexture(page, "#orm-pack-file-0", "stone_ao.png", true);
  await loadTexture(page, "#orm-pack-file-1", "stone_roughness.png", true);
  await page.waitForFunction(
    () =>
      !document.querySelector("#orm-pack-download").disabled &&
      document.querySelector("#orm-pack-defaults").children.length === 1,
  );
  await runAxe(`${label} ORM pack with two gray inputs and a default`, page);
  await loadTexture(page, "#orm-pack-file-2", "stone_metallic.png", false);
  await page.waitForFunction(
    () =>
      !document.querySelector("#orm-pack-download").disabled &&
      document.querySelector("#orm-pack-warnings").children.length > 0,
  );
  await runAxe(`${label} ORM pack with a non-gray warning`, page);
  await page.click('input[name="texture-mode"][value="unpack"]');
  await loadTexture(page, "#orm-unpack-file-0", "stone_orm.png", false);
  await page.waitForFunction(() => !document.querySelector("#orm-unpack-all").disabled);
  await runAxe(`${label} ORM unpack with three results`, page);
}

async function auditFilters(page, locale) {
  for (const width of [1400, 320]) {
    await page.setViewport({ width, height: 900 });
    await page.click("#issues-warning");
    await page.click("#issues-info");
    report(
      await page.$$eval(
        "#issues-list button",
        (rows) => rows.length > 0 && rows.every((row) => row.classList.contains("severity-error")),
      ),
      `[${locale}] ${width} px, errors only`,
    );
    await runAxe(`[${locale}] ${width} px, errors only`, page);
    await page.click("#issues-clear");
    await page.select("#issues-rule", "mesh.boundary_edge");
    await runAxe(`[${locale}] ${width} px, a chosen rule`, page);
    await page.click("#issues-warning");
    report(
      await page.$eval("#issues-none", (element) => !element.hidden),
      `[${locale}] ${width} px, empty filter state`,
    );
    await runAxe(`[${locale}] ${width} px, no matching problems`, page);
    await page.click("#issues-none-clear");
    await page.select("#issues-sort", "triangles");
    await runAxe(`[${locale}] ${width} px, sorted by triangles`, page);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      above:
        document.querySelector("#issues-filters").getBoundingClientRect().bottom <=
        document.querySelector("#issues-list-region").getBoundingClientRect().top,
    }));
    report(
      layout.overflow <= 0 && layout.above,
      `[${locale}] ${width} px, filter controls above the list without overflow`,
    );
    await page.select("#issues-sort", "report");
  }
}

async function keyboardFilters(page, label) {
  const activeId = () => page.evaluate(() => document.activeElement?.id);
  async function tabTo(id) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await page.keyboard.press("Tab");
      if ((await activeId()) === id) return true;
    }
    return false;
  }
  const count = () => page.$$eval("#issues-list button", (rows) => rows.length);
  const total = await count();
  await page.focus("#export-markdown");
  report(await tabTo("issues-error"), `${label}: Tab reaches the error checkbox`);
  report(await tabTo("issues-warning"), `${label}: Tab reaches the warning checkbox`);
  await page.keyboard.press("Space");
  report(
    (await count()) < total && (await activeId()) === "issues-warning",
    `${label}: Space filters the list and retains focus`,
  );
  report(await tabTo("issues-info"), `${label}: Tab reaches the info checkbox`);
  report(await tabTo("issues-rule"), `${label}: Tab reaches the rule select`);
  // A native select is operated with the keys of the platform (on macOS the arrow keys open its
  // list, elsewhere they change it), so the check is what the page does with the choice.
  await page.select(
    "#issues-rule",
    await page.$eval("#issues-rule option:nth-child(2)", (option) => option.value),
  );
  report(
    (await page.$eval("#issues-rule", (select) => select.value !== "all")) &&
      (await count()) < total,
    `${label}: choosing a rule filters the list`,
  );
  report(await tabTo("issues-sort"), `${label}: Tab reaches the sort select`);
  await page.select("#issues-sort", "severity");
  report(
    await page.$eval("#issues-sort", (select) => select.value === "severity"),
    `${label}: choosing a sort order is accepted`,
  );
  report(await tabTo("issues-clear"), `${label}: Tab reaches Clear filters`);
  await page.keyboard.press("Enter");
  report(
    (await count()) === total && (await activeId()) === "issues-error",
    `${label}: Clear filters restores every row and focuses the first checkbox`,
  );
  await page.select("#issues-sort", "report");
}

for (const locale of ["en", "ja"]) {
  const page = await openPage(locale);
  await page.waitForFunction(() => !document.querySelector("#controls").disabled, {
    timeout: 20000,
  });
  await runAxe(`[${locale}] first screen`, page);
  await page.click("#sample-button");
  await page.waitForFunction(
    () => /toy-house/.test(document.querySelector("#status").textContent),
    { timeout: 20000 },
  );
  await wait(500);
  await runAxe(`[${locale}] sample loaded, problems hidden`, page);
  await page.evaluate(() => {
    const toggle = document.querySelector("#issues-toggle");
    if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
  });
  await wait(300);
  await runAxe(`[${locale}] problems shown`, page);
  await page.evaluate(() => document.querySelectorAll("#issues-list button")[2]?.click());
  await wait(500);
  await page.waitForFunction(() => !document.querySelector("#issue-detail-content").hidden);
  for (const width of [1400, 1100, 320]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => {
      for (const guide of document.querySelectorAll("#issue-detail details")) guide.open = false;
    });
    await runAxe(`[${locale}] ${width} px, a problem selected with details`, page);
    const layout = await page.evaluate(() => {
      const list = document.querySelector("#issues-panel").getBoundingClientRect();
      const detail = document.querySelector("#issue-detail").getBoundingClientRect();
      return {
        right: detail.left >= list.right,
        below: detail.top >= list.bottom && Math.abs(detail.left - list.left) <= 1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (width === 1400)
      report(layout.right, `[${locale}] details are in the third column at 1400 px`);
    if (width === 1100) report(layout.below, `[${locale}] details are under the list at 1100 px`);
    report(
      layout.overflow <= 0,
      `[${locale}] selected details at ${width} px without sideways scrolling`,
      `${layout.overflow} px too wide`,
    );
    const guideOpened = await page.evaluate(() => {
      const guide = document.querySelector("#issue-detail details");
      if (!guide) return false;
      guide.open = true;
      return true;
    });
    report(guideOpened, `[${locale}] ${width} px, a tool guide is available`);
    await runAxe(`[${locale}] ${width} px, selected details with a tool guide open`, page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    report(
      overflow <= 0,
      `[${locale}] open tool guide at ${width} px without sideways scrolling`,
      `${overflow} px too wide`,
    );
  }
  await auditFilters(page, locale);
  for (const width of [1400, 320]) {
    await page.setViewport({ width, height: 900 });
    await keyboardFilters(page, `[${locale}] ${width} px keyboard`);
  }
  await page.setViewport({ width: 1400, height: 900 });

  await page.click("#about-open");
  await wait(300);
  await runAxe(`[${locale}] About dialog`, page);
  await page.click("#about-close");
  await page.click("#settings-open");
  await wait(300);
  await runAxe(`[${locale}] Settings dialog`, page);
  await page.evaluate(() => {
    document.querySelector("#settings-max-triangles").value = "x";
    document.querySelector("#settings-max-extent").value = "0";
  });
  await page.click("#settings-save");
  await wait(300);
  await runAxe(`[${locale}] Settings dialog with errors`, page);
  await page.click("#settings-cancel");

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(16)], "bad.glb"));
    const input = document.querySelector("#file");
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(1200);
  await runAxe(`[${locale}] error message`, page);

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(105 * 1024 * 1024)], "big.glb"));
    const input = document.querySelector("#file");
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(1500);
  await runAxe(`[${locale}] large-file dialog`, page);
  await page.click("#limit-cancel");

  await page.click("#screen-texture-button");
  await wait(300);
  await runAxe(`[${locale}] texture screen`, page);
  await page.evaluate(async () => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const at = (y * size + x) * 4;
        image.data.set([x * 2, y * 2, 220, x < 20 ? 128 : 255], at);
      }
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
    const data = new DataTransfer();
    data.items.add(new File([blob], "n.png"));
    const input = document.querySelector("#texture-file");
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(1500);
  await runAxe(`[${locale}] texture screen with a result and a warning`, page);
  await auditOrm(page, `[${locale}]`);
  await page.close();
}

{
  // A narrow window: the app must work, and the page must not scroll sideways (reflow, WCAG 1.4.10).
  for (const width of [720, 320]) {
    const page = await openPage("en", width);
    await page.waitForFunction(() => !document.querySelector("#controls").disabled, {
      timeout: 20000,
    });
    await page.click("#sample-button");
    await page.waitForFunction(
      () => /toy-house/.test(document.querySelector("#status").textContent),
      { timeout: 20000 },
    );
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    report(
      sideways <= 0,
      `a ${width} px window works without scrolling sideways`,
      `${sideways} px too wide`,
    );
    await runAxe(`${width} px window`, page);
    await page.click("#screen-texture-button");
    await auditOrm(page, `${width} px window`);
    for (const mode of ["pack", "unpack"]) {
      await page.click(`input[name="texture-mode"][value="${mode}"]`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      report(
        overflow <= 0,
        `ORM ${mode}: ${width} px without sideways scrolling`,
        `${overflow} px too wide`,
      );
    }
    await page.close();
  }
  // A touch-only device sees the guide, which must have a main landmark and one heading.
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: "networkidle0" });
  const guideShown = await page.evaluate(() => !document.querySelector("#unsupported").hidden);
  report(guideShown, "a phone gets the unsupported-device guide");
  await runAxe("the unsupported-device guide", page);
  await page.close();
}

// Keyboard only, with real key presses.
{
  const page = await openPage("en");
  await page.waitForFunction(() => !document.querySelector("#controls").disabled, {
    timeout: 20000,
  });
  const focus = () =>
    page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return { none: true };
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const x = Math.min(Math.max(box.left + box.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(box.top + box.height / 2, 0), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      return {
        name:
          element.getAttribute("aria-label") ||
          element.textContent.trim().slice(0, 30) ||
          element.id,
        indicator:
          (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none",
        covered: !(top === element || element.contains(top) || top?.contains(element)),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    });
  await page.focus("body");
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press("Tab");
    if ((await page.evaluate(() => document.activeElement?.id)) === "sample-button") break;
  }
  report(
    (await page.evaluate(() => document.activeElement?.id)) === "sample-button",
    "keyboard: Tab reaches the sample button",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => /toy-house/.test(document.querySelector("#status").textContent),
    { timeout: 20000 },
  );
  await wait(500);
  await page.evaluate(() => {
    document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const stops = [];
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    await wait(20);
    const stop = await focus();
    if (!stop.none) stops.push(stop);
    if (stops.length > 5 && stops.slice(0, -1).some((s) => s.name === stop.name)) break;
  }
  report(
    stops.every((s) => s.indicator),
    `keyboard: all ${stops.length} tab stops show where the focus is`,
  );
  report(
    stops.every((s) => !s.covered),
    "keyboard: no tab stop is covered by another element",
  );
  report(
    stops.every((s) => s.width >= 24 && s.height >= 24),
    "keyboard: every tab stop is at least 24 x 24 px",
  );

  await page.evaluate(() => {
    if (document.querySelector("#issues-toggle").getAttribute("aria-expanded") !== "true")
      document.querySelector("#issues-toggle").click();
  });
  await wait(200);
  const isRow = (index) =>
    page.evaluate(
      (i) =>
        document.querySelectorAll("#issues-list button")[
          i === -1 ? document.querySelectorAll("#issues-list button").length - 1 : i
        ] === document.activeElement,
      index,
    );
  await page.focus("#issues-list li:first-child button");
  await page.keyboard.press("ArrowDown");
  report(await isRow(1), "keyboard: ArrowDown moves to the next problem");
  await page.keyboard.press("End");
  report(await isRow(-1), "keyboard: End moves to the last problem");
  await page.keyboard.press("Home");
  report(await isRow(0), "keyboard: Home moves to the first problem");
  await page.keyboard.press("Enter");
  await wait(300);
  report(
    await page.evaluate(
      () =>
        document.querySelectorAll("#issues-list button")[0].getAttribute("aria-current") === "true",
    ),
    "keyboard: Enter selects a problem",
  );
  await page.keyboard.press("Escape");
  await wait(200);
  report(
    await page.evaluate(() => !document.querySelector('#issues-list [aria-current="true"]')),
    "keyboard: Escape clears the selection",
  );
  report(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("#issues-list button")].filter((b) => b.tabIndex === 0)
          .length === 1,
    ),
    "keyboard: only one problem is a tab stop",
  );

  const shot = async () =>
    page.screenshot({ clip: await (await page.$("#viewer")).boundingBox(), encoding: "base64" });
  await page.focus("#viewer");
  await wait(300);
  const before = await shot();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowRight");
  await wait(600);
  report(before !== (await shot()), "keyboard: the arrow keys rotate the 3D view");

  for (const [opener, dialog, name] of [
    ["#about-open", "#about-dialog", "About"],
    ["#settings-open", "#settings-dialog", "Settings"],
  ]) {
    await page.focus(opener);
    await page.keyboard.press("Enter");
    await wait(300);
    const inside = () =>
      page.evaluate((d) => document.querySelector(d).contains(document.activeElement), dialog);
    report(
      (await page.evaluate((d) => document.querySelector(d).open, dialog)) && (await inside()),
      `keyboard: ${name} opens with Enter and takes the focus`,
    );
    let trapped = true;
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      // Focus may leave the page for the browser's own controls (the body), never to the page behind.
      if (
        !(await page.evaluate(
          (d) =>
            document.activeElement === document.body ||
            document.querySelector(d).contains(document.activeElement),
          dialog,
        ))
      )
        trapped = false;
    }
    report(trapped, `keyboard: Tab never reaches the page behind the ${name} dialog`);
    await page.keyboard.press("Escape");
    await wait(300);
    report(
      await page.evaluate(
        (d, o) =>
          !document.querySelector(d).open && document.activeElement === document.querySelector(o),
        dialog,
        opener,
      ),
      `keyboard: Escape closes the ${name} dialog and returns the focus`,
    );
  }
  await page.focus("#screen-texture-button");
  await page.keyboard.press("Enter");
  await wait(300);
  report(
    await page.evaluate(
      () =>
        !document.querySelector("#screen-texture").hidden &&
        document.querySelector("#screen-texture-button").getAttribute("aria-current") === "page",
    ),
    "keyboard: the Texture screen opens with Enter",
  );
  await page.close();
}

await browser.close();
server.close();
console.log(
  failures === 0
    ? "\nNo accessibility problems found by this script."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
