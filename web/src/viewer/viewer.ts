import * as THREE from "three";
import { SEVERITIES, type Severity } from "../issues/describe";
import { issueKey } from "../issues/filter-sort";
import { issueBounds, triangleSeverities } from "../issues/geometry";
import { buildOverlay } from "../issues/overlay";
import {
  hexToRgb,
  MODEL_COLOR,
  MODEL_COLOR_WITH_ISSUES,
  PANEL_BACKGROUND,
  SEVERITY_COLORS,
} from "../issues/palette";
import type { AnalyzeResult, Issue } from "../wasm/lint_core.mjs";
import { sceneBounds } from "./bounds";
import { cameraPosition, fitToBounds, focusOnBounds, orbit, pan, zoom } from "./camera";
import { ORBIT_STEP, PAN_STEP, POINTER_ORBIT_STEP, WHEEL_ZOOM_STEP, ZOOM_FACTOR } from "./controls";
import { normalLines } from "./normals";

export interface Viewer {
  setGeometry(result: AnalyzeResult, visibleIssues?: readonly Issue[]): void;
  setVisibleIssues(issues: readonly Issue[]): void;
  selectIssue(issue: Issue | null): void;
  setWireframe(on: boolean): void;
  setNormals(on: boolean): void;
  orbitBy(dYaw: number, dPitch: number): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  resetView(): void;
  resize(): void;
  dispose(): void;
}

export const CAMERA_FOV = 50;
export const NORMAL_LENGTH_FRACTION = 0.04;
const EMPTY_BOUNDS = { min: [0, 0, 0] as const, max: [0, 0, 0] as const };

export function createViewer(canvas: HTMLCanvasElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PANEL_BACKGROUND);
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV);
  const light = new THREE.DirectionalLight(0xffffff, 3);
  scene.add(new THREE.HemisphereLight(0xe4efff, 0x393345, 2), light);
  const model = new THREE.Group();
  const normalGroup = new THREE.Group();
  const overlayGroup = new THREE.Group();
  const selectionGroup = new THREE.Group();
  scene.add(model, normalGroup, overlayGroup, selectionGroup);
  let initial = fitToBounds(EMPTY_BOUNDS, CAMERA_FOV);
  let state = initial;
  let frame: number | null = null;
  let disposed = false;
  let wireframe = false;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const meshMaterials: THREE.MeshStandardMaterial[] = [];
  const overlayGeometries: THREE.BufferGeometry[] = [];
  let selectedIssue: Issue | null = null;
  const selectionGeometries: THREE.BufferGeometry[] = [];
  let currentResult: AnalyzeResult | null = null;
  let overlayMaterial: THREE.ShaderMaterial | null = null;
  let selectionMaterial: THREE.ShaderMaterial | null = null;

  function createOverlayMaterial(opacity: number, brighten: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPalette: {
          value: SEVERITIES.map(
            (severity) => new THREE.Vector3(...hexToRgb(SEVERITY_COLORS[severity])),
          ),
        },
        uOpacity: { value: opacity },
        uBrighten: { value: brighten },
      },
      vertexShader: `
        attribute float aSeverity;
        varying float vSeverity;
        void main() {
          vSeverity = aSeverity;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uPalette[3];
        uniform float uOpacity;
        uniform float uBrighten;
        varying float vSeverity;
        void main() {
          vec3 color = uPalette[int(floor(vSeverity + 0.5))];
          gl_FragColor = vec4(mix(color, vec3(1.0), uBrighten), uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.FrontSide,
    });
  }

  function addOverlay(
    flagged: ReadonlyMap<string, ReadonlyMap<number, Severity>>,
    group: THREE.Group,
    material: THREE.ShaderMaterial,
    ownedGeometries: THREE.BufferGeometry[],
    renderOrder: number,
  ): void {
    if (!currentResult) return;
    for (const part of currentResult.parts) {
      const triangles = flagged.get(`${part.mesh}:${part.primitive}`);
      if (!triangles) continue;
      const overlay = buildOverlay(part, triangles);
      if (overlay.triangleCount === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(overlay.positions, 3));
      geometry.setAttribute("aSeverity", new THREE.BufferAttribute(overlay.severities, 1));
      ownedGeometries.push(geometry);
      for (const instance of currentResult.instances) {
        if (instance.mesh !== part.mesh) continue;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.fromArray(instance.world);
        mesh.renderOrder = renderOrder;
        group.add(mesh);
      }
    }
  }

  function clearSelection(): void {
    selectedIssue = null;
    selectionGroup.clear();
    for (const geometry of selectionGeometries) geometry.dispose();
    selectionGeometries.length = 0;
    selectionMaterial?.dispose();
    selectionMaterial = null;
    const opacity = overlayMaterial?.uniforms.uOpacity;
    if (opacity) opacity.value = 0.8;
  }

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

  function clearOverlay(): void {
    overlayGroup.clear();
    for (const geometry of overlayGeometries) geometry.dispose();
    overlayGeometries.length = 0;
    overlayMaterial?.dispose();
    overlayMaterial = null;
  }

  function setVisibleIssues(issues: readonly Issue[]): void {
    if (disposed || !currentResult) return;
    clearOverlay();
    const selectedKey = selectedIssue ? issueKey(selectedIssue) : null;
    if (selectedKey !== null && !issues.some((issue) => issueKey(issue) === selectedKey))
      clearSelection();
    const flagged = triangleSeverities(issues);
    if (flagged.size > 0) {
      overlayMaterial = createOverlayMaterial(
        selectedIssue?.element_kind === "triangle" ? 0.35 : 0.8,
        0,
      );
      addOverlay(flagged, overlayGroup, overlayMaterial, overlayGeometries, 1);
    }
    requestRender();
  }

  function clearGeometry(): void {
    clearSelection();
    clearOverlay();
    currentResult = null;
    model.clear();
    normalGroup.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.length = 0;
    materials.length = 0;
    meshMaterials.length = 0;
  }

  const viewer: Viewer = {
    resize,
    setVisibleIssues,
    setGeometry(result, visibleIssues = result.issues) {
      if (!result.ok || disposed) return;
      clearGeometry();
      currentResult = result;
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
          color: result.issues.some((issue) => issue.element_kind === "triangle")
            ? MODEL_COLOR_WITH_ISSUES
            : MODEL_COLOR,
          flatShading: part.normals.length === 0,
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
      setVisibleIssues(visibleIssues);
      requestRender();
    },
    selectIssue(issue) {
      if (disposed) return;
      clearSelection();
      selectedIssue = issue;
      if (issue && currentResult) {
        if (issue.element_kind === "triangle") {
          selectionMaterial = createOverlayMaterial(1, 0.25);
          addOverlay(
            triangleSeverities([issue]),
            selectionGroup,
            selectionMaterial,
            selectionGeometries,
            2,
          );
          const opacity = overlayMaterial?.uniforms.uOpacity;
          if (opacity) opacity.value = 0.35;
        }
        const bounds = issueBounds(issue, currentResult.parts, currentResult.instances);
        if (bounds) {
          // Instant focus also respects prefers-reduced-motion.
          state = focusOnBounds(state, bounds, CAMERA_FOV);
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
