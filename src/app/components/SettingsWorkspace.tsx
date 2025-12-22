"use client";

import React, { useMemo, useState } from "react";
import { Button, Card, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";
import { LithologyLegendWorkspace } from "./LithologyLegendWorkspace";

import type { ProjectFile } from "../lib/model";

type SettingsPage = "project" | "lithology" | "coords";

export function ExportPdfButton({
  project,
  theme,
}: {
  project: ProjectFile;
  theme: "light" | "dark";
}) {
  const [busy, setBusy] = useState(false);

  async function onExport() {
    if (busy) return;

    try {
      setBusy(true);

      const res = await fetch("/api/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          theme,
          options: { includeLabels: true, pageSize: "A4" },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to generate PDF.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${(project.project?.name ?? "project").replaceAll(" ", "_")}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(typeof e?.message === "string" ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="solid" onClick={onExport} disabled={busy}>
      {busy ? "Exporting…" : "Export PDF"}
    </Button>
  );
}


export function SettingsWorkspace({
  state,
  setState,
  tokens,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
}) {
  const [page, setPage] = useState<SettingsPage>("project");

  const projectName = state.project.project.name;
  const lithCount = Object.keys(state.project.lithLegend ?? {}).length;

  const coordLabel = useMemo(() => {
    // If you later store coordinate system metadata in ProjectFile, read it here.
    // For now we display a placeholder consistent with your spec.
    return "Local Grid (labels only)";
  }, []);

  function ProjectSetup() {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Card style={{ padding: 16 }}>
            <ExportPdfButton project={state.project} theme={state.theme === "dark" ? "dark" : "light"} />
          <Text weight="bold">Project setup</Text>
          <br />
          <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
            Project-level configuration. These settings affect logging, sections, QA and exports.
          </Text>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <InfoRow label="Project" value={projectName} tokens={tokens} />
            <InfoRow label="Units" value='m (fixed)' tokens={tokens} />
            <InfoRow label="Lithology codes" value={String(lithCount)} tokens={tokens} />
            <InfoRow label="Coordinate system" value={coordLabel} tokens={tokens} />
          </div>

          <Flex gap="3" mt="4" wrap="wrap">
            <Button variant="soft" onClick={() => setPage("lithology")}>
              Manage lithology legend
            </Button>
            <Button variant="soft" onClick={() => setPage("coords")}>
              Coordinate system
            </Button>
          </Flex>
        </Card>

        <Card style={{ padding: 16 }}>
          <Text weight="bold">Engineering note</Text>
          <br />
          <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
            Lithology legend is project metadata. Logging should reference codes; edits are performed here to preserve data
            integrity and enforce safe remapping on deletion.
          </Text>
        </Card>
      </div>
    );
  }

  function CoordinateSystemStub() {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <Text weight="bold">Coordinate system</Text>
          <br />
          <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
            This will store metadata only (Local Grid vs Real-world label) without affecting units (meters) or geometry.
          </Text>

          <div style={{ marginTop: 12 }}>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Not implemented yet. When you’re ready, we will add:
            </Text>
            <ul style={{ marginTop: 8, color: tokens.mutedText, fontSize: 13, lineHeight: 1.5 }}>
              <li>Label scheme: X/Y/Z vs Easting/Northing/RL</li>
              <li>Project metadata storage in ProjectFile</li>
              <li>UI label propagation across drillholes/logging/section/export</li>
            </ul>
          </div>

          <Flex gap="3" mt="4">
            <Button variant="soft" onClick={() => setPage("project")}>
              Back
            </Button>
          </Flex>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", gap: 12 }}>
      {/* top nav */}
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <Text weight="bold">Settings</Text>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Project configuration and metadata management
            </Text>
          </div>

          <SegmentedControl.Root value={page} onValueChange={(v) => setPage(v as SettingsPage)}>
            <SegmentedControl.Item value="project">Project</SegmentedControl.Item>
            <SegmentedControl.Item value="lithology">Lithology</SegmentedControl.Item>
            <SegmentedControl.Item value="coords">Coordinates</SegmentedControl.Item>
          </SegmentedControl.Root>
        </div>
      </Card>

      {/* body */}
      <div style={{ height: "100%", minHeight: 0, overflow: "auto" }}>
        {page === "project" ? <ProjectSetup /> : null}

        {page === "lithology" ? (
          <div style={{ height: "100%", minHeight: 0 }}>
            <LithologyLegendWorkspace state={state} setState={setState} tokens={tokens} />
          </div>
        ) : null}

        {page === "coords" ? <CoordinateSystemStub /> : null}
      </div>
    </div>
  );
}

function InfoRow({ label, value, tokens }: { label: string; value: string; tokens: ThemeTokens }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "baseline" }}>
      <Text size="2" style={{ color: tokens.mutedText }}>
        {label}
      </Text>
      <Text size="2">{value}</Text>
    </div>
  );
}
