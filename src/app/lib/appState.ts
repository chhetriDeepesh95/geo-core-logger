import type { ProjectFile } from "./model";
import type { SectionState } from "./sectionState";

export type ThemeMode = "light" | "dark";
export type AppMode = "workspace3d" | "section";
export type ViewType = "view3d" | "plan2d";

export type SelectionState = {
  drillholeId: string | null;
  intervalId: string | null;
};

export type CameraState3D = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

export type CameraState2D = {
  center: { x: number; y: number; z: number };
  zoom: number;
};

export type SceneToggles = {
  showGrid: boolean;
  showTerrain: boolean;
};

export type AppState = {
  project: ProjectFile;

  theme: ThemeMode;
  mode: AppMode;
  view: ViewType;

  selection: SelectionState;

  camera3d: CameraState3D;
  camera2d: CameraState2D;

  section: SectionState;
  scene: SceneToggles;

  activeTool:
    | null
    | "drillholes"
    | "logging"
    | "section"
    | "view"
    | "data"
    | "qa"
    | "settings"
    | "export";

  linkedFileName: string | null;
};
