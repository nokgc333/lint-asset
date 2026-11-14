import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The production headers (§12.6, §12.7). They are plain text that the host applies, so the only
// way to keep them right is to read the file the same way the host does.
const headersText = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("./trusted-worker.ts", import.meta.url), "utf8");
const wranglerText = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

interface Rule {
  path: string;
  headers: Map<string, string>;
}

// The format of a _headers file: a path line, then indented "Name: value" lines. Lines that start
// with # are comments.
function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: new Map() });
      continue;
    }
    const rule = rules.at(-1);
    const colon = line.indexOf(":");
    if (!rule || colon < 0) throw new Error(`Header line without a rule or a colon: ${line}`);
    rule.headers.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return rules;
}

const rules = parseHeaders(headersText);
const everything = rules.find((rule) => rule.path === "/*");
const assets = rules.find((rule) => rule.path === "/assets/*");

function directives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

describe("the host's limits on a _headers file", () => {
  it("has at most 100 rules and 2000 characters on a line", () => {
    expect(rules.length).toBeLessThanOrEqual(100);
    for (const line of headersText.split("\n")) expect(line.length).toBeLessThanOrEqual(2000);
  });

  it("has a rule for every page and file, and one for the hashed files", () => {
    expect(everything).toBeDefined();
    expect(assets).toBeDefined();
  });

  it("sets Cache-Control in only one rule, because a header set twice is joined with a comma", () => {
    const withCache = rules.filter((rule) => rule.headers.has("Cache-Control"));
    expect(withCache.map((rule) => rule.path)).toEqual(["/assets/*"]);
  });
});

describe("the security headers for every response (§12.7)", () => {
  it("has the transport, sniffing, referrer, permission, and isolation headers", () => {
    const headers = everything?.headers;
    expect(headers?.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(headers?.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers?.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers?.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(headers?.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers?.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
  });

  it("lets the hashed files be cached for a year and never changed", () => {
    expect(assets?.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });
});

describe("the Content-Security-Policy (§12.6)", () => {
  const policy = directives(everything?.headers.get("Content-Security-Policy") ?? "");

  it("allows only this site by default", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
    expect(policy.get("style-src")).toEqual(["'self'"]);
  });

  it("allows scripts from this site and the WebAssembly compiler, and nothing else", () => {
    expect(policy.get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it("allows workers from this site and blob:, images from this site, blob:, and data:", () => {
    expect(policy.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(policy.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
  });

  it("forbids framing, forms, and a changed base address", () => {
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
  });

  it("never allows inline code, eval, or an address on another site", () => {
    for (const [name, sources] of policy) {
      for (const source of sources) {
        // 'wasm-unsafe-eval' only allows compiling WebAssembly; it does not allow eval.
        expect(source, `${name} ${source}`).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*/);
        expect(source, `${name} ${source}`).not.toMatch(/^https?:/i);
      }
    }
    expect(policy.has("script-src-elem")).toBe(false);
  });

  it("requires Trusted Types, and names the one policy the page creates", () => {
    expect(policy.get("require-trusted-types-for")).toEqual(["'script'"]);
    const created = [...workerSource.matchAll(/WORKER_POLICY_NAME\s*=\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(created).toHaveLength(1);
    expect(policy.get("trusted-types")).toEqual(created);
  });
});

describe("wrangler.jsonc", () => {
  // The file may hold // comments; take them out to read it as JSON.
  const config = JSON.parse(
    wranglerText
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n"),
  ) as {
    name: string;
    compatibility_date: string;
    main?: string;
    assets: { directory: string; run_worker_first?: boolean };
  };

  it("serves the built web app and nothing else", () => {
    expect(config.assets.directory).toBe("./build/web");
    expect(config.main).toBeUndefined();
    expect(config.assets.run_worker_first).toBeUndefined();
  });

  it("has a name and a compatibility date", () => {
    expect(config.name).toBe("lint-asset");
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
