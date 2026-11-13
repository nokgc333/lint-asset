import { describe, expect, it } from "vitest";
import {
  cameraPosition,
  fitToBounds,
  MAX_DISTANCE_FACTOR,
  MAX_PITCH,
  MIN_DISTANCE_FACTOR,
  type OrbitState,
  orbit,
  pan,
  zoom,
} from "./camera";

// Y is up. yaw turns the camera around Y, pitch lifts it above the target.
// At yaw 0 and pitch 0 the camera is on the +Z axis, looking toward -Z.
const start: OrbitState = Object.freeze({
  target: [0, 0, 0] as const,
  yaw: 0,
  pitch: 0,
  distance: 5,
  radius: 1,
});

function expectVector(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 6);
  });
}

describe("cameraPosition", () => {
  it("sits on the +Z axis at yaw 0 and pitch 0", () => {
    expectVector(cameraPosition(start), [0, 0, 5]);
  });

  it("moves to the +X axis after a quarter turn of yaw", () => {
    expectVector(cameraPosition({ ...start, yaw: Math.PI / 2 }), [5, 0, 0]);
  });

  it("rises with pitch and stays at the same distance", () => {
    const position = cameraPosition({ ...start, pitch: Math.PI / 6 });
    expectVector(position, [0, 2.5, 5 * Math.cos(Math.PI / 6)]);
  });

  it("is measured from the target", () => {
    expectVector(cameraPosition({ ...start, target: [1, 2, 3] }), [1, 2, 8]);
  });
});

describe("orbit", () => {
  it("adds the yaw and pitch deltas", () => {
    const next = orbit(start, 0.1, 0.2);
    expect(next.yaw).toBeCloseTo(0.1, 9);
    expect(next.pitch).toBeCloseTo(0.2, 9);
  });

  it("stops the pitch before the poles, so the camera never flips", () => {
    expect(orbit(start, 0, 10).pitch).toBe(MAX_PITCH);
    expect(orbit(start, 0, -10).pitch).toBe(-MAX_PITCH);
    expect(MAX_PITCH).toBeLessThan(Math.PI / 2);
  });

  it("does not change the input", () => {
    orbit(start, 1, 1);
    expect(start.yaw).toBe(0);
    expect(start.pitch).toBe(0);
  });
});

describe("zoom", () => {
  it("multiplies the distance by the factor", () => {
    expect(zoom(start, 0.5).distance).toBeCloseTo(2.5, 9);
    expect(zoom(start, 2).distance).toBeCloseTo(10, 9);
  });

  it("keeps the distance within limits that scale with the model radius", () => {
    expect(zoom(start, 1e-9).distance).toBeCloseTo(start.radius * MIN_DISTANCE_FACTOR, 9);
    expect(zoom(start, 1e9).distance).toBeCloseTo(start.radius * MAX_DISTANCE_FACTOR, 9);
  });
});

describe("pan", () => {
  it("moves the target to the camera's right and up, in proportion to the distance", () => {
    expectVector(pan(start, 1, 0).target, [5, 0, 0]);
    expectVector(pan(start, 0, 1).target, [0, 5, 0]);
  });

  it("follows the camera when it has turned", () => {
    // After a quarter turn of yaw, the camera's right is -Z.
    expectVector(pan({ ...start, yaw: Math.PI / 2 }, 1, 0).target, [0, 0, -5]);
  });

  it("does not change the distance or the angles", () => {
    const next = pan(start, 0.3, -0.2);
    expect(next.distance).toBe(start.distance);
    expect(next.yaw).toBe(start.yaw);
    expect(next.pitch).toBe(start.pitch);
  });
});

describe("fitToBounds", () => {
  const FOV = 50;

  it("looks at the center of the bounds", () => {
    const state = fitToBounds({ min: [-1, -1, -1], max: [1, 1, 1] }, FOV);
    expectVector(state.target, [0, 0, 0]);
  });

  it("uses half the diagonal as the radius and backs off far enough to see all of it", () => {
    const state = fitToBounds({ min: [-1, -1, -1], max: [1, 1, 1] }, FOV);
    expect(state.radius).toBeCloseTo(Math.sqrt(3), 9);
    const minimum = state.radius / Math.sin((FOV / 2) * (Math.PI / 180));
    expect(state.distance).toBeGreaterThanOrEqual(minimum);
    expect(state.distance).toBeLessThanOrEqual(state.radius * MAX_DISTANCE_FACTOR);
  });

  it("centers bounds that are off the origin", () => {
    const state = fitToBounds({ min: [10, 20, 30], max: [12, 24, 36] }, FOV);
    expectVector(state.target, [11, 22, 33]);
  });

  it("gives a usable view for bounds with no size", () => {
    const state = fitToBounds({ min: [3, 3, 3], max: [3, 3, 3] }, FOV);
    expect(state.radius).toBeGreaterThan(0);
    expect(Number.isFinite(state.distance)).toBe(true);
    expect(state.distance).toBeGreaterThan(0);
  });
});
