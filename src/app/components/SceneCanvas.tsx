"use client";

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProjectFile, Drillhole } from "../lib/model";
import type { ThemeTokens } from "../lib/theme";

/**
 * IMPORTANT:
 * your app uses "view3d" and "plan2d" (per AppState/AppRoot).
 * keep SceneCanvas aligned to that naming so switching is deterministic.
 */
export type ViewType = "view3d" | "plan2d";

type Props = {
  project: ProjectFile;

  view: ViewType;
  setView: (v: ViewType) => void;

  selectedId: string | null;
  onSelect: (id: string | null) => void;

  tokens: ThemeTokens;

  showGrid: boolean;
  showTerrain: boolean;
};

type CameraState = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom?: number;
};

function cloneState(pos: THREE.Vector3, tgt: THREE.Vector3, zoom?: number): CameraState {
  return { position: pos.clone(), target: tgt.clone(), zoom };
}

function applyState(
  cam: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  controls: OrbitControls,
  st: CameraState
) {
  cam.position.copy(st.position);
  controls.target.copy(st.target);

  if ((cam as THREE.OrthographicCamera).isOrthographicCamera && typeof st.zoom === "number") {
    (cam as THREE.OrthographicCamera).zoom = st.zoom;
    (cam as THREE.OrthographicCamera).updateProjectionMatrix();
  }

  controls.update();
}

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

function normalizeAzimuthDeg(a: number): number {
  // normalize to [0, 360)
  const r = ((a % 360) + 360) % 360;
  return Math.abs(r) < 1e-12 ? 0 : r;
}

function clampInclinationDownDeg(incRaw: number): number {
  // down-only convention: [-90, 0]
  return Math.max(-90, Math.min(0, incRaw));
}

function fmt(n: number) {
  return String(Math.round(n * 1000) / 1000);
}

function fmtDeg(n: number) {
  return `${fmt(n)}°`;
}

/**
 * Returns a unit vector pointing "downhole" from the collar.
 *
 * CONVENTION:
 * - Y is up (scene uses Y-up).
 * - X is East, Z is North (plan view is X/Z plane).
 * - azimuth is clockwise from North (+Z), degrees [0..360).
 * - inclination is down-only, degrees in [-90..0]:
 *    0    = horizontal
 *    -90  = vertical down (-Y)
 *
 * Always ensures y <= 0.
 */
function drillDirFromAzInc(h: Drillhole): THREE.Vector3 {
  const azRaw = typeof h.azimuth === "number" && Number.isFinite(h.azimuth) ? h.azimuth : 0;
  const az = normalizeAzimuthDeg(azRaw);

  const incRaw =
    typeof h.inclination === "number" && Number.isFinite(h.inclination) ? h.inclination : -90;

  const inc = clampInclinationDownDeg(incRaw);

  const azR = degToRad(az);

  // inc is negative: -90..0
  const hMag = Math.cos(degToRad(-inc));

  const x = hMag * Math.sin(azR); // east
  const z = hMag * Math.cos(azR); // north
  const y = -Math.sin(degToRad(-inc)); // down is negative Y

  const v = new THREE.Vector3(x, y, z);
  if (v.lengthSq() < 1e-12) return new THREE.Vector3(0, -1, 0);
  return v.normalize();
}

function computeDrillholeBounds(drillholes: Drillhole[]): THREE.Box3 | null {
  if (drillholes.length === 0) return null;

  const box = new THREE.Box3();
  let any = false;

  for (const h of drillholes) {
    const depth = Math.max(0, h.depth);

    const top = new THREE.Vector3(h.collar.x, h.collar.y, h.collar.z);
    const dir = drillDirFromAzInc(h);
    const bot = top.clone().add(dir.multiplyScalar(depth));

    box.expandByPoint(top);
    box.expandByPoint(bot);
    any = true;
  }

  return any ? box : null;
}

function fitPerspectiveToBounds(
  cam: THREE.PerspectiveCamera,
  controls: OrbitControls,
  box: THREE.Box3,
  viewportAspect: number
) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const span = Math.max(size.x, size.z, 10);
  const verticalSpan = Math.max(size.y, 10);

  const fov = (cam.fov * Math.PI) / 180;
  const distForSpan = (span / 2) / Math.tan(fov / 2);
  const distForVertical = (verticalSpan / 2) / Math.tan(fov / 2);

  const dist = Math.max(distForSpan, distForVertical) * 1.35;

  cam.position.set(center.x + dist, center.y + dist * 0.65, center.z + dist);
  cam.near = Math.max(0.1, dist / 200);
  cam.far = Math.max(5000, dist * 20);
  cam.aspect = viewportAspect;
  cam.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

function fitOrthoToBounds(
  cam: THREE.OrthographicCamera,
  controls: OrbitControls,
  box: THREE.Box3,
  viewportAspect: number,
  orthoHalfHRef: React.MutableRefObject<number>
) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const spanZ = Math.max(10, size.z);

  const padding = 1.25;
  const halfH = (spanZ * padding) / 2;
  const halfW = halfH * viewportAspect;

  orthoHalfHRef.current = halfH;

  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;

  cam.near = 0.1;
  cam.far = 20000;

  cam.position.set(center.x, center.y + Math.max(200, size.y + 200), center.z);
  cam.up.set(0, 0, -1);
  cam.lookAt(center.x, center.y, center.z);

  cam.zoom = 1;
  cam.updateProjectionMatrix();

  controls.enableRotate = false;
  controls.target.copy(center);
  controls.update();
}

function pickIdFromObject(obj: THREE.Object3D | null): string | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (o.userData && o.userData.id) return String(o.userData.id);
    o = o.parent;
  }
  return null;
}

export function SceneCanvas(props: Props) {
  const { project, view, setView, selectedId, onSelect, tokens, showGrid, showTerrain } = props;

  // refs for stable key handlers (avoid remounting renderer effect)
  const projectRef = useRef<ProjectFile>(project);
  const selectedIdRef = useRef<string | null>(selectedId);
  const setViewRef = useRef<(v: ViewType) => void>(setView);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    setViewRef.current = setView;
  }, [setView]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  const camera3DRef = useRef<THREE.PerspectiveCamera | null>(null);
  const camera2DRef = useRef<THREE.OrthographicCamera | null>(null);

  const controls3DRef = useRef<OrbitControls | null>(null);
  const controls2DRef = useRef<OrbitControls | null>(null);

  const activeCameraRef = useRef<THREE.Camera | null>(null);
  const activeControlsRef = useRef<OrbitControls | null>(null);

  const rafRef = useRef<number | null>(null);

  const drillholeGroupRef = useRef<THREE.Group | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const terrainGroupRef = useRef<THREE.Group | null>(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseNDCRef = useRef(new THREE.Vector2());

  const camState3DRef = useRef<CameraState | null>(null);
  const camState2DRef = useRef<CameraState | null>(null);

  const orthoHalfHRef = useRef<number>(60);

  // overlays
  const axesHostRef = useRef<HTMLDivElement | null>(null);
  const hoverDivRef = useRef<HTMLDivElement | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const hoverRAFRef = useRef<number | null>(null);

  const projectSig = useMemo(() => {
    const ids = project.drillholes.map((d) => d.id).join("|");
    const coords = project.drillholes
      .map((d) =>
        [
          d.collar.x,
          d.collar.y,
          d.collar.z,
          d.depth,
          Number.isFinite(d.azimuth as number) ? d.azimuth : 0,
          Number.isFinite(d.inclination as number) ? d.inclination : -90,
        ].join(",")
      )
      .join("|");
    return `${project.version}::${ids}::${coords}`;
  }, [project]);

  function focusHole(dh: Drillhole) {
    const cam3D = camera3DRef.current;
    const cam2D = camera2DRef.current;
    const c3 = controls3DRef.current;
    const c2 = controls2DRef.current;
    const host = hostRef.current;

    if (!cam3D || !cam2D || !c3 || !c2 || !host) return;

    const bounds = computeDrillholeBounds([dh]);
    if (!bounds) return;

    const aspect = host.clientWidth / host.clientHeight;

    fitPerspectiveToBounds(cam3D, c3, bounds, aspect);
    fitOrthoToBounds(cam2D, c2, bounds, aspect, orthoHalfHRef);

    camState3DRef.current = cloneState(cam3D.position, c3.target);
    camState2DRef.current = cloneState(cam2D.position, c2.target, cam2D.zoom);
  }

  function focusSelected() {
    const id = selectedIdRef.current;
    if (!id) return;

    const dh = projectRef.current.drillholes.find((d) => d.id === id);
    if (!dh) return;

    focusHole(dh);
  }

  // MOUNT ONCE: setup renderer/scene
  useEffect(() => {
    if (!hostRef.current) return;

    const host = hostRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(80, 140, 60);
    scene.add(dir);

    const cam3D = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.1, 20000);
    cam3D.position.set(40, 30, 40);

    const aspect = host.clientWidth / host.clientHeight;
    const halfH = orthoHalfHRef.current;
    const cam2D = new THREE.OrthographicCamera(
      -halfH * aspect,
      halfH * aspect,
      halfH,
      -halfH,
      0.1,
      20000
    );

    cam2D.position.set(0, 200, 0);
    cam2D.up.set(0, 0, -1);
    cam2D.lookAt(0, 0, 0);
    cam2D.zoom = 1;
    cam2D.updateProjectionMatrix();

    const controls3D = new OrbitControls(cam3D, renderer.domElement);
    controls3D.enableDamping = true;
    controls3D.dampingFactor = 0.08;
    controls3D.screenSpacePanning = false;

    const controls2D = new OrbitControls(cam2D, renderer.domElement);
    controls2D.enableDamping = true;
    controls2D.dampingFactor = 0.1;
    controls2D.enableRotate = false;
    controls2D.enablePan = true;
    controls2D.screenSpacePanning = true;
    controls2D.enableZoom = true;

    const drillholes = new THREE.Group();
    drillholes.name = "drillholes";
    scene.add(drillholes);

    const gridGroup = new THREE.Group();
    gridGroup.name = "grid";
    scene.add(gridGroup);

    const terrainGroup = new THREE.Group();
    terrainGroup.name = "terrain";
    scene.add(terrainGroup);

    rendererRef.current = renderer;
    sceneRef.current = scene;

    camera3DRef.current = cam3D;
    camera2DRef.current = cam2D;

    controls3DRef.current = controls3D;
    controls2DRef.current = controls2D;

    drillholeGroupRef.current = drillholes;
    gridGroupRef.current = gridGroup;
    terrainGroupRef.current = terrainGroup;

    activeCameraRef.current = cam3D;
    activeControlsRef.current = controls3D;

    camState3DRef.current = cloneState(cam3D.position, controls3D.target);
    camState2DRef.current = cloneState(cam2D.position, controls2D.target, cam2D.zoom);

    // axes overlay (mini renderer)
    let axesRenderer: THREE.WebGLRenderer | null = null;
    let axesScene: THREE.Scene | null = null;
    let axesCam: THREE.PerspectiveCamera | null = null;

    const initAxes = () => {
      const axesHost = axesHostRef.current;
      if (!axesHost) return;

      const w = Math.max(1, axesHost.clientWidth);
      const h = Math.max(1, axesHost.clientHeight);

      axesRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      axesRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      axesRenderer.setSize(w, h);
      axesRenderer.outputColorSpace = THREE.SRGBColorSpace;

      axesHost.appendChild(axesRenderer.domElement);

      axesScene = new THREE.Scene();
      axesCam = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
      axesCam.position.set(2.2, 2.2, 2.2);
      axesCam.lookAt(0, 0, 0);

      axesScene.add(new THREE.AxesHelper(1.6));
    };

    initAxes();

    const onResize = () => {
      if (!rendererRef.current || !camera3DRef.current || !camera2DRef.current || !hostRef.current) return;

      const w = hostRef.current.clientWidth;
      const h = hostRef.current.clientHeight;
      const aspect2 = w / h;

      rendererRef.current.setSize(w, h);

      camera3DRef.current.aspect = aspect2;
      camera3DRef.current.updateProjectionMatrix();

      const halfH2 = orthoHalfHRef.current;
      camera2DRef.current.left = -halfH2 * aspect2;
      camera2DRef.current.right = halfH2 * aspect2;
      camera2DRef.current.top = halfH2;
      camera2DRef.current.bottom = -halfH2;
      camera2DRef.current.updateProjectionMatrix();

      const axesHost = axesHostRef.current;
      if (axesRenderer && axesCam && axesHost) {
        const aw = Math.max(1, axesHost.clientWidth);
        const ah = Math.max(1, axesHost.clientHeight);
        axesRenderer.setSize(aw, ah);
        axesCam.aspect = aw / ah;
        axesCam.updateProjectionMatrix();
      }
    };

    window.addEventListener("resize", onResize);

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented) return;

      const t = ev.target as HTMLElement | null;
      const inTextField =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable);
      if (inTextField) return;

      if (ev.key === "f" || ev.key === "F") {
        ev.preventDefault();
        focusSelected();
        return;
      }

      if (ev.key === "1") {
        ev.preventDefault();
        setViewRef.current("view3d");
        return;
      }

      if (ev.key === "2") {
        ev.preventDefault();
        setViewRef.current("plan2d");
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      activeControlsRef.current?.update();

      if (rendererRef.current && sceneRef.current && activeCameraRef.current) {
        rendererRef.current.render(sceneRef.current, activeCameraRef.current);
      }

      if (axesRenderer && axesScene && axesCam && activeCameraRef.current) {
        axesScene.quaternion.copy(activeCameraRef.current.quaternion);
        axesRenderer.render(axesScene, axesCam);
      }
    };

    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);

      controls3D.dispose();
      controls2D.dispose();

      if (axesRenderer) axesRenderer.dispose();

      renderer.dispose();
      host.removeChild(renderer.domElement);

      const axesHost = axesHostRef.current;
      if (axesHost && axesRenderer?.domElement && axesHost.contains(axesRenderer.domElement)) {
        axesHost.removeChild(axesRenderer.domElement);
      }

      rendererRef.current = null;
      sceneRef.current = null;
      camera3DRef.current = null;
      camera2DRef.current = null;
      controls3DRef.current = null;
      controls2DRef.current = null;
      activeCameraRef.current = null;
      activeControlsRef.current = null;
      drillholeGroupRef.current = null;
      gridGroupRef.current = null;
      terrainGroupRef.current = null;
    };
  }, []);

  // rebuild objects
  useEffect(() => {
    const drillGroup = drillholeGroupRef.current;
    const gridGroup = gridGroupRef.current;
    const terrainGroup = terrainGroupRef.current;

    if (!drillGroup || !gridGroup || !terrainGroup) return;

    drillGroup.clear();
    gridGroup.clear();
    terrainGroup.clear();

    if (showGrid) {
      const major = new THREE.GridHelper(
        400,
        40,
        new THREE.Color(tokens.gridMajor),
        new THREE.Color(tokens.gridMinor)
      );
      major.position.set(0, 0, 0);
      gridGroup.add(major);
    }

    if (showTerrain) {
      // placeholder: your existing terrain builder can add meshes here
      // terrainGroup.add(...)
    }

    project.drillholes.forEach((h) => {
      drillGroup.add(makeDrillholeMesh(h, tokens, h.id === selectedId));
    });
  }, [projectSig, showGrid, showTerrain, tokens, selectedId]);

  // auto-fit only when project changes
  useEffect(() => {
    const cam3D = camera3DRef.current;
    const cam2D = camera2DRef.current;
    const c3 = controls3DRef.current;
    const c2 = controls2DRef.current;
    const host = hostRef.current;

    if (!cam3D || !cam2D || !c3 || !c2 || !host) return;

    const bounds = computeDrillholeBounds(project.drillholes);
    if (!bounds) return;

    const aspect = host.clientWidth / host.clientHeight;

    fitPerspectiveToBounds(cam3D, c3, bounds, aspect);
    fitOrthoToBounds(cam2D, c2, bounds, aspect, orthoHalfHRef);

    camState3DRef.current = cloneState(cam3D.position, c3.target);
    camState2DRef.current = cloneState(cam2D.position, c2.target, cam2D.zoom);
  }, [projectSig, project.drillholes]);

  // selection highlight
  useEffect(() => {
    const drillGroup = drillholeGroupRef.current;
    if (!drillGroup) return;

    drillGroup.children.forEach((obj) => {
      const g = obj as THREE.Group;
      const id = g.userData.id as string | undefined;
      const isSelected = id && id === selectedId;

      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;

        if (mesh.userData.kind === "drillhole") {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.set(isSelected ? tokens.selection : tokens.drillhole);
          mat.needsUpdate = true;
        }
        if (mesh.userData.kind === "collar") {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.set(isSelected ? tokens.selection : tokens.collar);
          mat.needsUpdate = true;
        }
      });
    });
  }, [selectedId, tokens]);

  // view switching
  useEffect(() => {
    const cam3D = camera3DRef.current;
    const cam2D = camera2DRef.current;
    const c3 = controls3DRef.current;
    const c2 = controls2DRef.current;
    if (!cam3D || !cam2D || !c3 || !c2) return;

    if (activeCameraRef.current === cam3D) {
      camState3DRef.current = cloneState(cam3D.position, c3.target);
    } else if (activeCameraRef.current === cam2D) {
      camState2DRef.current = cloneState(cam2D.position, c2.target, cam2D.zoom);
    }

    if (view === "view3d") {
      activeCameraRef.current = cam3D;
      activeControlsRef.current = c3;

      c3.enableRotate = true;
      if (camState3DRef.current) applyState(cam3D, c3, camState3DRef.current);
    } else {
      activeCameraRef.current = cam2D;
      activeControlsRef.current = c2;

      c2.enableRotate = false;
      if (camState2DRef.current) applyState(cam2D, c2, camState2DRef.current);
    }
  }, [view]);

  // selection via raycast (no deselect on empty)
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const dom = renderer.domElement;

    const onPointerDown = (ev: PointerEvent) => {
      const drillGroup = drillholeGroupRef.current;
      const cam = activeCameraRef.current;
      if (!drillGroup || !cam) return;

      const rect = dom.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      mouseNDCRef.current.set(x, y);

      raycasterRef.current.setFromCamera(mouseNDCRef.current, cam);

      const hits = raycasterRef.current.intersectObjects(drillGroup.children, true);
      if (hits.length === 0) return;

      const id = pickIdFromObject(hits[0].object);
      if (id) onSelect(id);
    };

    dom.addEventListener("pointerdown", onPointerDown);
    return () => dom.removeEventListener("pointerdown", onPointerDown);
  }, [onSelect]);

  // hover tooltip
  useEffect(() => {
    const renderer = rendererRef.current;
    const tooltip = hoverDivRef.current;
    if (!renderer || !tooltip) return;

    const dom = renderer.domElement;

    const hide = () => {
      hoverIdRef.current = null;
      tooltip.style.display = "none";
    };

    const buildTooltipHtml = (h: Drillhole) => {
      const az =
        typeof h.azimuth === "number" && Number.isFinite(h.azimuth)
          ? normalizeAzimuthDeg(h.azimuth)
          : undefined;

      const inc =
        typeof h.inclination === "number" && Number.isFinite(h.inclination)
          ? clampInclinationDownDeg(h.inclination)
          : undefined;

      const collar = `(${fmt(h.collar.x)}, ${fmt(h.collar.y)}, ${fmt(h.collar.z)})`;
      const intervals = h.intervals?.length ? String(h.intervals.length) : "0";

      return `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;">
          <div style="font-weight:700;">${h.id}</div>
          <div style="opacity:0.75;">${fmt(h.depth)} m</div>
        </div>
        <div style="margin-top:6px;opacity:0.85;">Collar: ${collar}</div>
        <div style="margin-top:4px;opacity:0.85;">
          Az/Inc: ${az === undefined ? "—" : fmtDeg(az)} / ${inc === undefined ? "—" : fmtDeg(inc)}
        </div>
        <div style="margin-top:4px;opacity:0.85;">Intervals: ${intervals}</div>
      `;
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (hoverRAFRef.current) return;

      hoverRAFRef.current = requestAnimationFrame(() => {
        hoverRAFRef.current = null;

        const drillGroup = drillholeGroupRef.current;
        const cam = activeCameraRef.current;
        if (!drillGroup || !cam) {
          hide();
          return;
        }

        const rect = dom.getBoundingClientRect();
        const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        mouseNDCRef.current.set(ndcX, ndcY);

        raycasterRef.current.setFromCamera(mouseNDCRef.current, cam);

        const hits = raycasterRef.current.intersectObjects(drillGroup.children, true);
        if (hits.length === 0) {
          hide();
          return;
        }

        const id = pickIdFromObject(hits[0].object);
        if (!id) {
          hide();
          return;
        }

        if (hoverIdRef.current !== id) {
          hoverIdRef.current = id;

          const hole = project.drillholes.find((d) => d.id === id);
          if (!hole) {
            hide();
            return;
          }

          tooltip.innerHTML = buildTooltipHtml(hole);
        }

        tooltip.style.left = `${ev.clientX}px`;
        tooltip.style.top = `${ev.clientY}px`;
        tooltip.style.display = "block";
      });
    };

    const onPointerLeave = () => hide();

    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerleave", onPointerLeave);

    return () => {
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      if (hoverRAFRef.current) cancelAnimationFrame(hoverRAFRef.current);
      hoverRAFRef.current = null;
    };
  }, [project.drillholes]);

  return (
    <div ref={wrapperRef} style={{ position: "absolute", inset: 0 }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

      {/* top-right focus button */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          display: "flex",
          gap: 8,
          pointerEvents: "auto",
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={focusSelected}
          disabled={!selectedId}
          style={{
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${tokens.panelBorder}`,
            background: tokens.isDark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.75)",
            color: tokens.text,
            cursor: selectedId ? "pointer" : "not-allowed",
          }}
          title="Focus selected drillhole (F). Switch view: 1=3D, 2=Plan"
        >
          Focus (F)
        </button>
      </div>

      {/* bottom-left axes */}
      <div
        ref={axesHostRef}
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          width: 110,
          height: 110,
          borderRadius: 12,
          border: `1px solid ${tokens.panelBorder}`,
          background: tokens.isDark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.65)",
          pointerEvents: "none",
          zIndex: 9,
          overflow: "hidden",
        }}
        title="Axes: X=East, Y=Up, Z=North"
      />

      {/* hover tooltip */}
      <div
        ref={hoverDivRef}
        style={{
          position: "absolute",
          pointerEvents: "none",
          display: "none",
          zIndex: 20,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${tokens.panelBorder}`,
          background: tokens.isDark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.92)",
          color: tokens.text,
          boxShadow: tokens.isDark ? "0 10px 30px rgba(0,0,0,0.35)" : "0 10px 30px rgba(0,0,0,0.12)",
          maxWidth: 340,
          fontSize: 12,
          lineHeight: 1.35,
          transform: "translate(12px, 12px)",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}
      />
    </div>
  );
}

function makeDrillholeMesh(h: Drillhole, tokens: ThemeTokens, selected: boolean) {
  const g = new THREE.Group();
  g.userData.id = h.id;

  const radius = 0.35;
  const depth = Math.max(0.01, h.depth);

  const dir = drillDirFromAzInc(h);

  const cylGeo = new THREE.CylinderGeometry(radius, radius, depth, 16, 1, false);
  const cylMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(selected ? tokens.selection : tokens.drillhole),
    roughness: 0.8,
    metalness: 0.05,
  });

  const cyl = new THREE.Mesh(cylGeo, cylMat);
  cyl.userData.kind = "drillhole";

  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
  cyl.quaternion.copy(q);

  const collarPos = new THREE.Vector3(h.collar.x, h.collar.y, h.collar.z);
  const center = collarPos.clone().add(dir.clone().multiplyScalar(depth / 2));
  cyl.position.copy(center);

  g.add(cyl);

  const sGeo = new THREE.SphereGeometry(radius * 1.2, 16, 16);
  const sMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(selected ? tokens.selection : tokens.collar),
    roughness: 0.6,
    metalness: 0.05,
  });

  const collar = new THREE.Mesh(sGeo, sMat);
  collar.userData.kind = "collar";
  collar.position.copy(collarPos);
  g.add(collar);

  const cGeo = new THREE.CircleGeometry(radius * 1.6, 24);
  const cMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(selected ? tokens.selection : tokens.collar),
    transparent: true,
    opacity: tokens.isDark ? 0.55 : 0.35,
    side: THREE.DoubleSide,
  });

  const circle = new THREE.Mesh(cGeo, cMat);
  circle.userData.kind = "collar";
  circle.rotateX(-Math.PI / 2);
  circle.position.set(h.collar.x, h.collar.y + 0.02, h.collar.z);
  g.add(circle);

  return g;
}
