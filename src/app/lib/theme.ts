import type { ThemeMode } from "./appState";

export type ThemeTokens = {
  panelBg: string;
  panelBorder: string;
  text: string;
  mutedText: string;

  accent: string;
  selection: string;

  gridMajor: string;
  gridMinor: string;
  terrainWire: string;

  drillhole: string;
  drillholeSelected: string;
  collar: string;
  collarSelected: string;

  isDark: boolean
};

export function getThemeTokens(mode: ThemeMode): ThemeTokens {
  if (mode === "dark") {
    return {
      panelBg: "rgba(10, 18, 35, 0.78)",
      panelBorder: "rgba(255,255,255,0.10)",
      text: "rgba(255,255,255,0.92)",
      mutedText: "rgba(255,255,255,0.70)",

      accent: "#5aa7ff",
      selection: "#8cc7ff",

      gridMajor: "rgba(3, 37, 88, 0)",
      gridMinor: "rgba(1, 20, 49, 0)",
      terrainWire: "rgba(218, 13, 13, 1)",

      drillhole: "rgba(200,220,255,0.55)",
      drillholeSelected: "rgba(140,199,255,0.95)",
      collar: "rgba(255,255,255,0.65)",
      collarSelected: "rgba(140,199,255,0.95)",

      isDark: true
    };
  }

  return {
    panelBg: "rgba(255,255,255,0.80)",
    panelBorder: "rgba(0,0,0,0.10)",
    text: "rgba(10,10,12,0.92)",
    mutedText: "rgba(10,10,12,0.68)",

    accent: "#1d5bd8",
    selection: "#2a6df0",

    gridMajor: "rgba(151, 151, 151, 0)",
    gridMinor: "rgba(209, 208, 208, 0)",
    terrainWire: "rgba(120, 30, 30, 0.9)",

    drillhole: "rgb(172, 172, 172)",
    drillholeSelected: "rgb(0, 0, 0)",
    collar: "rgb(172, 172, 172)",
    collarSelected: "rgb(0, 0, 0)",

    isDark: false

  };
}
