import { describe, expect, it } from "vitest";
import { cameraPosition, focusOnBounds, type OrbitState, zoom } from "./camera";

// A model with radius 100, seen from yaw 1 and pitch 0.3, with its target at the origin.
const state: OrbitState = Object.freeze({
  target: [0, 0, 0] as const,
  yaw: 1,
  pitch: 0.3,
  distance: 300,
  radius: 100,
});
const FOV = 50;

describe("focusOnBounds", () => {
  const box = { min: [10, 20, 30] as const, max: [14, 20, 30] as const };

  it("looks at the center of the box and keeps the viewing direction", () => {
    const focused = focusOnBounds(state, box, FOV);

    expect(focused.target).toEqual([12, 20, 30]);
    expect(focused.yaw).toBe(1);
    expect(focused.pitch).toBe(0.3);
  });

  it("backs off just far enough to see the whole box", () => {
    const focused = focusOnBounds(state, box, FOV);
    const boxRadius = 2; // half of the 4-unit diagonal
    const minimum = boxRadius / Math.sin((FOV / 2) * (Math.PI / 180));

    expect(focused.distance).toBeGreaterThanOrEqual(minimum);
    expect(focused.distance).toBeLessThan(minimum * 2);
  });

  it("keeps the radius of the model, so the zoom limits stay the same for the whole model", () => {
    expect(focusOnBounds(state, box, FOV).radius).toBe(100);
  });

  it("moves the camera to the same side of the target as before", () => {
    const focused = focusOnBounds(state, box, FOV);
    const [x, , z] = cameraPosition(focused);

    expect(Math.sign(x - 12)).toBe(Math.sign(Math.sin(1)));
    expect(Math.sign(z - 30)).toBe(Math.sign(Math.cos(1)));
  });

  it("allows a close view of a small part of a big model, and zooming does not jump away from it", () => {
    const focused = focusOnBounds(state, box, FOV);

    expect(focused.distance).toBeLessThan(100 * 0.1); // closer than the usual minimum
    expect(zoom(focused, 1).distance).toBeCloseTo(focused.distance, 9);
    expect(zoom(focused, 0.9).distance).toBeCloseTo(focused.distance * 0.9, 9);
  });

  it("still lets the user zoom out to see the whole model", () => {
    const focused = focusOnBounds(state, box, FOV);

    expect(zoom(focused, 1e9).distance).toBeCloseTo(100 * 50, 6);
  });

  it("gives a usable view for a box with no size", () => {
    const point = { min: [3, 3, 3] as const, max: [3, 3, 3] as const };
    const focused = focusOnBounds(state, point, FOV);

    expect(focused.target).toEqual([3, 3, 3]);
    expect(Number.isFinite(focused.distance)).toBe(true);
    expect(focused.distance).toBeGreaterThan(0);
  });

  it("does not change the input", () => {
    focusOnBounds(state, box, FOV);

    expect(state.target).toEqual([0, 0, 0]);
    expect(state.distance).toBe(300);
  });
});
