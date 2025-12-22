"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Flex, Text, TextField, Select } from "@radix-ui/themes";
import type { AppState } from "../lib/appState";
import type { Drillhole, Interval } from "../lib/model";
import type { ThemeTokens } from "../lib/theme";
import { newId } from "../lib/ids";
import { sortIntervalsStable, validateIntervals } from "../lib/intervalValidation";

type DraftInterval = {
  from: string;
  to: string;
  lith: string;
  rqd: string;
  recovery: string;
};

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function parseFiniteStrict(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function getLithColor(lith: string, legend?: Record<string, string>): string {
  const key = lith?.trim();
  if (!key) return "#888888";
  const c = legend?.[key];
  return typeof c === "string" && c.trim() ? c : "#888888";
}

function toDraft(it: Interval): DraftInterval {
  return {
    from: fmt(it.from),
    to: fmt(it.to),
    lith: it.lith ?? "",
    rqd: it.rqd === undefined ? "" : fmt(it.rqd),
    recovery: it.recovery === undefined ? "" : fmt(it.recovery),
  };
}

function cellInputStyle(): React.CSSProperties {
  return { width: "100%", minWidth: 0 };
}

function tableStyle(): React.CSSProperties {
  return {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "separate",
    borderSpacing: "0 8px",
  };
}

export function LoggingWorkspace({
  state,
  setState,
  tokens,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  tokens: ThemeTokens;
}) {
  const [holeQuery, setHoleQuery] = useState("");

  // responsive layout: stack strip below table on narrow widths
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    function onResize() {
      setIsNarrow(window.innerWidth < 1100);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // per-record edit state for intervals
  const [editingIntervalId, setEditingIntervalId] = useState<string | null>(null);
  const [draftById, setDraftById] = useState<Record<string, DraftInterval>>({});
  const [rowErrorById, setRowErrorById] = useState<Record<string, string>>({});

  const selectedHole: Drillhole | null = useMemo(() => {
    const id = state.selection.drillholeId;
    return id ? state.project.drillholes.find((d) => d.id === id) ?? null : null;
  }, [state.project.drillholes, state.selection.drillholeId]);

  const holeList = useMemo(() => {
    const q = holeQuery.trim().toLowerCase();
    const holes = q
      ? state.project.drillholes.filter((h) => h.id.toLowerCase().includes(q))
      : state.project.drillholes;
    return [...holes].sort((a, b) => a.id.localeCompare(b.id));
  }, [state.project.drillholes, holeQuery]);

  const intervalsSorted = useMemo(() => {
    const raw = selectedHole?.intervals ?? [];
    return sortIntervalsStable(raw);
  }, [selectedHole?.intervals]);

  const validation = useMemo(() => {
    if (!selectedHole) return { issues: [], byIntervalId: {} as Record<string, any> };
    return validateIntervals(selectedHole.depth, selectedHole.intervals);
  }, [selectedHole]);

  // dropdown options for lith (legend keys + safe defaults)
  const lithOptions = useMemo(() => {
    const keys = Object.keys(state.project.lithLegend ?? {})
      .map((k) => k.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const base = ["UNKNOWN"];
    return Array.from(new Set([...base, ...keys]));
  }, [state.project.lithLegend]);

  const selectedIntervalId = state.selection.intervalId;

  function selectHole(id: string) {
    // switching hole cancels any active edit session
    setEditingIntervalId(null);
    setDraftById({});
    setRowErrorById({});
    setState((s) => ({ ...s, selection: { drillholeId: id, intervalId: null } }));
  }

  function selectInterval(intervalId: string | null) {
    setState((s) => ({ ...s, selection: { ...s.selection, intervalId } }));
  }

  function updateHoleIntervals(nextIntervals: Interval[]) {
    const sorted = sortIntervalsStable(nextIntervals);
    setState((s) => ({
      ...s,
      project: {
        ...s.project,
        drillholes: s.project.drillholes.map((h) =>
          h.id !== s.selection.drillholeId ? h : { ...h, intervals: sorted }
        ),
      },
    }));
  }

  function addInterval() {
    if (!selectedHole) return;

    const current = selectedHole.intervals ?? [];
    const last = sortIntervalsStable(current).at(-1);
    const start = last ? last.to : 0;
    const end = Math.min(selectedHole.depth, start + 1);

    const defaultLith = lithOptions[0] ?? "UNKNOWN";
    const it: Interval = { id: newId("int"), from: start, to: end, lith: defaultLith };

    updateHoleIntervals([...current, it]);
    selectInterval(it.id);

    // open record edit explicitly for the new interval
    startEdit(it.id);
  }

  function startEdit(id: string) {
    if (!selectedHole) return;
    const it = (selectedHole.intervals ?? []).find((x) => x.id === id);
    if (!it) return;

    // single active editor
    setEditingIntervalId(id);
    setDraftById((m) => ({ ...m, [id]: m[id] ?? toDraft(it) }));
    setRowErrorById((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
  }

  function cancelEdit(id: string) {
    setEditingIntervalId(null);
    setDraftById((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
    setRowErrorById((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
  }

  function setDraftField(id: string, key: keyof DraftInterval, value: string) {
    setDraftById((m) => ({
      ...m,
      [id]: { ...(m[id] ?? { from: "", to: "", lith: "", rqd: "", recovery: "" }), [key]: value },
    }));
  }

  function saveEdit(id: string) {
    if (!selectedHole) return;
    if (editingIntervalId !== id) return;

    const draft = draftById[id];
    if (!draft) return;

    const fromN = parseFiniteStrict(draft.from);
    const toN = parseFiniteStrict(draft.to);

    if (fromN === null || toN === null) {
      setRowErrorById((m) => ({ ...m, [id]: "from/to must be valid finite numbers." }));
      return;
    }
    if (!(fromN < toN)) {
      setRowErrorById((m) => ({ ...m, [id]: "from must be < to." }));
      return;
    }
    if (fromN < 0) {
      setRowErrorById((m) => ({ ...m, [id]: "from must be >= 0." }));
      return;
    }
    if (toN > selectedHole.depth) {
      setRowErrorById((m) => ({ ...m, [id]: `to exceeds hole depth (${selectedHole.depth} m).` }));
      return;
    }

    const lith = (draft.lith ?? "").trim();
    if (!lith) {
      setRowErrorById((m) => ({ ...m, [id]: "Lith must be selected." }));
      return;
    }

    const rqdN = draft.rqd.trim() === "" ? undefined : parseFiniteStrict(draft.rqd);
    if (draft.rqd.trim() !== "" && rqdN === null) {
      setRowErrorById((m) => ({ ...m, [id]: "RQD must be a valid finite number (or blank)." }));
      return;
    }

    const recN = draft.recovery.trim() === "" ? undefined : parseFiniteStrict(draft.recovery);
    if (draft.recovery.trim() !== "" && recN === null) {
      setRowErrorById((m) => ({ ...m, [id]: "Recovery must be a valid finite number (or blank)." }));
      return;
    }

    const current = selectedHole.intervals ?? [];
    const next = current.map((it) =>
      it.id !== id
        ? it
        : {
            ...it,
            from: fromN,
            to: toN,
            lith,
            rqd: rqdN,
            recovery: recN,
          }
    );

    updateHoleIntervals(next as Interval[]);

    // exit edit
    setEditingIntervalId(null);
    setDraftById((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
    setRowErrorById((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
  }

  function deleteInterval(id: string) {
    if (!selectedHole) return;

    // safety: delete only when record is explicitly in edit
    if (editingIntervalId !== id) return;

    const current = selectedHole.intervals ?? [];
    const next = current.filter((it) => it.id !== id);
    updateHoleIntervals(next);

    if (selectedIntervalId === id) selectInterval(null);

    setEditingIntervalId(null);
    setDraftById((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
    setRowErrorById((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
  }

  // strip log: lith + RQD curve
  const strip = useMemo(() => {
    if (!selectedHole) return null;

    const h = 520;
    const w = 260;

    const padTop = 10;
    const padBot = 10;
    const usableH = h - padTop - padBot;

    const depth = selectedHole.depth > 0 ? selectedHole.depth : 1;
    const yAt = (d: number) => padTop + (d / depth) * usableH;

    const leftLabelW = 44;

    const lithX = leftLabelW;
    const lithW = 140;

    const gap = 14;

    const rqdX = lithX + lithW + gap;
    const rqdW = w - rqdX - 10;

    const items = intervalsSorted.map((it) => {
      const y1 = yAt(Math.max(0, it.from));
      const y2 = yAt(Math.min(depth, it.to));
      const height = Math.max(1, y2 - y1);
      const selected = it.id === selectedIntervalId;
      const fill = getLithColor(it.lith, state.project.lithLegend);
      return { it, y1, height, selected, fill };
    });

    const rqdPts = intervalsSorted
      .map((it) => {
        const rqd = it.rqd;
        if (typeof rqd !== "number" || !Number.isFinite(rqd)) return null;
        const rqdClamped = Math.max(0, Math.min(100, rqd)); // display-only clamp
        const mid = (it.from + it.to) / 2;
        const y = yAt(Math.max(0, Math.min(depth, mid)));
        const x = rqdX + (rqdClamped / 100) * rqdW;
        return { id: it.id, x, y };
      })
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const rqdPath = rqdPts.length ? rqdPts.map((p) => `${p.x},${p.y}`).join(" ") : "";

    return { w, h, depth, yAt, items, lithX, lithW, rqdX, rqdW, rqdPts, rqdPath };
  }, [selectedHole, intervalsSorted, selectedIntervalId, state.project.lithLegend]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isNarrow ? "1fr" : "260px 1fr",
        gap: 14,
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Left: drillhole selector */}
      <Card style={{ height: "100%", overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${tokens.panelBorder}` }}>
          <Text weight="bold">Drillhole</Text>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <TextField.Root
              size="3"
              placeholder="Search drillhole ID…"
              value={holeQuery}
              onChange={(e) => setHoleQuery((e.target as HTMLInputElement).value)}
            />
            <Text size="2" style={{ color: tokens.mutedText }}>
              Selected: {selectedHole?.id ?? "None"}
            </Text>
          </div>
        </div>

        <div style={{ padding: 10, height: "calc(100% - 116px)", overflow: "auto" }}>
          {holeList.length === 0 ? (
            <Text size="2" style={{ color: tokens.mutedText }}>
              No drillholes available.
            </Text>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {holeList.map((h) => {
                const active = h.id === state.selection.drillholeId;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => selectHole(h.id)}
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
                      <Text weight="bold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.id}
                      </Text>
                      <Text size="2" style={{ color: tokens.mutedText }}>
                        {fmt(h.depth)} m
                      </Text>
                    </div>
                    <Text size="2" style={{ color: tokens.mutedText }}>
                      Intervals: {h.intervals?.length ?? 0}
                    </Text>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Right: logging */}
      <div
        style={{
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: 12,
        }}
      >
        {/* Header */}
        <Card style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <Text weight="bold">Logging</Text>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Editing is per-interval record (Edit → Save/Cancel). Background changes require explicit actions.
              </Text>
            </div>

            {/* intentionally removed: legend tab/menu */}
          </div>
        </Card>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 320px",
            gap: 12,
            height: "100%",
            minHeight: 0,
          }}
        >
          {/* Interval table */}
          <Card style={{ overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                padding: 12,
                borderBottom: `1px solid ${tokens.panelBorder}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text weight="bold">Interval table</Text>
              <Flex gap="2" align="center" wrap="wrap">
                <Button variant="soft" onClick={addInterval} disabled={!selectedHole}>
                  Add interval
                </Button>
                {editingIntervalId ? (
                  <Text size="2" style={{ color: tokens.mutedText }}>
                    Editing: <strong>{editingIntervalId.slice(-6)}</strong>
                  </Text>
                ) : null}
              </Flex>
            </div>

            {/* Validation summary */}
            <div style={{ padding: 12, borderBottom: `1px solid ${tokens.panelBorder}` }}>
              {selectedHole ? (
                validation.issues.length === 0 ? (
                  <Text size="2" style={{ color: tokens.mutedText }}>
                    No validation issues detected.
                  </Text>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    <Text size="2" style={{ color: tokens.mutedText }}>
                      Issues ({validation.issues.length}):
                    </Text>
                    <div style={{ display: "grid", gap: 4, maxHeight: 72, overflow: "auto" }}>
                      {validation.issues.slice(0, 6).map((iss: any, idx: number) => (
                        <Text
                          key={idx}
                          size="2"
                          style={{ color: iss.severity === "error" ? "rgba(255,120,120,0.95)" : tokens.mutedText }}
                        >
                          {iss.severity.toUpperCase()}: {iss.message}
                        </Text>
                      ))}
                      {validation.issues.length > 6 ? (
                        <Text size="2" style={{ color: tokens.mutedText }}>
                          …and {validation.issues.length - 6} more
                        </Text>
                      ) : null}
                    </div>
                  </div>
                )
              ) : (
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Select a drillhole to begin logging.
                </Text>
              )}
            </div>

            <div style={{ padding: 10, overflow: "auto", minHeight: 0 }}>
              {!selectedHole ? (
                <Text size="2" style={{ color: tokens.mutedText }}>
                  No drillhole selected.
                </Text>
              ) : intervalsSorted.length === 0 ? (
                <Text size="2" style={{ color: tokens.mutedText }}>
                  No intervals. Add an interval to start logging.
                </Text>
              ) : (
                <table style={tableStyle()}>
                  <colgroup>
                    <col style={{ width: 60 }} />
                    <col style={{ width: 60 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 200 }} />
                  </colgroup>

                  <thead>
                    <tr>
                      <th style={th(tokens)}>From</th>
                      <th style={th(tokens)}>To</th>
                      <th style={th(tokens)}>Lith</th>
                      <th style={th(tokens)}>RQD</th>
                      <th style={th(tokens)}>Rec</th>
                      <th style={th(tokens)}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {intervalsSorted.map((it) => {
                      const active = it.id === selectedIntervalId;
                      const isEditing = it.id === editingIntervalId;

                      const rowIssues = validation.byIntervalId[it.id] ?? [];
                      const hasError = rowIssues.some((x: any) => x.severity === "error");
                      const hasWarn = rowIssues.some((x: any) => x.severity === "warning");

                      const draft = draftById[it.id] ?? toDraft(it);
                      const rowError = rowErrorById[it.id];

                      return (
                        <tr
                          key={it.id}
                          onClick={() => selectInterval(it.id)}
                          style={{
                            background: active ? "rgba(90,167,255,0.10)" : "transparent",
                            outline: active ? `1px solid ${tokens.selection}` : `1px solid ${tokens.panelBorder}`,
                            borderRadius: 10,
                            cursor: "pointer",
                          }}
                        >
                          <td style={td()}>
                            {isEditing ? (
                              <TextField.Root
                                size="2"
                                style={cellInputStyle()}
                                value={draft.from}
                                onChange={(e) => setDraftField(it.id, "from", (e.target as HTMLInputElement).value)}
                              />
                            ) : (
                              <Text size="2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {fmt(it.from)}
                              </Text>
                            )}
                          </td>

                          <td style={td()}>
                            {isEditing ? (
                              <TextField.Root
                                size="2"
                                style={cellInputStyle()}
                                value={draft.to}
                                onChange={(e) => setDraftField(it.id, "to", (e.target as HTMLInputElement).value)}
                              />
                            ) : (
                              <Text size="2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {fmt(it.to)}
                              </Text>
                            )}
                          </td>

                          {/* LITH DROPDOWN */}
                          <td style={td()}>
                            {isEditing ? (
                              <Select.Root
                                value={(draft.lith || "").trim() || (lithOptions[0] ?? "UNKNOWN")}
                                onValueChange={(v) => setDraftField(it.id, "lith", v)}
                              >
                                <Select.Trigger style={{ width: "100%", minWidth: 0 }} />
                                <Select.Content>
                                  {lithOptions.map((k) => (
                                    <Select.Item key={k} value={k}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span
                                          style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: 3,
                                            background: getLithColor(k, state.project.lithLegend),
                                            border: `1px solid ${tokens.panelBorder}`,
                                            flex: "0 0 auto",
                                          }}
                                        />
                                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {k}
                                        </span>
                                      </div>
                                    </Select.Item>
                                  ))}
                                </Select.Content>
                              </Select.Root>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <div
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 3,
                                    background: getLithColor(it.lith, state.project.lithLegend),
                                    border: `1px solid ${tokens.panelBorder}`,
                                    flex: "0 0 auto",
                                  }}
                                />
                                <Text size="2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {it.lith || "—"}
                                </Text>
                              </div>
                            )}
                          </td>

                          <td style={td()}>
                            {isEditing ? (
                              <TextField.Root
                                size="2"
                                style={cellInputStyle()}
                                value={draft.rqd}
                                placeholder="0–100"
                                onChange={(e) => setDraftField(it.id, "rqd", (e.target as HTMLInputElement).value)}
                              />
                            ) : (
                              <Text size="2" style={{ color: it.rqd === undefined ? tokens.mutedText : tokens.text }}>
                                {it.rqd === undefined ? "—" : fmt(it.rqd)}
                              </Text>
                            )}
                          </td>

                          <td style={td()}>
                            {isEditing ? (
                              <TextField.Root
                                size="2"
                                style={cellInputStyle()}
                                value={draft.recovery}
                                placeholder="0–100"
                                onChange={(e) =>
                                  setDraftField(it.id, "recovery", (e.target as HTMLInputElement).value)
                                }
                              />
                            ) : (
                              <Text size="2" style={{ color: it.recovery === undefined ? tokens.mutedText : tokens.text }}>
                                {it.recovery === undefined ? "—" : fmt(it.recovery)}
                              </Text>
                            )}
                          </td>

                          <td style={td({ width: 120 })}>
                            <Flex gap="2" align="center" wrap="wrap">
                              {!isEditing ? (
                                <Button
                                  variant="soft"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    startEdit(it.id);
                                  }}
                                >
                                  Edit
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="solid"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      saveEdit(it.id);
                                    }}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="soft"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      cancelEdit(it.id);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="soft"
                                    color="red"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      deleteInterval(it.id);
                                    }}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}

                              <div style={{ marginLeft: 6 }}>
                                {hasError ? (
                                  <Text size="1" style={{ color: "rgba(255,120,120,0.95)" }}>
                                    ERROR
                                  </Text>
                                ) : hasWarn ? (
                                  <Text size="1" style={{ color: tokens.mutedText }}>
                                    WARN
                                  </Text>
                                ) : (
                                  <Text size="1" style={{ color: tokens.mutedText }}>
                                    OK
                                  </Text>
                                )}
                              </div>
                            </Flex>

                            {rowError ? (
                              <div style={{ marginTop: 6 }}>
                                <Text size="1" style={{ color: "rgba(255,120,120,0.95)" }}>
                                  {rowError}
                                </Text>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          {/* Strip log */}
          <Card style={{ overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${tokens.panelBorder}` }}>
              <Text weight="bold">Strip log</Text>
              <Text size="2" style={{ color: tokens.mutedText }}>
                Click interval (or RQD point) to select/highlight it.
              </Text>
            </div>

            <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", padding: 10 }}>
              {!selectedHole || !strip ? (
                <Text size="2" style={{ color: tokens.mutedText }}>
                  Select a drillhole.
                </Text>
              ) : (
                <div style={{ minWidth: strip.w, width: "fit-content", marginLeft: "auto", marginRight: "auto" }}>
                  <svg
                    width={strip.w}
                    height={strip.h}
                    viewBox={`${-8} ${-8} ${strip.w + 16} ${strip.h + 16}`}
                    overflow="visible"
                    style={{
                      display: "block",
                      border: `1px solid ${tokens.panelBorder}`,
                      background: "transparent",
                    }}
                  >
                    {(() => {
                      const TRACK_TOP = 10;
                      const TRACK_BOT = strip.h - 10;
                      const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

                      return (
                        <>
                          <rect x={0} y={0} width={strip.w} height={strip.h} fill="transparent" />

                          {Array.from({ length: 6 }).map((_, i) => {
                            const d = (strip.depth * i) / 5;
                            const yRaw = strip.yAt(d);
                            const y = clamp(yRaw, TRACK_TOP, TRACK_BOT);
                            const labelY = clamp(y - 2, TRACK_TOP + 12, TRACK_BOT - 4);

                            return (
                              <g key={i}>
                                <line x1={0} y1={y} x2={strip.w} y2={y} stroke={tokens.panelBorder} strokeWidth={1} />
                                <text x={6} y={labelY} fontSize={10} fill={tokens.mutedText}>
                                  {fmt(d)}m
                                </text>
                              </g>
                            );
                          })}

                          <rect
                            x={strip.lithX}
                            y={TRACK_TOP}
                            width={strip.lithW}
                            height={TRACK_BOT - TRACK_TOP}
                            fill="transparent"
                            stroke={tokens.panelBorder}
                            strokeWidth={1}
                          />
                          <rect
                            x={strip.rqdX}
                            y={TRACK_TOP}
                            width={strip.rqdW}
                            height={TRACK_BOT - TRACK_TOP}
                            fill="transparent"
                            stroke={tokens.panelBorder}
                            strokeWidth={1}
                          />

                          <text x={strip.lithX + 6} y={24} fontSize={11} fill={tokens.mutedText}>
                            LITH
                          </text>
                          <text x={strip.rqdX + 6} y={24} fontSize={11} fill={tokens.mutedText}>
                            RQD
                          </text>

                          {[0, 25, 50, 75, 100].map((v) => {
                            const x = strip.rqdX + (v / 100) * strip.rqdW;
                            const anchor = v === 0 ? "start" : v === 100 ? "end" : "middle";
                            const tx = v === 0 ? strip.rqdX + 2 : v === 100 ? strip.rqdX + strip.rqdW - 2 : x;

                            return (
                              <g key={v}>
                                <line x1={x} y1={TRACK_TOP} x2={x} y2={TRACK_BOT} stroke={tokens.panelBorder} strokeWidth={1} />
                                <text x={tx} y={36} fontSize={9} fill={tokens.mutedText} textAnchor={anchor as any}>
                                  {v}
                                </text>
                              </g>
                            );
                          })}

                          {strip.items.map(({ it, y1, height, selected, fill }) => {
                            const yTop = clamp(y1, TRACK_TOP, TRACK_BOT);
                            const yBot = clamp(y1 + height, TRACK_TOP, TRACK_BOT);
                            const h = Math.max(1, yBot - yTop);
                            const labelY = clamp(yTop + 14, TRACK_TOP + 14, TRACK_BOT - 4);

                            return (
                              <g key={it.id} onClick={() => selectInterval(it.id)} style={{ cursor: "pointer" }}>
                                <rect
                                  x={strip.lithX}
                                  y={yTop}
                                  width={strip.lithW}
                                  height={h}
                                  fill={fill}
                                  opacity={selected ? 0.95 : 0.75}
                                  stroke={selected ? tokens.selection : tokens.panelBorder}
                                  strokeWidth={selected ? 2 : 1}
                                />
                                <text x={strip.lithX + 6} y={labelY} fontSize={11} fill={tokens.text}>
                                  {it.lith || "—"}
                                </text>
                              </g>
                            );
                          })}

                          {strip.rqdPath ? (
                            <polyline points={strip.rqdPath} fill="none" stroke={tokens.selection} strokeWidth={2} opacity={0.9} />
                          ) : null}

                          {strip.rqdPts.map((p) => {
                            const isSel = p.id === selectedIntervalId;
                            const r = isSel ? 5 : 3.5;

                            const cx = clamp(p.x, strip.rqdX, strip.rqdX + strip.rqdW);
                            const cy = clamp(p.y, TRACK_TOP + r, TRACK_BOT - r);

                            return (
                              <g key={p.id} onClick={() => selectInterval(p.id)} style={{ cursor: "pointer" }}>
                                <circle cx={cx} cy={cy} r={r} fill={isSel ? tokens.selection : tokens.text} opacity={isSel ? 1 : 0.8} />
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>

                  {editingIntervalId ? (
                    <div style={{ marginTop: 10 }}>
                      <Text size="2" style={{ color: tokens.mutedText }}>
                        Editing interval: <strong>{editingIntervalId}</strong>
                      </Text>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function th(tokens: ThemeTokens): React.CSSProperties {
  return {
    textAlign: "left",
    fontSize: 12,
    color: tokens.mutedText,
    fontWeight: 600,
    padding: "0 8px 6px 8px",
  };
}

function td(extra?: React.CSSProperties): React.CSSProperties {
  return { padding: 8, verticalAlign: "top", ...(extra ?? {}) };
}
