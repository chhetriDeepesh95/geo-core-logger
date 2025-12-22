"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Theme } from "@radix-ui/themes";

import type { AppState } from "../lib/appState";
import { getThemeTokens } from "../lib/theme";
import { loadFromLocalStorage, saveToLocalStorage } from "../lib/persistence";

import type { ProjectFile } from "../lib/model";

import { SceneViewport } from "./SceneViewport";
import { LeftToolMenu } from "./LeftToolMenu";
import { TopToolbar } from "./TopToolbar";
import { OverlayHost } from "./OverlayHost";

function makeDefaultProject(): ProjectFile {
  return {
    version: "1.0.0",
    project: { name: "New Project", units: { length: "m" } },
    drillholes: [],
    lithLegend: { UNKNOWN: "#888888" },
  };
}

function makeDefaultState(): AppState {
  return {
    project: makeDefaultProject(),
    theme: "dark",
    mode: "workspace3d",
    view: "view3d",
    selection: { drillholeId: null, intervalId: null },
    camera3d: {
      position: { x: 40, y: 35, z: 40 },
      target: { x: 0, y: 0, z: 0 },
    },
    camera2d: { center: { x: 0, y: 0, z: 0 }, zoom: 1.2 },
    section: {
      startHoleId: null,
      endHoleId: null,
      maxDepth: 50,
      logWidth: 8,
      showLith: true,
      showRqd: true,
      showRecovery: true,
    },
    scene: { showGrid: true, showTerrain: true },
    activeTool: null,
    linkedFileName: null,
    
  };
}

export function AppRoot() {
  const [state, setState] = useState<AppState>(() => makeDefaultState());

  useEffect(() => {
    const restored = loadFromLocalStorage();
    if (restored?.project) setState((prev) => ({ ...prev, ...restored }));
  }, []);

  useEffect(() => {
    saveToLocalStorage(state);
  }, [state]);

  const tokens = useMemo(() => getThemeTokens(state.theme), [state.theme]);
  const radixAppearance = state.theme === "dark" ? "dark" : "light";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.ctrlKey || e.metaKey;

      if (e.key === "Escape") {
        setState((s) => ({ ...s, activeTool: null }));
        return;
      }

      if (isMod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        // save handled later in Data workspace
        return;
      }

      if (isMod && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        setState((s) => ({ ...s, activeTool: "data" }));
        return;
      }

      if (isMod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setState((s) => ({ ...s, activeTool: s.activeTool ?? "drillholes" }));
        return;
      }

      if (e.key === "g" || e.key === "G") {
        setState((s) => ({ ...s, scene: { ...s.scene, showGrid: !s.scene.showGrid } }));
        return;
      }

      if (e.key === "t" || e.key === "T") {
        setState((s) => ({ ...s, scene: { ...s.scene, showTerrain: !s.scene.showTerrain } }));
        return;
      }

      if (e.key === "v" || e.key === "V") {
        setState((s) => ({ ...s, view: s.view === "view3d" ? "plan2d" : "view3d" }));
        return;
      }

      if (e.key === "[" || e.key === "]") {
        setState((s) => {
          const holes = s.project.drillholes;
          if (holes.length === 0) return s;

          const current = s.selection.drillholeId;
          const idx = holes.findIndex((h) => h.id === current);

          const nextIdx =
            e.key === "]"
              ? (idx + 1 + holes.length) % holes.length
              : (idx - 1 + holes.length) % holes.length;

          return { ...s, selection: { drillholeId: holes[nextIdx].id, intervalId: null } };
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Theme appearance={radixAppearance} accentColor="blue" radius="medium">
      <div
        style={{
          position: "relative",
          width: "100vw",
          height: "100vh",
          background: radixAppearance === "dark" ? "#070b16" : "#f6f7fb",
          // transition: "background 180ms ease",
          overflow: "hidden",
          color: tokens.text,
        }}
      >
        <SceneViewport state={state} setState={setState} tokens={tokens} />
        <TopToolbar state={state} setState={setState} tokens={tokens} />
        <LeftToolMenu state={state} setState={setState} tokens={tokens} />
        <OverlayHost state={state} setState={setState} tokens={tokens} />
      </div>
    </Theme>
  );
}
