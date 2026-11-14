import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODEL_COLOR, MODEL_COLOR_WITH_ISSUES } from "../issues/palette";
import type { AnalyzeResult, Issue } from "../wasm/lint_core.mjs";
import { createViewer } from "./viewer";

const { render } = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("three", async (original) => ({
  ...(await original<typeof THREE>()),
  WebGLRenderer: class {
    setPixelRatio() {}
    setSize() {}
    render = render;
    dispose() {}
  },
}));

const issue: Issue = {
  rule: "normal.flipped",
  severity: "error",
  message: "Flipped face",
  element_kind: "triangle",
  target: { mesh: 0, primitive: 0 },
  count: 1,
  elements: [0],
  truncated: false,
};

function setup() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    addEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;
  const viewer = createViewer(canvas);
  const result: AnalyzeResult = {
    ok: true,
    code: "",
    message: "",
    meshes: 1,
    primitives: 1,
    triangles: 1,
    parts: [
      {
        mesh: 0,
        primitive: 0,
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array(),
        triangles: new Uint32Array([0, 1, 2]),
      },
    ],
    instances: [0, 3].map((x) => ({
      mesh: 0,
      world: new Float32Array(new THREE.Matrix4().makeTranslation(x, 0, 0).elements),
    })),
    issues: [issue],
    thresholds: { max_triangles: 100000, min_extent_m: 0.01, max_extent_m: 1000 },
  };
  function flush() {
    while (frames.length) frames.shift()?.(0);
    return render.mock.calls.at(-1)?.[0] as THREE.Scene;
  }
  return { viewer, result, flush };
}

afterEach(() => {
  vi.unstubAllGlobals();
  render.mockClear();
});

describe("problem overlays", () => {
  it("shares overlay geometry across instances and preserves it in wireframe mode", () => {
    const { viewer, result, flush } = setup();
    viewer.setGeometry(result);
    viewer.setWireframe(true);
    viewer.setNormals(true);
    const scene = flush();
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    const base = meshes.find((mesh) => mesh.material instanceof THREE.MeshStandardMaterial);
    const baseMaterial = base?.material as THREE.MeshStandardMaterial;
    expect(baseMaterial.color.getHexString()).toBe(MODEL_COLOR_WITH_ISSUES.slice(1));
    const normals = scene.children.find((group) =>
      group.children.some((object) => object instanceof THREE.LineSegments),
    );
    expect(normals?.visible).toBe(true);
    const overlays = meshes.filter((mesh) => mesh.material instanceof THREE.ShaderMaterial);
    expect(overlays).toHaveLength(2);
    expect(overlays[0]?.geometry).toBe(overlays[1]?.geometry);
    expect(overlays[0]?.geometry.getAttribute("aSeverity").count).toBe(3);
    expect(overlays[1]?.matrix.elements[12]).toBe(3);
    const material = overlays[0]?.material as THREE.ShaderMaterial;
    expect(material.wireframe).toBe(false);
    viewer.dispose();
  });

  it("dims only for triangle selections and disposes old overlays", () => {
    const { viewer, result, flush } = setup();
    viewer.setGeometry(result);
    const scene = flush();
    const overlays: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial)
        overlays.push(object);
    });
    const geometryDispose = vi.spyOn(overlays[0]?.geometry as THREE.BufferGeometry, "dispose");
    const material = overlays[0]?.material as THREE.ShaderMaterial;
    const materialDispose = vi.spyOn(material, "dispose");
    viewer.selectIssue(issue);
    flush();
    expect(material.uniforms.uOpacity?.value).toBe(0.35);
    const selected: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.ShaderMaterial &&
        object.material !== material
      )
        selected.push(object);
    });
    expect(selected).toHaveLength(2);
    const selectedMaterial = selected[0]?.material as THREE.ShaderMaterial;
    expect(selectedMaterial.uniforms.uOpacity?.value).toBe(1);
    expect(selectedMaterial.uniforms.uBrighten?.value).toBe(0.25);
    const selectionDispose = vi.spyOn(selected[0]?.geometry as THREE.BufferGeometry, "dispose");
    viewer.selectIssue({
      rule: "asset.scale_too_small",
      severity: "warning",
      message: "Small",
      element_kind: "asset",
      count: 1,
      elements: [],
      truncated: false,
    });
    expect(selectionDispose).toHaveBeenCalledOnce();
    expect(material.uniforms.uOpacity?.value).toBe(0.8);
    viewer.selectIssue(null);
    expect(material.uniforms.uOpacity?.value).toBe(0.8);
    viewer.setGeometry({ ...result, issues: [] });
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    viewer.dispose();
  });
  it("focuses issue bounds instantly, skips missing bounds, and resets to the original view", () => {
    const { viewer, result, flush } = setup();
    result.parts[0]?.positions.set([10, 0, 0, 11, 0, 0, 10, 1, 0]);
    viewer.setGeometry(result);
    flush();
    const camera = render.mock.calls.at(-1)?.[1] as THREE.PerspectiveCamera;
    const initialPosition = camera.position.clone();
    viewer.orbitBy(0.5, 0.2);
    viewer.panBy(0.1, 0.1);
    flush();
    viewer.selectIssue(issue);
    const scene = flush();
    const light = scene.children.find(
      (object) => object instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight;
    expect(light.target.position.toArray()).toEqual([12, 0.5, 0]);
    const focused = camera.position.clone();
    viewer.selectIssue({ ...issue, target: { mesh: 99, primitive: 0 } });
    flush();
    expect(camera.position.toArray()).toEqual(focused.toArray());
    viewer.resetView();
    flush();
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    viewer.setGeometry({ ...result, issues: [] });
    flush();
    const base: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) base.push(object);
    });
    expect(base).toHaveLength(2);
    const baseMaterial = base[0]?.material as THREE.MeshStandardMaterial;
    expect(baseMaterial.color.getHexString()).toBe(MODEL_COLOR.slice(1));
    viewer.dispose();
  });
});
