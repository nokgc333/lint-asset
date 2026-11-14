import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogs } from "../i18n/catalog";

// TC-020: the links to the repository, About, and donation.
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

function elementWith(attribute: string): string {
  const match = html.match(new RegExp(`<[^>]*${attribute}[^>]*>`));
  if (!match) throw new Error(`No element with ${attribute}`);
  return match[0];
}

describe("the footer and the About dialog in index.html", () => {
  it("has a footer with the repository link, the About button, and a donation link", () => {
    expect(html).toContain("<footer");
    expect(elementWith('data-link="github"')).toContain("<a ");
    expect(elementWith('data-link="donate"')).toContain("<a ");
    expect(html).toMatch(/<button[^>]*id="about-open"/);
  });

  it("starts with the donation link hidden, so it never shows without an address", () => {
    expect(elementWith('data-link="donate"')).toMatch(/\bhidden\b/);
  });

  it("has an About dialog with a close button, the notices link, and the license link", () => {
    expect(html).toMatch(/<dialog[^>]*id="about-dialog"/);
    expect(html).toMatch(/<button[^>]*id="about-close"/);
    expect(html).toContain('data-link="notices"');
    expect(html).toContain('data-link="license"');
  });

  it("states what the tool sends, with a date, in the privacy section", () => {
    expect(html).toMatch(/id="about-privacy"/);
    expect(html).toMatch(/id="about-privacy-date"/);
  });

  it("has a catalog text, in English and Japanese, for every data-i18n key of the About parts", () => {
    const keys = [...html.matchAll(/data-i18n="((?:about|footer)\.[^"]+)"/g)].map(
      (m) => m[1] as string,
    );
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) {
      expect(catalogs.en[key], `en:${key}`).toBeTypeOf("string");
      expect(catalogs.ja[key], `ja:${key}`).toBeTypeOf("string");
    }
  });

  it("never links to the donation page with a fixed address in the HTML", () => {
    expect(html).not.toMatch(/sponsors\//);
  });
});
