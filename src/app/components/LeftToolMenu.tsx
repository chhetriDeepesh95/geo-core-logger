"use client";

import React from "react";
import { TargetIcon, ReaderIcon, GearIcon, Pencil2Icon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import * as Tooltip from "@radix-ui/react-tooltip";

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
    <>
    <Tooltip.Provider delayDuration={400}>
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

            <Tooltip.Root key={t.id}>
              <Tooltip.Trigger asChild>
                <IconButton
                  variant={active ? "solid" : "soft"}
                  aria-label={t.title}
                  onClick={() => setState((s) => ({ ...s, activeTool: s.activeTool === t.id ? null : t.id }))}
                  >
                  {t.icon}
                </IconButton>
              </Tooltip.Trigger>

              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  style={{
                    background: tokens.panelBg,
                    border: `1px solid ${tokens.panelBorder}`,
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 12,
                    // fontFamily: "inherit",
                    color: tokens.text,
                    boxShadow: tokens.isDark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 6px 24px rgba(0,0,0,0.18)",
                    userSelect: "none",
                  }}
                  >
                  {t.title}
                  <Tooltip.Arrow width={8} height={4} style={{ fill: tokens.panelBg }} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </div>
    </Tooltip.Provider>
        </>
    
  );
}
