"use client";

import React from "react";
import { Card, IconButton, Text } from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";
import { DrillholesWorkspace } from "./DrillholesWorkspace";
import { LoggingWorkspace } from "./LoggingWorkspace";
import { SettingsWorkspace } from "./SettingsWorkspace";
import { DataWorkspace } from "./DataWorkspace";

export function OverlayHost({
  state,
  setState,
  tokens,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
}) {
  if (!state.activeTool) return null;

  function closeOverlay() {
    setState((s) => ({ ...s, activeTool: null }));
  }

  function renderBody() {
    switch (state.activeTool) {
      case "drillholes":
        return <DrillholesWorkspace state={state} setState={setState} tokens={tokens} />;
      case "logging":
        return <LoggingWorkspace state={state} setState={setState} tokens={tokens} />;
      case "settings":
        return <SettingsWorkspace state={state} setState={setState} tokens={tokens} />;
      case "data":
        return <DataWorkspace state={state} setState={setState} tokens={tokens} />;
      default:
        return (
          <div style={{ padding: 14 }}>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Workspace not implemented yet: {state.activeTool}
            </Text>
          </div>
        );
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 999,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeOverlay();
      }}
    >
      <div style={{ width: "min(1100px, 100%)", height: "min(820px, calc(100vh - 80px))", minHeight: 0 }}>
        <Card
          style={{
            width: "100%",
            height: "min(820px, calc(100vh - 80px))",
            background: tokens.panelBg,
            border: `1px solid ${tokens.panelBorder}`,
            backdropFilter: "blur(12px)",
            overflow: "hidden",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            boxShadow: tokens.isDark ? "0 18px 70px rgba(0,0,0,0.55)" : "0 18px 70px rgba(0,0,0,0.18)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: `1px solid ${tokens.panelBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <Text weight="bold">{state.activeTool.toUpperCase()}</Text>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Overlay workspace
              </Text>
            </div>

            <IconButton variant="ghost" aria-label="Close" onClick={closeOverlay}>
              <Cross2Icon />
            </IconButton>
          </div>

          {/* Body */}
          <div style={{ padding: 14, height: "100%", minHeight: 0, overflow: "hidden" }}>{renderBody()}</div>
        </Card>
      </div>
    </div>
  );
}
