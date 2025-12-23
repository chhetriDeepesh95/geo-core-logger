"use client";

import React from "react";
import { TargetIcon, ReaderIcon, GearIcon, Pencil2Icon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";

type Tool = NonNullable<AppState["activeTool"]>;

const tools: Array<{ id: Tool; title: string; icon: React.ReactNode }> = [
  { id: "drillholes", title: "Drillholes", icon: <TargetIcon /> },
  { id: "logging", title: "Logging", icon: <Pencil2Icon /> },
  { id: "data", title: "Data", icon: <ReaderIcon /> },
  { id: "settings", title: "Settings", icon: <GearIcon /> },
];

export function LeftToolMenu({
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
        left: 12,
        top: 86,
        padding: 8,
        borderRadius: 12,
        background: tokens.panelBg,
        border: `1px solid ${tokens.panelBorder}`,
        backdropFilter: "blur(10px)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {tools.map((t) => {
        const active = state.activeTool === t.id;
        return (
          <IconButton
            key={t.id}
            variant={active ? "solid" : "soft"}
            aria-label={t.title}
            onClick={() => setState((s) => ({ ...s, activeTool: s.activeTool === t.id ? null : t.id }))}
          >
            {t.icon}
          </IconButton>
        );
      })}
    </div>
  );
}
