import { describe, expect, it } from "vitest";
import { formatLoadError, messageFor } from "./messages";

const CODES = ["E-LOAD-001", "E-LOAD-002", "E-LOAD-003", "E-LOAD-004"] as const;

describe("messageFor", () => {
  it("gives a cause and a next action for every load error code", () => {
    for (const code of CODES) {
      const message = messageFor(code);
      expect(message.cause.length, code).toBeGreaterThan(10);
      expect(message.action.length, code).toBeGreaterThan(10);
    }
  });

  it("describes each code differently", () => {
    const causes = new Set(CODES.map((code) => messageFor(code).cause));
    expect(causes.size).toBe(CODES.length);
  });

  it("names what went wrong in words a user can act on", () => {
    expect(messageFor("E-LOAD-001").cause).toMatch(/GLB/);
    expect(messageFor("E-LOAD-002").cause).toMatch(/damaged|corrupt/i);
    expect(messageFor("E-LOAD-003").cause).toMatch(/limit/i);
    expect(messageFor("E-LOAD-004").cause).toMatch(/extension/i);
  });

  it("falls back to a general message for an unknown code", () => {
    const message = messageFor("E-LOAD-999");
    expect(message.cause.length).toBeGreaterThan(10);
    expect(message.action.length).toBeGreaterThan(10);
  });
});

describe("formatLoadError", () => {
  it("starts with the code and includes the cause, the next action, and the technical detail", () => {
    const text = formatLoadError("E-LOAD-002", "GLB total length does not match data size");
    expect(text.startsWith("E-LOAD-002: ")).toBe(true);
    expect(text).toContain(messageFor("E-LOAD-002").cause);
    expect(text).toContain(messageFor("E-LOAD-002").action);
    expect(text).toContain("GLB total length does not match data size");
  });

  it("works without a detail", () => {
    const text = formatLoadError("E-LOAD-003", "");
    expect(text.startsWith("E-LOAD-003: ")).toBe(true);
    expect(text).not.toContain("()");
  });

  it("keeps the code even when it is unknown", () => {
    expect(formatLoadError("E-LOAD-999", "x").startsWith("E-LOAD-999: ")).toBe(true);
  });
});
