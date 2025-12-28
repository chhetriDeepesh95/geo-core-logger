"use client";

import { useEffect, useMemo, useState } from "react";
import { Theme } from "@radix-ui/themes";

import type { AppState } from "../lib/appState";
import { getThemeTokens } from "../lib/theme";
import { loadFromLocalStorage, saveToLocalStorage } from "../lib/persistence";
import type { ProjectFile } from "../lib/model";

import { SceneViewport } from "./SceneViewport";
import { LeftToolMenu } from "./LeftToolMenu";
import { TopToolbar } from "./TopToolbar";
import { OverlayHost } from "./OverlayHost";
import { WelcomeModal } from "./WelcomeModal";

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

    // deterministic initial render on both server and client
    showWelcome: true,
  };
}

export function AppRoot() {
  // IMPORTANT: do not read localStorage here; keep the initial render deterministic
  
   useEffect(() => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("sendEmail") === "restrict") return;

  const controller = new AbortController();

  async function sendTestEmail() {
    const now = new Date();

    const timeLocal = new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(now);

    const timeUtc = now.toISOString();

    const subject = "Activity notice: new visit recorded";

    const text = [
      "Hi,",
      "",
      "This is a test notification from your application.",
      "",
      `A new visit was recorded at ${timeLocal}.`,
      `UTC timestamp: ${timeUtc}`,
      "",
      "If you are receiving this unexpectedly, you can disable test emails in local settings.",
      "",
      "Regards,",
      "Your App",
    ].join("\n");

    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        toEmail: "chhetri.deepesh95@gmail.com",
        subject,
        text,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as any)?.error ?? "Send failed");

    console.log("email sent");
    return json;
  }

  sendTestEmail().catch(console.error);

  return () => controller.abort();
}, []);

  const [state, setState] = useState<AppState>(() => makeDefaultState());

  // whether the welcome should show "Continue"
  const [canContinue, setCanContinue] = useState<boolean>(false);

  // after mount, restore local state and enable Continue if a project exists
  useEffect(() => {
    const restored = loadFromLocalStorage();

    if (restored?.project) {
      setState((prev) => ({
        ...prev,
        ...restored,

        // always show welcome when an existing file is present, so user can choose Continue/New/Open/Demo
        showWelcome: true,

        // ensure these objects exist even if old snapshots are missing them
        selection: restored.selection ?? prev.selection,
        scene: restored.scene ?? prev.scene,
        section: restored.section ?? prev.section,
        camera3d: restored.camera3d ?? prev.camera3d,
        camera2d: restored.camera2d ?? prev.camera2d,
      }));
      setCanContinue(true);
    } else {
      // no stored project; welcome remains, but no Continue option
      setCanContinue(false);
      setState((prev) => ({ ...prev, showWelcome: true }));
    }
  }, []);

  // persist state (best-effort)
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

      if (isMod && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        setState((s) => ({ ...s, activeTool: "data" }));
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
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // if user closes welcome (Continue/New/Open/Demo all close it), disable Continue for future
  useEffect(() => {
    if (!state.showWelcome) setCanContinue(false);
  }, [state.showWelcome]);

  return (
    <Theme appearance={radixAppearance} accentColor="blue" radius="medium">
      <div
        style={{
          position: "relative",
          width: "100vw",
          height: "100vh",
          background: radixAppearance === "dark" ? "#070b16" : "#f6f7fb",
          overflow: "hidden",
          color: tokens.text,
        }}
      >
        <SceneViewport state={state} setState={setState} tokens={tokens} />
        <TopToolbar state={state} setState={setState} tokens={tokens} />
        <LeftToolMenu state={state} setState={setState} tokens={tokens} />
        <OverlayHost state={state} setState={setState} tokens={tokens} />

        <WelcomeModal state={state} setState={setState} canContinue={canContinue} />
      </div>
    </Theme>
  );
}
