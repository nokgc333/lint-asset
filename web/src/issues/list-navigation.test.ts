import { describe, expect, it } from "vitest";
import { nextIndex } from "./list-navigation";

describe("nextIndex", () => {
  it("moves down and up by one with the arrow keys", () => {
    expect(nextIndex(1, "ArrowDown", 5)).toBe(2);
    expect(nextIndex(3, "ArrowUp", 5)).toBe(2);
  });

  it("stops at the ends instead of wrapping around", () => {
    expect(nextIndex(4, "ArrowDown", 5)).toBe(4);
    expect(nextIndex(0, "ArrowUp", 5)).toBe(0);
  });

  it("jumps to the first and last item with Home and End", () => {
    expect(nextIndex(3, "Home", 5)).toBe(0);
    expect(nextIndex(1, "End", 5)).toBe(4);
  });

  it("starts at the first item with Down, and at the last with Up, when nothing is current", () => {
    expect(nextIndex(-1, "ArrowDown", 5)).toBe(0);
    expect(nextIndex(-1, "ArrowUp", 5)).toBe(4);
  });

  it("leaves the position alone for keys it does not handle", () => {
    expect(nextIndex(2, "a", 5)).toBe(2);
    expect(nextIndex(2, "Enter", 5)).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(nextIndex(-1, "ArrowDown", 0)).toBe(-1);
    expect(nextIndex(0, "End", 0)).toBe(-1);
  });

  it("brings a position that is past the end back into the list", () => {
    expect(nextIndex(9, "ArrowUp", 3)).toBe(2);
  });
});
