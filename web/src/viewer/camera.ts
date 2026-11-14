import { type Bounds, boundsCenter, boundsRadius } from "./bounds";
import type { Vec3 } from "./vec3";

export interface OrbitState {
  readonly target: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly radius: number;
  readonly minDistance?: number;
}

export const MAX_PITCH = (89 * Math.PI) / 180;
export const MIN_DISTANCE_FACTOR = 0.1;
export const MAX_DISTANCE_FACTOR = 50;
export const FIT_MARGIN = 1.2;
export const FOCUS_MIN_RADIUS_FACTOR = 0.005;
export const INITIAL_YAW = 0.6;
export const INITIAL_PITCH = 0.4;

export function cameraPosition(state: OrbitState): Vec3 {
  const { target, distance, yaw, pitch } = state;
  return [
    target[0] + distance * Math.sin(yaw) * Math.cos(pitch),
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * Math.cos(yaw) * Math.cos(pitch),
  ];
}

export function orbit(state: OrbitState, yaw: number, pitch: number): OrbitState {
  return {
    ...state,
    yaw: state.yaw + yaw,
    pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitch + pitch)),
  };
}

export function zoom(state: OrbitState, factor: number): OrbitState {
  return {
    ...state,
    distance: Math.max(
      state.minDistance ?? state.radius * MIN_DISTANCE_FACTOR,
      Math.min(state.radius * MAX_DISTANCE_FACTOR, state.distance * factor),
    ),
  };
}

export function pan(state: OrbitState, dx: number, dy: number): OrbitState {
  const { yaw, pitch, distance, target } = state;
  return {
    ...state,
    target: [
      target[0] + distance * (dx * Math.cos(yaw) - dy * Math.sin(yaw) * Math.sin(pitch)),
      target[1] + distance * dy * Math.cos(pitch),
      target[2] + distance * (-dx * Math.sin(yaw) - dy * Math.cos(yaw) * Math.sin(pitch)),
    ],
  };
}

export function fitToBounds(bounds: Bounds, fovDegrees: number): OrbitState {
  const radius = boundsRadius(bounds) || 1;
  return zoom(
    {
      target: boundsCenter(bounds),
      yaw: INITIAL_YAW,
      pitch: INITIAL_PITCH,
      radius,
      distance: (radius / Math.sin((fovDegrees * Math.PI) / 360)) * FIT_MARGIN,
    },
    1,
  );
}

export function focusOnBounds(state: OrbitState, bounds: Bounds, fovDegrees: number): OrbitState {
  const focusRadius = Math.max(boundsRadius(bounds), state.radius * FOCUS_MIN_RADIUS_FACTOR);
  const distance = Math.min(
    (focusRadius / Math.sin((fovDegrees * Math.PI) / 360)) * FIT_MARGIN,
    state.radius * MAX_DISTANCE_FACTOR,
  );
  return {
    ...state,
    target: boundsCenter(bounds),
    distance,
    minDistance: Math.min(state.radius * MIN_DISTANCE_FACTOR, distance * 0.25),
  };
}
