import type { AppState } from "./appState";

export const ENABLE_LOCAL_FILE_IO: boolean = false;

const LS_KEY = "geo_corelog_app_state_v1";

export function loadFromLocalStorage(): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return parsed ?? null;
  } catch {
    return null;
  }
}

export function saveToLocalStorage(state: AppState): void {
  try {
    const snapshot: Partial<AppState> = {
      project: state.project,
      theme: state.theme,
      mode: state.mode,
      view: state.view,
      selection: state.selection,
      camera3d: state.camera3d,
      camera2d: state.camera2d,
      section: state.section,
      scene: state.scene,
      activeTool: state.activeTool,
      linkedFileName: state.linkedFileName,
      showWelcome: state.showWelcome,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch {
    // persistence is best-effort only
  }
}
