"use client";

import React, { useMemo, useState } from "react";
import { Button, Card, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { Drillhole, Vec3 } from "../lib/model";
import type { ThemeTokens } from "../lib/theme";
import { newId } from "../lib/ids";

type SortKey = "id" | "depth" | "x" | "y" | "z";
type RightMode = "empty" | "view" | "edit" | "create";

function parseNumberStrict(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function formatNum(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function sortDrillholes(holes: Drillhole[], key: SortKey, dir: "asc" | "desc"): Drillhole[] {
  const s = [...holes].sort((a, b) => {
    const av =
      key === "id"
        ? a.id
        : key === "depth"
          ? a.depth
          : key === "x"
            ? a.collar.x
            : key === "y"
              ? a.collar.y
              : a.collar.z;

    const bv =
      key === "id"
        ? b.id
        : key === "depth"
          ? b.depth
          : key === "x"
            ? b.collar.x
            : key === "y"
              ? b.collar.y
              : b.collar.z;

    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv);
    return (av as number) - (bv as number);
  });

  return dir === "asc" ? s : s.reverse();
}

function makeEmptyDraft() {
  return { id: "", depth: "", x: "", y: "", z: "" };
}

export function DrillholesWorkspace({
  state,
  setState,
  tokens,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
}) {
  // left side list controls
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // right side mode
  const [mode, setMode] = useState<RightMode>("empty");

  // draft used for create/edit
  const [draft, setDraft] = useState(() => makeEmptyDraft());
  const [formError, setFormError] = useState<string | null>(null);

  // selection
  const selected = useMemo(() => {
    const id = state.selection.drillholeId;
    return id ? state.project.drillholes.find((d) => d.id === id) ?? null : null;
  }, [state.project.drillholes, state.selection.drillholeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? state.project.drillholes.filter((d) => {
          const hay = `${d.id} ${d.depth} ${d.collar.x} ${d.collar.y} ${d.collar.z}`.toLowerCase();
          return hay.includes(q);
        })
      : state.project.drillholes;

    return sortDrillholes(base, sortKey, sortDir);
  }, [state.project.drillholes, query, sortKey, sortDir]);

  function setDraftField(k: keyof typeof draft, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function loadDraftFromHole(dh: Drillhole) {
    setDraft({
      id: dh.id,
      depth: formatNum(dh.depth),
      x: formatNum(dh.collar.x),
      y: formatNum(dh.collar.y),
      z: formatNum(dh.collar.z),
    });
    setFormError(null);
  }

  function validateDraft(opts: { kind: "create" | "edit"; originalId?: string }) {
    const id = draft.id.trim();
    if (!id) return { ok: false as const, error: "Drillhole ID is required." };

    const depthN = parseNumberStrict(draft.depth);
    if (depthN === null) return { ok: false as const, error: "Depth must be a valid finite number." };
    if (depthN <= 0) return { ok: false as const, error: "Depth must be > 0." };

    const xN = parseNumberStrict(draft.x);
    const yN = parseNumberStrict(draft.y);
    const zN = parseNumberStrict(draft.z);
    if (xN === null || yN === null || zN === null) {
      return { ok: false as const, error: "Collar coordinates X/Y/Z must be valid finite numbers." };
    }

    const exists = state.project.drillholes.some((d) => d.id === id);
    if (opts.kind === "create" && exists) {
      return { ok: false as const, error: `A drillhole with ID "${id}" already exists.` };
    }
    if (opts.kind === "edit" && id !== opts.originalId && exists) {
      return { ok: false as const, error: `A drillhole with ID "${id}" already exists.` };
    }

    const collar: Vec3 = { x: xN, y: yN, z: zN };
    const hole: Drillhole = { id, depth: depthN, collar };
    return { ok: true as const, value: hole };
  }

  // left list click -> sets global selection and opens VIEW mode automatically
  function onPickHole(id: string) {
    setState((s) => ({ ...s, selection: { drillholeId: id, intervalId: null } }));
    setActionView();
  }

  function setActionView() {
    setFormError(null);
    setMode("view");
  }

  function setActionEdit() {
    if (!selected) return;
    loadDraftFromHole(selected);
    setMode("edit");
  }

  function setActionCreate() {
    setDraft(makeEmptyDraft());
    // sensible defaults (engineering)
    setDraft((d) => ({ ...d, depth: "50", x: "0", y: "0", z: "0" }));
    setFormError(null);
    setMode("create");
  }

  function applyCreate() {
    const res = validateDraft({ kind: "create" });
    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    setState((s) => ({
      ...s,
      project: { ...s.project, drillholes: [...s.project.drillholes, res.value] },
      selection: { drillholeId: res.value.id, intervalId: null },
    }));

    setMode("view");
    setFormError(null);
  }

  function applyEdit() {
    if (!selected) {
      setFormError("Select a drillhole first.");
      return;
    }

    const res = validateDraft({ kind: "edit", originalId: selected.id });
    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    setState((s) => {
      const updated = s.project.drillholes.map((d) => {
        if (d.id !== selected.id) return d;
        return {
          ...d,
          id: res.value.id,
          depth: res.value.depth,
          collar: res.value.collar,
          // preserve intervals if any
          intervals: d.intervals,
        };
      });

      return {
        ...s,
        project: { ...s.project, drillholes: updated },
        selection: { drillholeId: res.value.id, intervalId: null },
      };
    });

    setMode("view");
    setFormError(null);
  }

  // delete
  const [deleteOpen, setDeleteOpen] = useState(false);

  function requestDelete() {
    if (!selected) return;
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!selected) return;

    setState((s) => {
      const nextHoles = s.project.drillholes.filter((d) => d.id !== selected.id);
      const nextSelected = nextHoles.length ? sortDrillholes(nextHoles, "id", "asc")[0].id : null;

      return {
        ...s,
        project: { ...s.project, drillholes: nextHoles },
        selection: { drillholeId: nextSelected, intervalId: null },
      };
    });

    setDeleteOpen(false);
    setDraft(makeEmptyDraft());
    setFormError(null);

    // if any hole remains, go to view; else empty
    setMode(state.project.drillholes.length > 1 ? "view" : "empty");
  }

  // right panel content
  const rightPanel = (() => {
    if (mode === "empty") {
      return (
        <Card style={{ padding: 16 }}>
          <Text weight="bold">No drillhole selected</Text>
          <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
            Select a drillhole from the list, or create a new drillhole.
          </Text>
          <div style={{ marginTop: 12 }}>
            <Button variant="solid" onClick={setActionCreate}>
              Create new drillhole
            </Button>
          </div>
        </Card>
      );
    }

    if (mode === "view") {
      return (
        <div style={{ display: "grid", gap: 12 }}>
          <Card style={{ padding: 16 }}>
            <Text weight="bold">Drillhole (View)</Text>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <InfoRow label="ID" value={selected?.id ?? "-"} tokens={tokens} />
              <InfoRow label="Depth (m)" value={selected ? formatNum(selected.depth) : "-"} tokens={tokens} />
              <InfoRow
                label="Collar"
                value={
                  selected
                    ? `(${formatNum(selected.collar.x)}, ${formatNum(selected.collar.y)}, ${formatNum(selected.collar.z)})`
                    : "-"
                }
                tokens={tokens}
              />
              <InfoRow
                label="Intervals"
                value={selected?.intervals?.length ? String(selected.intervals.length) : "0"}
                tokens={tokens}
              />
            </div>

            <Flex gap="3" mt="4" wrap="wrap">
              <Button variant="solid" onClick={setActionEdit} disabled={!selected}>
                Edit
              </Button>
              <Button variant="soft" color="red" onClick={requestDelete} disabled={!selected}>
                Delete…
              </Button>
            </Flex>
          </Card>

          <Card style={{ padding: 16 }}>
            <Text weight="bold">Engineering notes</Text>
            <Text size="2" style={{ color: tokens.mutedText, marginTop: 6 }}>
              This view is read-only by default. Use Edit to change collar/depth. Delete requires confirmation and
              removes intervals safely.
            </Text>
          </Card>
        </div>
      );
    }

    const isCreate = mode === "create";

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <Text weight="bold">{isCreate ? "Create drillhole" : "Edit drillhole"}</Text>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Units: m
            </Text>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Drillhole ID
                </Text>
                <TextField.Root
                  value={draft.id}
                  onChange={(e) => setDraftField("id", (e.target as HTMLInputElement).value)}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Depth (m)
                </Text>
                <TextField.Root
                  value={draft.depth}
                  onChange={(e) => setDraftField("depth", (e.target as HTMLInputElement).value)}
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Collar X
                </Text>
                <TextField.Root
                  value={draft.x}
                  onChange={(e) => setDraftField("x", (e.target as HTMLInputElement).value)}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Collar Y
                </Text>
                <TextField.Root
                  value={draft.y}
                  onChange={(e) => setDraftField("y", (e.target as HTMLInputElement).value)}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Collar Z (RL)
                </Text>
                <TextField.Root
                  value={draft.z}
                  onChange={(e) => setDraftField("z", (e.target as HTMLInputElement).value)}
                />
              </div>
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
                  <Button
                    variant="soft"
                    onClick={() => {
                      setDraftField("id", newId("dh"));
                      setFormError(null);
                    }}
                  >
                    Random ID
                  </Button>
                  <Button variant="soft" onClick={() => setMode(selected ? "view" : "empty")}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="solid" onClick={applyEdit} disabled={!selected}>
                    Save edits
                  </Button>
                  <Button variant="soft" onClick={setActionView}>
                    Cancel
                  </Button>
                </>
              )}
            </Flex>

            {!isCreate && selected ? (
              <Text size="2" style={{ color: tokens.mutedText }}>
                Editing preserves intervals; only ID/collar/depth are changed here.
              </Text>
            ) : null}
          </div>
        </Card>
      </div>
    );
  })();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14, height: "100%", minHeight: 0 }}>
      {/* Left: list */}
      <Card style={{ height: "100%", overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${tokens.panelBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <Text weight="bold">Drillholes</Text>
            <Button variant="soft" onClick={setActionCreate}>
              Create new
            </Button>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <TextField.Root
              placeholder="Search (ID, depth, collar)…"
              value={query}
              onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <TextField.Root
                placeholder="Sort key (id/depth/x/y/z)"
                value={sortKey}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
                  const allowed: SortKey[] = ["id", "depth", "x", "y", "z"];
                  if (allowed.includes(v as SortKey)) setSortKey(v as SortKey);
                }}
              />
              <Button variant="soft" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                {sortDir.toUpperCase()}
              </Button>
            </div>
          </div>
        </div>

        <div style={{ padding: 10, height: "calc(100% - 132px)", overflow: "auto" }}>
          {filtered.length === 0 ? (
            <Text size="2" style={{ color: tokens.mutedText }}>
              No drillholes match your search.
            </Text>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {filtered.map((d) => {
                const active = d.id === state.selection.drillholeId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onPickHole(d.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: 10,
                      border: `1px solid ${active ? tokens.selection : tokens.panelBorder}`,
                      background: active ? "rgba(90,167,255,0.10)" : "transparent",
                      padding: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <Text weight="bold">{d.id}</Text>
                      <Text size="2" style={{ color: tokens.mutedText }}>
                        {formatNum(d.depth)} m
                      </Text>
                    </div>
                    <Text size="2" style={{ color: tokens.mutedText }}>
                      Collar: ({formatNum(d.collar.x)}, {formatNum(d.collar.y)}, {formatNum(d.collar.z)})
                    </Text>
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

      {/* Delete confirmation */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Content style={{ maxWidth: 520 }}>
          <Dialog.Title>Delete drillhole</Dialog.Title>
          <Dialog.Description>
            This action will permanently remove the drillhole and all of its intervals. This cannot be undone.
          </Dialog.Description>

          <div style={{ marginTop: 12 }}>
            <Text size="2" style={{ color: tokens.mutedText }}>
              Drillhole: <strong>{selected?.id ?? "-"}</strong>
            </Text>
          </div>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft">Cancel</Button>
            </Dialog.Close>
            <Button color="red" onClick={confirmDelete}>
              Delete
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
