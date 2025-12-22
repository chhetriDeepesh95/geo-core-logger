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

function applyState(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, controls: OrbitControls, st: CameraState) {
  cam.position.copy(st.position);
  controls.target.copy(st.target);

  if ((cam as THREE.OrthographicCamera).isOrthographicCamera && typeof st.zoom === "number") {
    (cam as THREE.OrthographicCamera).zoom = st.zoom;
    (cam as THREE.OrthographicCamera).updateProjectionMatrix();
  }

  controls.update();
}

function computeDrillholeBounds(drillholes: Drillhole[]): THREE.Box3 | null {
  if (drillholes.length === 0) return null;

  const box = new THREE.Box3();
  let any = false;

  for (const h of drillholes) {
    // Y-up convention in your mesh placement:
    // collar at (x,y,z), hole extends down in -Y to y - depth
    const top = new THREE.Vector3(h.collar.x, h.collar.y, h.collar.z);
    const bot = new THREE.Vector3(h.collar.x, h.collar.y - Math.max(0, h.depth), h.collar.z);

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

  const spanX = Math.max(10, size.x);
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

export function SceneCanvas(props: Props) {
  const { project, view, selectedId, onSelect, tokens, showGrid, showTerrain } = props;

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

  const projectSig = useMemo(() => {
    const ids = project.drillholes.map((d) => d.id).join("|");
    const coords = project.drillholes
      .map((d) => `${d.collar.x},${d.collar.y},${d.collar.z},${d.depth}`)
      .join("|");
    return `${project.version}::${ids}::${coords}`;
  }, [project]);

  // mount once
  useEffect(() => {
    if (!hostRef.current) return;

    const host = hostRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(80, 140, 60);
    scene.add(dir);

    // cameras
    const cam3D = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.1, 20000);
    cam3D.position.set(40, 30, 40);

    const aspect = host.clientWidth / host.clientHeight;
    const halfH = orthoHalfHRef.current;
    const cam2D = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, 0.1, 20000);

    cam2D.position.set(0, 200, 0);
    cam2D.up.set(0, 0, -1);
    cam2D.lookAt(0, 0, 0);
    cam2D.zoom = 1;
    cam2D.updateProjectionMatrix();

    // controls
    const controls3D = new OrbitControls(cam3D, renderer.domElement);
    controls3D.enableDamping = true;
    controls3D.dampingFactor = 0.08;
    controls3D.screenSpacePanning = false;

    const controls2D = new OrbitControls(cam2D, renderer.domElement);
    controls2D.enableDamping = true;
    controls2D.dampingFactor = 0.10;
    controls2D.enableRotate = false;
    controls2D.enablePan = true;
    controls2D.screenSpacePanning = true;
    controls2D.enableZoom = true;

    // groups
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

    // default active camera
    activeCameraRef.current = cam3D;
    activeControlsRef.current = controls3D;

    camState3DRef.current = cloneState(cam3D.position, controls3D.target);
    camState2DRef.current = cloneState(cam2D.position, controls2D.target, cam2D.zoom);

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
    };

    window.addEventListener("resize", onResize);

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      activeControlsRef.current?.update();
      if (rendererRef.current && sceneRef.current && activeCameraRef.current) {
        rendererRef.current.render(sceneRef.current, activeCameraRef.current);
      }
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);

      controls3D.dispose();
      controls2D.dispose();

      renderer.dispose();
      host.removeChild(renderer.domElement);

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

    // if (showTerrain) {
    //   const geo = new THREE.PlaneGeometry(300, 300, 30, 30);
    //   geo.rotateX(-Math.PI / 2);

    //   const pos = geo.attributes.position as THREE.BufferAttribute;
    //   for (let i = 0; i < pos.count; i++) {
    //     const x = pos.getX(i);
    //     const z = pos.getZ(i);
    //     const y = 0.02 * x + 0.01 * z;
    //     pos.setY(i, y);
    //   }
    //   pos.needsUpdate = true;
    //   geo.computeVertexNormals();

    //   const mat = new THREE.MeshBasicMaterial({
    //     color: new THREE.Color(tokens.terrainWire),
    //     wireframe: true,
    //     transparent: true,
    //     opacity: tokens.isDark ? 0.35 : 0.25,
    //   });

    //   const mesh = new THREE.Mesh(geo, mat);
    //   mesh.userData.nonSelectable = true;
    //   terrainGroup.add(mesh);
    // }

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
  }, [projectSig]);

  // selection highlight
  useEffect(() => {
    const drillGroup = drillholeGroupRef.current;
    if (!drillGroup) return;

    drillGroup.children.forEach((obj) => {
      const g = obj as THREE.Group;
      const id = g.userData.id as string | undefined;
      const selected = id && id === selectedId;

      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;

        if (mesh.userData.kind === "drillhole") {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.set(selected ? tokens.selection : tokens.drillhole);
          mat.needsUpdate = true;
        }
        if (mesh.userData.kind === "collar") {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.set(selected ? tokens.selection : tokens.collar);
          mat.needsUpdate = true;
        }
      });
    });
  }, [selectedId, tokens]);

  // View switching (FIXED: uses "view3d"/"plan2d")
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

  // raycast selection: drillholes only; empty click does not clear selection
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

      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(mouseNDCRef.current, cam);

      const hits = raycaster.intersectObjects(drillGroup.children, true);
      if (hits.length === 0) return;

      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj.userData && obj.userData.id) {
          onSelect(String(obj.userData.id));
          return;
        }
        obj = obj.parent;
      }
    };

    dom.addEventListener("pointerdown", onPointerDown);
    return () => dom.removeEventListener("pointerdown", onPointerDown);
  }, [onSelect]);

  return (
    <div
      ref={hostRef}
      style={{
        position: "absolute",
        inset: 0,
      }}
    />
  );
}

function makeDrillholeMesh(h: Drillhole, tokens: ThemeTokens, selected: boolean) {
  const g = new THREE.Group();
  g.userData.id = h.id;

  const radius = 0.35;
  const height = Math.max(0.01, h.depth);

  const cylGeo = new THREE.CylinderGeometry(radius, radius, height, 16, 1, false);
  const cylMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(selected ? tokens.selection : tokens.drillhole),
    roughness: 0.8,
    metalness: 0.05,
  });

  const cyl = new THREE.Mesh(cylGeo, cylMat);
  cyl.userData.kind = "drillhole";
  cyl.position.set(h.collar.x, h.collar.y - height / 2, h.collar.z);
  g.add(cyl);

  const sGeo = new THREE.SphereGeometry(radius * 1.2, 16, 16);
  const sMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(selected ? tokens.selection : tokens.collar),
    roughness: 0.6,
    metalness: 0.05,
  });

  const collar = new THREE.Mesh(sGeo, sMat);
  collar.userData.kind = "collar";
  collar.position.set(h.collar.x, h.collar.y, h.collar.z);
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
