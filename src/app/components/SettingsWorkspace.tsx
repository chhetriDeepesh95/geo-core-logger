"use client";

import React, { useMemo, useState } from "react";
import { Button, Card, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";
import { LithologyLegendWorkspace } from "./LithologyLegendWorkspace";

type SettingsPage = "project" | "lithology" | "coords";

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
    return "Local grid (X/Y/Z)";
  }, []);

  function ProjectSetup() {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <Flex justify="end">
            <Button variant="soft" onClick={() => setState((s) => ({ ...s, activeTool: "data" }))}>
              Open Data tools
            </Button>
          </Flex>

          <Text weight="bold">Project setup</Text>
          <br />
          <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
            Project-level configuration. These settings affect logging, sections, QA and exports.
          </Text>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <InfoRow label="Project" value={projectName} tokens={tokens} />
            <InfoRow label="Units" value="m (fixed)" tokens={tokens} />
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
            Lithology legend is project metadata. Logging should reference codes; edits are performed here to preserve
            data integrity and enforce safe remapping on deletion.
          </Text>
        </Card>
      </div>
    );
  }

  function CoordinateSystemStub() {
    return (
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

        <Flex gap="3" mt="4" wrap="wrap">
          <Button variant="soft" onClick={() => setPage("project")}>
            Back
          </Button>
        </Flex>
      </Card>
    );
  }

  if (page === "lithology") {
    return <LithologyLegendWorkspace state={state} setState={setState} tokens={tokens}/>;
  }

  if (page === "coords") {
    return <CoordinateSystemStub />;
  }

  return <ProjectSetup />;
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
