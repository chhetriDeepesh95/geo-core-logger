"use client";

import React, { useEffect, useMemo } from "react";
import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";
import { SceneCanvas, type ViewType } from "./SceneCanvas";

/**
 * SceneViewport:
 * - owns layout (full-screen, reliable sizing)
 * - binds AppState -> SceneCanvas props
 * - does NOT mutate domain beyond selection safety
 */
export function SceneViewport({
  state,
  setState,
  tokens,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
}) {
  // ensure consistent view type
  const view = state.view as ViewType;

  const project = state.project;
  const selectedId = state.selection.drillholeId;

  // if selected drillhole was deleted, clear selection safely
  const selectedExists = useMemo(() => {
    if (!selectedId) return true;
    return project.drillholes.some((d) => d.id === selectedId);
  }, [project.drillholes, selectedId]);

  useEffect(() => {
    if (selectedId && !selectedExists) {
      setState((s) => ({ ...s, selection: { drillholeId: null, intervalId: null } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExists]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,

        // critical: avoid flex/grid min-content collapsing
        minWidth: 0,
        minHeight: 0,

        // critical: make sure canvas sits above the root background
        background: "transparent",
      }}
    >
      <SceneCanvas
        project={project}
        view={view}
        setView={(v) => setState((s) => ({ ...s, view: v }))}
        selectedId={selectedId && selectedExists ? selectedId : null}
        onSelect={(id) =>
          setState((s) => ({
            ...s,
            selection: { drillholeId: id, intervalId: null },
          }))
        }
        tokens={tokens}
        showGrid={state.scene.showGrid}
        showTerrain={state.scene.showTerrain}
      />

      {/* debug strip (safe to keep, helps instantly confirm data is flowing) */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          padding: "8px 10px",
          borderRadius: 10,
          border: `1px solid ${tokens.panelBorder}`,
          background: tokens.isDark ? "rgba(6,10,20,0.55)" : "rgba(255,255,255,0.65)",
          backdropFilter: "blur(8px)",
          color: tokens.mutedText,
          fontSize: 12,
          pointerEvents: "none",
          maxWidth: "min(520px, calc(100vw - 24px))",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        holes={project.drillholes.length} · view={view} · selected={selectedId ?? "-"}
      </div>
    </div>
  );
}
