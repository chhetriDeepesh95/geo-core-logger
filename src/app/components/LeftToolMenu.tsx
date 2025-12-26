"use client";

import React from "react";
import { TargetIcon, ReaderIcon, GearIcon, Pencil2Icon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import * as Tooltip from "@radix-ui/react-tooltip";

import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";

type Tool = NonNullable<AppState["activeTool"]>;

// adjust these 2 values to taste
const BTN_SIZE = 42; // button box size (px)
const ICON_SIZE = 26; // icon size (px)

const tools: Array<{ id: Tool; title: string; icon: React.ReactElement }> = [
  { id: "drillholes", title: "Drillholes", icon: <TargetIcon width={ICON_SIZE} height={ICON_SIZE} /> },
  { id: "logging", title: "Logging", icon: <Pencil2Icon width={ICON_SIZE} height={ICON_SIZE} /> },
  { id: "data", title: "Data", icon: <ReaderIcon width={ICON_SIZE} height={ICON_SIZE} /> },
  { id: "settings", title: "Settings", icon: <GearIcon width={ICON_SIZE} height={ICON_SIZE} /> },
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
    <Tooltip.Provider delayDuration={400}>
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 86,
          padding: 10,
          borderRadius: 14,
          background: tokens.panelBg,
          border: `1px solid ${tokens.panelBorder}`,
          backdropFilter: "blur(10px)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
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
                  onClick={() =>
                    setState((s) => ({ ...s, activeTool: s.activeTool === t.id ? null : t.id }))
                  }
                  style={{
                    width: BTN_SIZE,
                    height: BTN_SIZE,
                    borderRadius: 14,

                    // ensures the icon is centered even if Radix changes internals
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",

                    // optional: a little extra visual weight for large buttons
                    boxShadow: tokens.isDark
                      ? "0 10px 30px rgba(0,0,0,0.35)"
                      : "0 10px 30px rgba(0,0,0,0.12)",
                  }}
                >
                  {t.icon}
                </IconButton>
              </Tooltip.Trigger>

              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={10}
                  style={{
                    background: tokens.panelBg,
                    border: `1px solid ${tokens.panelBorder}`,
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 13,
                    color: tokens.text,
                    boxShadow: tokens.isDark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 6px 24px rgba(0,0,0,0.18)",
                    userSelect: "none",
                  }}
                >
                  {t.title}
                  <Tooltip.Arrow width={10} height={6} style={{ fill: tokens.panelBg }} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </div>
    </Tooltip.Provider>
  );
}
