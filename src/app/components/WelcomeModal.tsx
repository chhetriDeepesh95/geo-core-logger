"use client";

import React, { useMemo, useRef, useState } from "react";
import { Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { ProjectFile } from "../lib/model";
import { validateProjectFile } from "../lib/validate";
import { DEMO_PROJECT } from "../lib/demoProject";

type Props = {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;

  // when true, show "Continue" (resume existing loaded project)
  canContinue: boolean;
};

type LoadError = {
  title: string;
  details: string[];
};

function makeBlankProject(): ProjectFile {
  return {
    version: "1.0.0",
    project: { name: "New Project", units: { length: "m" } },
    drillholes: [],
    lithLegend: { UNKNOWN: "#888888" },
  };
}

function parseAndValidateProject(text: string): { ok: true; value: ProjectFile } | { ok: false; error: LoadError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: { title: "Invalid JSON", details: ["The selected file could not be parsed as JSON."] } };
  }

  const v = validateProjectFile(parsed);
  if (!v.ok) {
    const details =
      v.issues?.map((iss: any) => {
        const p = String(iss?.path ?? "");
        const m = String(iss?.message ?? "");
        return p ? `${p}: ${m}` : m || "Invalid value";
      }) ?? ["The JSON does not match the expected ProjectFile schema."];

    return { ok: false, error: { title: "JSON does not match ProjectFile type", details } };
  }

  return { ok: true, value: v.value };
}

export function WelcomeModal(props: Props) {
  const { state, setState, canContinue } = props;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<LoadError | null>(null);

  const subtitle = useMemo(() => {
    return "Geo Core Logger manages drillholes and interval logs in a simple JSON project format.";
  }, []);

  if (!state.showWelcome) return null;

  function closeWelcomeOnly() {
    setState((s) => ({ ...s, showWelcome: false, activeTool: null }));
  }

  function applyProject(project: ProjectFile, linkedFileName: string | null) {
    setState((s) => ({
      ...s,
      project,
      linkedFileName,
      selection: { drillholeId: null, intervalId: null },
      activeTool: null,
      showWelcome: false,
    }));
  }

  function onContinue() {
    setErr(null);
    closeWelcomeOnly();
  }

  function onNew() {
    setErr(null);
    applyProject(makeBlankProject(), null);
  }

  function onDemo() {
    setErr(null);
    applyProject(
      {
        ...DEMO_PROJECT,
        project: { ...DEMO_PROJECT.project, name: "Demo Project" },
      },
      "demo.json"
    );
  }

  function onOpenClick() {
    setErr(null);
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  }

  async function onFilePicked(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const text = await file.text();
      const res = parseAndValidateProject(text);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      applyProject(res.value, file.name);
    } catch {
      setErr({ title: "Failed to load file", details: ["An unexpected error occurred while reading the file."] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <Card style={{ width: "min(920px, 100%)", maxHeight: "90vh", overflow: "auto" }}>
        <Flex direction="column" gap="4" style={{ padding: 20 }}>
          <Heading size="7">Welcome</Heading>
          <Text size="3" color="gray">
            {subtitle}
          </Text>

          <Flex gap="3" wrap="wrap" style={{ marginTop: 12 }}>
            {canContinue ? (
              <Button disabled={busy} variant="solid" onClick={onContinue}>
                Continue
              </Button>
            ) : null}

            <Button disabled={busy} onClick={onNew}>
              New
            </Button>

            <Button disabled={busy} variant="solid" onClick={onOpenClick}>
              Open JSON
            </Button>

            <Button disabled={busy} variant="soft" onClick={onDemo}>
              Demo file
            </Button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void onFilePicked(f);
              }}
            />
          </Flex>

          {canContinue ? (
            <Text size="2" color="gray" style={{ marginTop: 6 }}>
              A previously saved project was found. Choose Continue to resume, or pick another option to replace it.
            </Text>
          ) : null}

          <Card variant="surface" style={{ marginTop: 16 }}>
            <Flex direction="column" gap="2" style={{ padding: 14 }}>
              <Heading size="4">What you can do</Heading>
              <Text size="2" color="gray">
                - Create drillholes with collar coordinates and depth
              </Text>
              <Text size="2" color="gray">
                - Log intervals (lithology, RQD, recovery, remarks)
              </Text>
              <Text size="2" color="gray">
                - Maintain a lithology legend (code → color)
              </Text>
              <Text size="2" color="gray">
                - Export reports and run QA checks
              </Text>
            </Flex>
          </Card>

          {err ? (
            <Card variant="surface" style={{ marginTop: 12, border: "1px solid rgba(220, 40, 40, 0.35)" }}>
              <Flex direction="column" gap="2" style={{ padding: 14 }}>
                <Heading size="4" style={{ color: "rgb(180, 30, 30)" }}>
                  {err.title}
                </Heading>

                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 240,
                    overflow: "auto",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 8,
                    padding: 10,
                    background: "rgba(0,0,0,0.03)",
                  }}
                >
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {err.details.join("\n")}
                  </pre>
                </div>
              </Flex>
            </Card>
          ) : null}
        </Flex>
      </Card>
    </div>
  );
}
