import * as THREE from "three";
import type { GeometryResult } from "../wasm/lint_core.mjs";
import { sceneBounds } from "./bounds";
import { cameraPosition, fitToBounds, orbit, pan, zoom } from "./camera";
import { ORBIT_STEP, PAN_STEP, POINTER_ORBIT_STEP, WHEEL_ZOOM_STEP, ZOOM_FACTOR } from "./controls";
import { normalLines } from "./normals";

export interface Viewer {
  setGeometry(result: GeometryResult): void;
  setWireframe(on: boolean): void;
  setNormals(on: boolean): void;
  orbitBy(dYaw: number, dPitch: number): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  resetView(): void;
  dispose(): void;
}

export const CAMERA_FOV = 50;
export const NORMAL_LENGTH_FRACTION = 0.04;
const EMPTY_BOUNDS = { min: [0, 0, 0] as const, max: [0, 0, 0] as const };

export function createViewer(canvas: HTMLCanvasElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18212d);
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV);
  const light = new THREE.DirectionalLight(0xffffff, 3);
  scene.add(new THREE.HemisphereLight(0xe4efff, 0x393345, 2), light);
  const model = new THREE.Group();
  const normalGroup = new THREE.Group();
  scene.add(model, normalGroup);
  let initial = fitToBounds(EMPTY_BOUNDS, CAMERA_FOV);
  let state = initial;
  let frame: number | null = null;
  let disposed = false;
  let wireframe = false;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const meshMaterials: THREE.MeshStandardMaterial[] = [];

  function requestRender(): void {
    if (disposed || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      camera.position.set(...cameraPosition(state));
      camera.lookAt(...state.target);
      camera.near = Math.max(state.radius * 0.01, 1e-4);
      camera.far = state.radius * 100 + state.distance;
      camera.updateProjectionMatrix();
      light.position.copy(camera.position);
      light.target.position.set(...state.target);
      light.target.updateMatrixWorld();
      renderer.render(scene, camera);
    });
  }

  function resize(): void {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    requestRender();
  }

  function clearGeometry(): void {
    model.clear();
    normalGroup.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.length = 0;
    materials.length = 0;
    meshMaterials.length = 0;
  }

  const viewer: Viewer = {
    setGeometry(result) {
      if (!result.ok || disposed) return;
      clearGeometry();
      initial = fitToBounds(
        sceneBounds(result.parts, result.instances) ?? EMPTY_BOUNDS,
        CAMERA_FOV,
      );
      state = initial;
      const normalMaterial = new THREE.LineBasicMaterial({ color: 0xffd166 });
      materials.push(normalMaterial);
      const parts = result.parts.map((part) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
        if (part.normals.length)
          geometry.setAttribute("normal", new THREE.BufferAttribute(part.normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(part.triangles, 1));
        const material = new THREE.MeshStandardMaterial({
          color: 0x92a8bf,
          flatShading: part.normals.length === 0,
          // Back faces stay invisible so a flipped face shows as a hole.
          side: THREE.FrontSide,
          wireframe,
        });
        const lines = new THREE.BufferGeometry();
        lines.setAttribute(
          "position",
          new THREE.BufferAttribute(
            normalLines(part.positions, part.normals, NORMAL_LENGTH_FRACTION * 2 * state.radius),
            3,
          ),
        );
        geometries.push(geometry, lines);
        materials.push(material);
        meshMaterials.push(material);
        return { mesh: part.mesh, geometry, material, lines };
      });
      for (const instance of result.instances) {
        for (const part of parts) {
          if (part.mesh !== instance.mesh) continue;
          const mesh = new THREE.Mesh(part.geometry, part.material);
          mesh.matrixAutoUpdate = false;
          mesh.matrix.fromArray(instance.world);
          model.add(mesh);
          const lines = new THREE.LineSegments(part.lines, normalMaterial);
          lines.matrixAutoUpdate = false;
          lines.matrix.fromArray(instance.world);
          normalGroup.add(lines);
        }
      }
      requestRender();
    },
    setWireframe(on) {
      wireframe = on;
      for (const material of meshMaterials) material.wireframe = on;
      requestRender();
    },
    setNormals(on) {
      normalGroup.visible = on;
      requestRender();
    },
    orbitBy(yaw, pitch) {
      state = orbit(state, yaw, pitch);
      requestRender();
    },
    zoomBy(factor) {
      state = zoom(state, factor);
      requestRender();
    },
    panBy(dx, dy) {
      state = pan(state, dx, dy);
      requestRender();
    },
    resetView() {
      state = initial;
      requestRender();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      events.abort();
      if (frame !== null) cancelAnimationFrame(frame);
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      clearGeometry();
      renderer.dispose();
    },
  };

  normalGroup.visible = false;
  const events = new AbortController();
  const options = { signal: events.signal };
  let drag: { id: number; x: number; y: number; pan: boolean } | null = null;
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (drag || (event.button !== 0 && event.button !== 2)) return;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pan: event.button === 2 || event.shiftKey,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus();
      event.preventDefault();
    },
    options,
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.pan || event.shiftKey) {
        const scale =
          (2 * Math.tan((CAMERA_FOV * Math.PI) / 360)) / Math.max(canvas.clientHeight, 1);
        viewer.panBy(-dx * scale, dy * scale);
      } else {
        viewer.orbitBy(-dx * POINTER_ORBIT_STEP, dy * POINTER_ORBIT_STEP);
      }
    },
    options,
  );
  const endDrag = (event: PointerEvent): void => {
    if (drag?.id !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
  };
  canvas.addEventListener("pointerup", endDrag, options);
  canvas.addEventListener("pointercancel", endDrag, options);
  canvas.addEventListener("lostpointercapture", endDrag, options);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), options);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      viewer.zoomBy(Math.exp(event.deltaY * WHEEL_ZOOM_STEP));
    },
    { ...options, passive: false },
  );
  canvas.addEventListener(
    "keydown",
    (event) => {
      switch (event.key) {
        case "ArrowLeft":
          if (event.shiftKey) viewer.panBy(-PAN_STEP, 0);
          else viewer.orbitBy(-ORBIT_STEP, 0);
          break;
        case "ArrowRight":
          if (event.shiftKey) viewer.panBy(PAN_STEP, 0);
          else viewer.orbitBy(ORBIT_STEP, 0);
          break;
        case "ArrowUp":
          if (event.shiftKey) viewer.panBy(0, PAN_STEP);
          else viewer.orbitBy(0, ORBIT_STEP);
          break;
        case "ArrowDown":
          if (event.shiftKey) viewer.panBy(0, -PAN_STEP);
          else viewer.orbitBy(0, -ORBIT_STEP);
          break;
        case "+":
        case "=":
          viewer.zoomBy(ZOOM_FACTOR);
          break;
        case "-":
          viewer.zoomBy(1 / ZOOM_FACTOR);
          break;
        case "0":
        case "Home":
          viewer.resetView();
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    options,
  );

  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement ?? canvas);
  resize();
  return viewer;
}
