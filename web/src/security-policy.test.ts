import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPOSITORY_URL } from "./about/links";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");

const securityTxt = read("../public/.well-known/security.txt");
const policy = read("../../SECURITY.md");
const REPORT_URL = `${REPOSITORY_URL}/security/advisories/new`;
const DAY_MS = 24 * 60 * 60 * 1000;
const RENEW_BEFORE_DAYS = 30;

function field(name: string): string[] {
  return securityTxt
    .split("\n")
    .filter((line) => line.startsWith(`${name}:`))
    .map((line) => line.slice(name.length + 1).trim());
}

describe("security.txt (RFC 9116)", () => {
  it("has a Contact that is the private report page, and no email address", () => {
    expect(field("Contact")).toEqual([REPORT_URL]);
    expect(securityTxt).not.toMatch(/mailto:|@/);
  });

  it("points to the policy in the repository", () => {
    expect(field("Policy")).toEqual([`${REPOSITORY_URL}/blob/main/SECURITY.md`]);
  });

  it("has exactly one Expires, as an ISO 8601 time with a time zone", () => {
    const [expires, ...rest] = field("Expires");
    expect(rest).toEqual([]);
    expect(expires).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(Number.isNaN(Date.parse(expires ?? ""))).toBe(false);
  });

  it(`is renewed at least ${RENEW_BEFORE_DAYS} days before it expires, and is at most a year ahead`, () => {
    const expires = Date.parse(field("Expires")[0] ?? "");
    const remaining = (expires - Date.now()) / DAY_MS;
    // When this fails, set a new Expires (RFC 9116 asks for less than a year ahead).
    expect(remaining).toBeGreaterThan(RENEW_BEFORE_DAYS);
    expect(remaining).toBeLessThanOrEqual(366);
  });

  it("lists the languages the reports can be written in", () => {
    expect(field("Preferred-Languages")).toEqual(["en, ja"]);
  });
});

describe("SECURITY.md", () => {
  it("names the same private report page, and no email address", () => {
    expect(policy).toContain(REPORT_URL);
    expect(policy).not.toMatch(/mailto:|[\w.-]+@[\w.-]+\.\w+/);
  });

  it("has the sections a reporter looks for", () => {
    for (const heading of [
      "## Reporting a vulnerability",
      "## What to expect",
      "## Supported versions",
      "## What is in scope",
      "## What is out of scope",
    ]) {
      expect(policy).toContain(heading);
    }
  });

  it("promises only a goal of 7 days for the first reply, not a fix date", () => {
    expect(policy).toMatch(/aim to reply within 7 days/);
    expect(policy).toMatch(/will not promise a deadline/);
  });
});
