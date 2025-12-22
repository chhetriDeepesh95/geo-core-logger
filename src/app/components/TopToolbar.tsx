"use client";

import React from "react";
import { Button, Text } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";

export function TopToolbar({
  state,
  setState,
  tokens,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        right: 12,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        borderRadius: 10,
        background: tokens.panelBg,
        border: `1px solid ${tokens.panelBorder}`,
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <Text size="3" weight="bold">
          {state.project.project.name}
        </Text>
        <Text size="2" style={{ color: tokens.mutedText }}>
          {state.mode === "workspace3d" ? "3D Workspace" : "Section Workspace"} ·{" "}
          {state.view === "view3d" ? "3D View" : "2D Plan"}
        </Text>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Button
          variant="soft"
          onClick={() => setState((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }))}
        >
          Theme
        </Button>

        <Button
          variant="soft"
          onClick={() => setState((s) => ({ ...s, mode: s.mode === "workspace3d" ? "section" : "workspace3d" }))}
        >
          Mode
        </Button>
      </div>
    </div>
  );
}
