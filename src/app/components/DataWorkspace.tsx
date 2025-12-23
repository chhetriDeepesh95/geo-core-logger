"use client";

import React, { useMemo, useRef, useState } from "react";
import { Button, Card, Flex, Heading, Text } from "@radix-ui/themes";

import type { AppState } from "../lib/appState";
import type { ProjectFile } from "../lib/model";
import type { ThemeTokens } from "../lib/theme";

import { validateProjectFile } from "../lib/validate";
// import { DEMO_PROJECT } from "../lib/demoProject";

type Props = {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
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

function safeFileBaseName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "project";
  const base = trimmed.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w\-]+/g, "_");
  return base || "project";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseAndValidateProject(text: string): { ok: true; value: ProjectFile } | { ok: false; error: LoadError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: { title: "Invalid JSON", details: ["The selected file could not be parsed as JSON."] },
    };
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

export function DataWorkspace({ state, setState, tokens }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<LoadError | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canContinue = useMemo(() => {
    const holes = state.project?.drillholes?.length ?? 0;
    return holes > 0 || !!state.linkedFileName;
  }, [state.project, state.linkedFileName]);

  const projectName = state.project?.project?.name ?? "Project";
  const baseName = useMemo(() => safeFileBaseName(projectName), [projectName]);

  function clearMessages() {
    setErr(null);
    setInfo(null);
  }

//   function closeOverlay() {
//     setState((s) => ({ ...s, activeTool: null }));
//   }

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

//   function onContinue() {
//     clearMessages();
//     closeOverlay();
//   }

  function onNew() {
    clearMessages();
    applyProject(makeBlankProject(), null);
  }

//   function onDemo() {
//     clearMessages();
//     applyProject(DEMO_PROJECT, "demo.json");
//   }

  function onOpenClick() {
    clearMessages();
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  }

  async function onFilePicked(file: File) {
    setBusy(true);
    clearMessages();
    try {
      const text = await file.text();
      const res = parseAndValidateProject(text);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      applyProject(res.value, file.name);
    } catch {
      setErr({
        title: "Failed to load file",
        details: ["An unexpected error occurred while reading the file."],
      });
    } finally {
      setBusy(false);
    }
  }

  function onExportJson() {
    clearMessages();
    try {
      const json = JSON.stringify(state.project, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const fname = state.linkedFileName?.trim() ? state.linkedFileName.trim() : `${baseName}.json`;
      downloadBlob(blob, fname);
      setInfo("Exported JSON successfully.");
    } catch {
      setErr({ title: "Export failed", details: ["Could not serialize the current project to JSON."] });
    }
  }

  async function onExportPdf() {
    setBusy(true);
    clearMessages();
    try {
      const resp = await fetch("/api/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: state.project,
          opts: { kind: "report" },
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        setErr({
          title: "PDF export failed",
          details: [
            `Server responded with ${resp.status} ${resp.statusText}.`,
            text ? `Details: ${text}` : "No additional details were provided by the server.",
          ],
        });
        return;
      }

      const blob = await resp.blob();
      downloadBlob(blob, `${baseName}.pdf`);
      setInfo("Exported PDF successfully.");
    } catch {
      setErr({
        title: "PDF export failed",
        details: ["Could not reach the PDF export endpoint (/api/report/pdf)."],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ width: "min(980px, 100%)", margin: "0 auto", padding: 14 }}>
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Heading size="6">Data</Heading>
          {/* <Flex gap="2" wrap="wrap">
            <Button variant="soft" onClick={closeOverlay}>
              Close
            </Button>
          </Flex> */}
        </Flex>

        <Card style={{ padding: 14 }}>
          <Flex direction="column" gap="2">
            <Text weight="bold">Current project</Text>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Name: <strong>{projectName}</strong>
              {state.linkedFileName ? (
                <>
                  {" "}· File: <strong>{state.linkedFileName}</strong>
                </>
              ) : null}
              {" "}· Drillholes: <strong>{state.project.drillholes.length}</strong>
            </Text>
          </Flex>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card style={{ padding: 14 }}>
            <Flex direction="column" gap="3">
              <Text weight="bold">Open / Replace</Text>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Load a ProjectFile JSON (validated), or start from a new/demo project.
              </Text>

              <Flex gap="2" wrap="wrap">
                {/* {canContinue ? (
                  <Button disabled={busy} variant="solid" onClick={onContinue}>
                    Continue
                  </Button>
                ) : null} */}

                <Button disabled={busy} onClick={onNew}>
                  New
                </Button>

                <Button disabled={busy} variant="solid" onClick={onOpenClick}>
                  Open JSON
                </Button>

                {/* <Button disabled={busy} variant="soft" onClick={onDemo}>
                  Demo file
                </Button> */}

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

              <Text size="2" style={{ color: tokens.mutedText }}>
                Opening a file replaces the current project in memory (and local storage after save).
              </Text>
            </Flex>
          </Card>

          <Card style={{ padding: 14 }}>
            <Flex direction="column" gap="3">
              <Text weight="bold">Export</Text>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Export the current project as JSON or PDF.
              </Text>
              <Flex gap="2" wrap="wrap">
                <Button disabled={busy} variant="solid" onClick={onExportJson}>
                  Export JSON
                </Button>
                <Button disabled={busy} variant="soft" onClick={onExportPdf}>
                  Export PDF
                </Button>
              </Flex>
            </Flex>
          </Card>
        </div>

        <Card style={{ padding: 14 }}>
          <Flex direction="column" gap="2">
            <Text weight="bold">Import</Text>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Batch import (CSV wizard, coordinate mapping, QA checks) can live here next.
            </Text>
          </Flex>
        </Card>

        {info ? (
          <Card
            style={{
              padding: 12,
              border: "1px solid rgba(80, 180, 120, 0.35)",
              background: "rgba(80, 180, 120, 0.08)",
            }}
          >
            <Text size="2">{info}</Text>
          </Card>
        ) : null}

        {err ? (
          <Card
            style={{
              padding: 12,
              border: "1px solid rgba(220, 40, 40, 0.35)",
              background: "rgba(220, 40, 40, 0.08)",
            }}
          >
            <Text weight="bold">{err.title}</Text>
            <div style={{ marginTop: 8, maxHeight: 240, overflow: "auto" }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{err.details.join("\n")}</pre>
            </div>
          </Card>
        ) : null}
      </Flex>
    </div>
  );
}
