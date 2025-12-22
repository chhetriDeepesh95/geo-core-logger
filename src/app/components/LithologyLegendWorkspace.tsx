"use client";

import React, { useMemo, useState } from "react";
import { Button, Card, Dialog, Flex, Select, Text, TextField } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { ThemeTokens } from "../lib/theme";
import type { ProjectFile } from "../lib/model";

type RightMode = "empty" | "view" | "edit" | "create";

type Draft = {
  code: string;
  color: string;
};

function isHexColorStrict(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

function normalizeNoSilent(v: string): string {
  // IMPORTANT: this is NOT used to silently modify saved data.
  // use only for internal comparisons/validations, not for persisted writes.
  return v.trim();
}

function computeLithUsage(project: ProjectFile): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const dh of project.drillholes) {
    for (const it of dh.intervals ?? []) {
      const k = it.lith;
      usage[k] = (usage[k] ?? 0) + 1;
    }
  }
  return usage;
}

function migrateIntervalsLith(project: ProjectFile, fromCode: string, toCode: string): ProjectFile {
  // explicit migration used in rename/remap flows
  const next = {
    ...project,
    drillholes: project.drillholes.map((dh) => {
      const ints = dh.intervals ?? [];
      if (ints.length === 0) return dh;
      const changed = ints.some((it) => it.lith === fromCode);
      if (!changed) return dh;

      return {
        ...dh,
        intervals: ints.map((it) => (it.lith === fromCode ? { ...it, lith: toCode } : it)),
      };
    }),
  };
  return next;
}

function legendEntries(legend?: Record<string, string>) {
  const entries = Object.entries(legend ?? {});
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries;
}

export function LithologyLegendWorkspace({
  state,
  setState,
  tokens,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RightMode>("empty");

  // selection = selected lith code (not drillhole)
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // draft for create/edit
  const [draft, setDraft] = useState<Draft>({ code: "", color: "#888888" });
  const [formError, setFormError] = useState<string | null>(null);

  // rename confirmation (when code changes)
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameMigrate, setRenameMigrate] = useState(true);

  // delete/remap confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [remapTo, setRemapTo] = useState<string | null>(null);

  const legend = state.project.lithLegend ?? { UNKNOWN: "#888888" };

  const usage = useMemo(() => computeLithUsage(state.project), [state.project]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = legendEntries(legend);

    if (!q) return all;

    return all.filter(([code, color]) => {
      const hay = `${code} ${color} ${(usage[code] ?? 0).toString()}`.toLowerCase();
      return hay.includes(q);
    });
  }, [legend, query, usage]);

  const selected = useMemo(() => {
    if (!selectedCode) return null;
    const color = legend[selectedCode];
    if (!color) return null;
    return { code: selectedCode, color };
  }, [legend, selectedCode]);

  function setDraftField(k: keyof Draft, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function goEmpty() {
    setMode("empty");
    setSelectedCode(null);
    setDraft({ code: "", color: "#888888" });
    setFormError(null);
  }

  function pickCode(code: string) {
    setSelectedCode(code);
    setMode("view");
    setFormError(null);
  }

  function setActionCreate() {
    setMode("create");
    setSelectedCode(null);
    setDraft({ code: "", color: "#888888" });
    setFormError(null);
  }

  function setActionEdit() {
    if (!selected) return;
    setMode("edit");
    setDraft({ code: selected.code, color: selected.color });
    setFormError(null);
  }

  function validateDraft(opts: { kind: "create" | "edit"; originalCode?: string }) {
    const codeRaw = draft.code;
    const colorRaw = draft.color;

    const code = normalizeNoSilent(codeRaw);
    const color = normalizeNoSilent(colorRaw);

    if (!code) return { ok: false as const, error: "Lithology code is required." };

    if (!isHexColorStrict(color)) {
      return { ok: false as const, error: 'Color must be a strict hex value like "#A1B2C3".' };
    }

    const exists = Object.prototype.hasOwnProperty.call(legend, code);

    if (opts.kind === "create" && exists) {
      return { ok: false as const, error: `Lithology code "${code}" already exists.` };
    }

    if (opts.kind === "edit" && code !== opts.originalCode && exists) {
      return { ok: false as const, error: `Lithology code "${code}" already exists.` };
    }

    return { ok: true as const, value: { code, color } };
  }

  function applyCreate() {
    const res = validateDraft({ kind: "create" });
    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    setState((s) => ({
      ...s,
      project: {
        ...s.project,
        lithLegend: {
          ...(s.project.lithLegend ?? { UNKNOWN: "#888888" }),
          [res.value.code]: res.value.color,
        },
      },
    }));

    setSelectedCode(res.value.code);
    setMode("view");
    setFormError(null);
  }

  function requestSaveEdit() {
    if (!selected) {
      setFormError("Select a lithology first.");
      return;
    }

    const res = validateDraft({ kind: "edit", originalCode: selected.code });
    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    const originalCode = selected.code;
    const nextCode = res.value.code;
    const nextColor = res.value.color;

    const isRename = nextCode !== originalCode;
    const impacted = usage[originalCode] ?? 0;

    if (isRename && impacted > 0) {
      // explicit confirmation: rename impacts intervals
      setRenameMigrate(true);
      setRenameOpen(true);
      return;
    }

    // safe edit (color-only, or rename with 0 usage)
    applyEditCommit({ originalCode, nextCode, nextColor, migrate: isRename ? false : false });
  }

  function applyEditCommit(args: {
    originalCode: string;
    nextCode: string;
    nextColor: string;
    migrate: boolean;
  }) {
    setState((s) => {
      const baseLegend = s.project.lithLegend ?? { UNKNOWN: "#888888" };

      // rebuild legend without silent modifications
      const nextLegend: Record<string, string> = {};
      for (const [k, v] of Object.entries(baseLegend)) {
        if (k === args.originalCode) continue;
        nextLegend[k] = v;
      }
      nextLegend[args.nextCode] = args.nextColor;

      let nextProject: ProjectFile = {
        ...s.project,
        lithLegend: nextLegend,
      };

      if (args.migrate && args.originalCode !== args.nextCode) {
        nextProject = migrateIntervalsLith(nextProject, args.originalCode, args.nextCode);
      }

      return {
        ...s,
        project: nextProject,
      };
    });

    setSelectedCode(args.nextCode);
    setMode("view");
    setFormError(null);
  }

  function requestDelete() {
    if (!selected) return;

    // if used, remap required; else allow delete
    const impacted = usage[selected.code] ?? 0;

    if (impacted > 0) {
      // default remap target: UNKNOWN if present
      const defaultRemap = legend["UNKNOWN"] ? "UNKNOWN" : null;
      setRemapTo(defaultRemap);
    } else {
      setRemapTo(null);
    }

    setDeleteOpen(true);
  }

  function confirmDeleteOrRemap() {
    if (!selected) return;

    const code = selected.code;
    const impacted = usage[code] ?? 0;

    if (impacted > 0) {
      const target = remapTo;
      if (!target) {
        setFormError("Remap target is required because this lithology is used by existing intervals.");
        setDeleteOpen(false);
        return;
      }
      if (target === code) {
        setFormError("Remap target must be different from the lithology being deleted.");
        setDeleteOpen(false);
        return;
      }
      if (!legend[target]) {
        setFormError("Remap target does not exist in the legend.");
        setDeleteOpen(false);
        return;
      }

      // explicit: migrate intervals then delete legend entry
      setState((s) => {
        let nextProject = migrateIntervalsLith(s.project, code, target);

        const baseLegend = nextProject.lithLegend ?? { UNKNOWN: "#888888" };
        const nextLegend: Record<string, string> = {};
        for (const [k, v] of Object.entries(baseLegend)) {
          if (k === code) continue;
          nextLegend[k] = v;
        }

        nextProject = { ...nextProject, lithLegend: nextLegend };

        return { ...s, project: nextProject };
      });

      setDeleteOpen(false);
      setSelectedCode(target);
      setMode("view");
      setFormError(null);
      return;
    }

    // impacted == 0: safe delete only from legend
    setState((s) => {
      const baseLegend = s.project.lithLegend ?? { UNKNOWN: "#888888" };
      const nextLegend: Record<string, string> = {};
      for (const [k, v] of Object.entries(baseLegend)) {
        if (k === code) continue;
        nextLegend[k] = v;
      }
      return { ...s, project: { ...s.project, lithLegend: nextLegend } };
    });

    setDeleteOpen(false);
    // choose a new selection or empty
    const remaining = legendEntries(
      Object.fromEntries(Object.entries(legend).filter(([k]) => k !== code))
    );
    if (remaining.length) {
      setSelectedCode(remaining[0][0]);
      setMode("view");
    } else {
      goEmpty();
    }
    setFormError(null);
  }

  const rightPanel = (() => {
    if (mode === "empty") {
      return (
        <Card style={{ padding: 16 }}>
          <Text weight="bold">Lithology legend</Text>
          <br />
          <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
            Manage project-level lithology codes and colors. Logging and sections reference these codes.
          </Text>
          <div style={{ marginTop: 12 }}>
            <Button variant="solid" onClick={setActionCreate}>
              Create lithology
            </Button>
          </div>
        </Card>
      );
    }

    if (mode === "view") {
      const impacted = selected ? usage[selected.code] ?? 0 : 0;

      return (
        <div style={{ display: "grid", gap: 12 }}>
          <Card style={{ padding: 16 }}>
            <Text weight="bold">Lithology (View)</Text>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <InfoRow label="Code" value={selected?.code ?? "-"} tokens={tokens} />
              <InfoRow label="Color" value={selected?.color ?? "-"} tokens={tokens} />
              <InfoRow label="Used by intervals" value={String(impacted)} tokens={tokens} />

              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Preview
                </Text>
                <div
                  style={{
                    height: 26,
                    borderRadius: 8,
                    border: `1px solid ${tokens.panelBorder}`,
                    background: selected?.color ?? "#000000",
                  }}
                />
              </div>
            </div>

            <Flex gap="3" mt="4" wrap="wrap">
              <Button variant="solid" onClick={setActionEdit} disabled={!selected}>
                Edit
              </Button>
              <Button variant="soft" onClick={setActionCreate}>
                Create new
              </Button>
              <Button variant="soft" color="red" onClick={requestDelete} disabled={!selected}>
                Delete…
              </Button>
            </Flex>
          </Card>

          <Card style={{ padding: 16 }}>
            <Text weight="bold">Engineering rule</Text>
            <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
              Deleting a lithology that is referenced by intervals requires an explicit remap. Renaming can optionally
              migrate existing intervals.
            </Text>
          </Card>
        </div>
      );
    }

    const isCreate = mode === "create";
    const title = isCreate ? "Create lithology" : "Edit lithology";

    return (
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <Text weight="bold">{title}</Text>
          <Text size="2" style={{ color: tokens.mutedText }}>
            Project-level
          </Text>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Lithology code
              </Text>
              <TextField.Root
                value={draft.code}
                onChange={(e) => setDraftField("code", (e.target as HTMLInputElement).value)}
                placeholder="e.g., BASALT"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Color (hex)
              </Text>
              <TextField.Root
                value={draft.color}
                onChange={(e) => setDraftField("color", (e.target as HTMLInputElement).value)}
                placeholder="#A1B2C3"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Preview
            </Text>
            <div
              style={{
                height: 30,
                borderRadius: 10,
                border: `1px solid ${tokens.panelBorder}`,
                background: isHexColorStrict(draft.color.trim()) ? draft.color.trim() : "transparent",
              }}
            />
          </div>

          {formError ? (
            <Card
              style={{
                padding: 10,
                border: "1px solid rgba(255,120,120,0.35)",
                background: "rgba(255,120,120,0.08)",
              }}
            >
              <Text size="2">{formError}</Text>
            </Card>
          ) : null}

          <Flex gap="3" wrap="wrap" align="center">
            {isCreate ? (
              <>
                <Button variant="solid" onClick={applyCreate}>
                  Create
                </Button>
                <Button variant="soft" onClick={() => (selected ? setMode("view") : goEmpty())}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="solid" onClick={requestSaveEdit} disabled={!selected}>
                  Save
                </Button>
                <Button variant="soft" onClick={() => setMode("view")} disabled={!selected}>
                  Cancel
                </Button>
              </>
            )}
          </Flex>

          <Text size="2" style={{ color: tokens.mutedText }}>
            Validation is strict. No silent corrections are applied to codes or colors.
          </Text>
        </div>

        {/* Rename confirmation dialog (explicit) */}
        <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
          <Dialog.Content style={{ maxWidth: 640 }}>
            <Dialog.Title>Rename lithology code</Dialog.Title>
            <Dialog.Description>
              You are renaming a lithology that is referenced by existing intervals. Choose whether to migrate interval
              codes.
            </Dialog.Description>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <Card style={{ padding: 12 }}>
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Impacted intervals
                </Text>
                <Text weight="bold" style={{ marginTop: 4 }}>
                  {selected ? String(usage[selected.code] ?? 0) : "0"}
                </Text>
              </Card>

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={renameMigrate}
                  onChange={(e) => setRenameMigrate(e.target.checked)}
                />
                <Text size="2">Migrate existing intervals to the new code</Text>
              </label>
            </div>

            <Flex gap="3" mt="4" justify="end" wrap="wrap">
              <Dialog.Close>
                <Button variant="soft">Cancel</Button>
              </Dialog.Close>
              <Button
                variant="solid"
                onClick={() => {
                  if (!selected) return;

                  const res = validateDraft({ kind: "edit", originalCode: selected.code });
                  if (!res.ok) {
                    setFormError(res.error);
                    setRenameOpen(false);
                    return;
                  }

                  applyEditCommit({
                    originalCode: selected.code,
                    nextCode: res.value.code,
                    nextColor: res.value.color,
                    migrate: renameMigrate,
                  });

                  setRenameOpen(false);
                }}
              >
                Apply rename
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Card>
    );
  })();

  const remapCandidates = useMemo(() => {
    // used for delete/remap; exclude the code being deleted
    const entries = legendEntries(legend).map(([code]) => code);
    return selected ? entries.filter((c) => c !== selected.code) : entries;
  }, [legend, selected]);

  const impacted = selected ? usage[selected.code] ?? 0 : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14, height: "100%", minHeight: 0 }}>
      {/* Left: list */}
      <Card style={{ height: "100%", overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${tokens.panelBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <Text weight="bold">Lithology legend</Text>
            <Button variant="soft" onClick={setActionCreate}>
              Create new
            </Button>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <TextField.Root
              placeholder="Search (code, color, usage)…"
              value={query}
              onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        <div style={{ padding: 10, height: "calc(100% - 86px)", overflow: "auto" }}>
          {filtered.length === 0 ? (
            <Text size="2" style={{ color: tokens.mutedText }}>
              No lithology entries match your search.
            </Text>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {filtered.map(([code, color]) => {
                const active = code === selectedCode;
                const u = usage[code] ?? 0;

                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => pickCode(code)}
                    style={{
                      textAlign: "left",
                      borderRadius: 10,
                      border: `1px solid ${active ? tokens.selection : tokens.panelBorder}`,
                      background: active ? "rgba(90,167,255,0.10)" : "transparent",
                      padding: 10,
                      cursor: "pointer",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <Text weight="bold">{code}</Text>
                      <Text size="2" style={{ color: tokens.mutedText }}>
                        used: {u}
                      </Text>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 18px", gap: 10, alignItems: "center" }}>
                      <Text size="2" style={{ color: tokens.mutedText }}>
                        {color}
                      </Text>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          border: `1px solid ${tokens.panelBorder}`,
                          background: color,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Right: mode-driven */}
      <div style={{ height: "100%", minHeight: 0, overflow: "auto" }}>
        {rightPanel}
      </div>

      {/* Delete / Remap confirmation */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Content style={{ maxWidth: 680 }}>
          <Dialog.Title>Delete lithology</Dialog.Title>
          <Dialog.Description>
            Deleting removes the lithology from the project legend. If the code is used by intervals, an explicit remap
            is required.
          </Dialog.Description>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <Card style={{ padding: 12 }}>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Lithology
              </Text>
              <Text weight="bold" style={{ marginTop: 4 }}>
                {selected?.code ?? "-"}
              </Text>
              <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
                Used by intervals: <strong>{String(impacted)}</strong>
              </Text>
            </Card>

            {impacted > 0 ? (
              <Card style={{ padding: 12 }}>
                <Text weight="bold">Remap required</Text>
                <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
                  Choose an existing lithology code to replace references before deletion.
                </Text>

                <div style={{ marginTop: 10 }}>
                  <Select.Root value={remapTo ?? ""} onValueChange={(v) => setRemapTo(v)}>
                    <Select.Trigger placeholder="Select remap target…" />
                    <Select.Content>
                      {remapCandidates.map((c) => (
                        <Select.Item key={c} value={c}>
                          {c}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </div>
              </Card>
            ) : null}
          </div>

          <Flex gap="3" mt="4" justify="end" wrap="wrap">
            <Dialog.Close>
              <Button variant="soft">Cancel</Button>
            </Dialog.Close>
            <Button color="red" onClick={confirmDeleteOrRemap} disabled={!selected}>
              {impacted > 0 ? "Remap + Delete" : "Delete"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}

function InfoRow({ label, value, tokens }: { label: string; value: string; tokens: ThemeTokens }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "baseline" }}>
      <Text size="2" style={{ color: tokens.mutedText }}>
        {label}
      </Text>
      <Text size="2">{value}</Text>
    </div>
  );
}
