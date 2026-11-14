/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localizeIssueMessage } from "../issues/localize";

const GOLDEN = new URL("../../../tests/golden/", import.meta.url);
const JAPANESE = /[぀-ヿ㐀-鿿]/;

interface GoldenIssue {
  rule: string;
  message: string;
}

const issues: GoldenIssue[] = readdirSync(GOLDEN)
  .filter((name) => name.endsWith(".json"))
  .flatMap((name) => JSON.parse(readFileSync(new URL(name, GOLDEN), "utf8")) as GoldenIssue[]);

describe("localizeIssueMessage over the golden results (every message the checks can write)", () => {
  it("finds a good number of messages to try", () => {
    expect(issues.length).toBeGreaterThan(20);
  });

  it("translates every one of them to Japanese", () => {
    for (const issue of issues) {
      const japanese = localizeIssueMessage(issue.rule, issue.message, "ja");
      expect(japanese, issue.message).not.toBe(issue.message);
      expect(JAPANESE.test(japanese), issue.message).toBe(true);
    }
  });

  it("keeps every number of the English message in the Japanese one", () => {
    for (const issue of issues) {
      const japanese = localizeIssueMessage(issue.rule, issue.message, "ja");
      for (const number of issue.message.match(/\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []) {
        expect(japanese, `${issue.message} -> ${japanese}`).toContain(number);
      }
    }
  });

  it("returns the English message unchanged for English", () => {
    for (const issue of issues) {
      expect(localizeIssueMessage(issue.rule, issue.message, "en")).toBe(issue.message);
    }
  });
});
