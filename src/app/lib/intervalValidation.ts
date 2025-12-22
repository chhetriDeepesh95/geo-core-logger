import type { Interval } from "./model";

export type IssueSeverity = "error" | "warning";

export type IntervalIssue = {
  severity: IssueSeverity;
  message: string;
  intervalId?: string;
  field?: "from" | "to" | "lith" | "rqd" | "recovery";
};

export type IntervalValidation = {
  issues: IntervalIssue[];
  byIntervalId: Record<string, IntervalIssue[]>;
};

function push(map: Record<string, IntervalIssue[]>, id: string, issue: IntervalIssue) {
  if (!map[id]) map[id] = [];
  map[id].push(issue);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function sortIntervalsStable(intervals: Interval[]): Interval[] {
  // invariant: stored order must be by depth
  // stable sort by from then to then id
  return [...intervals].sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (a.to !== b.to) return a.to - b.to;
    return a.id.localeCompare(b.id);
  });
}

export function validateIntervals(holeDepth: number, intervals: Interval[] | undefined): IntervalValidation {
  const byIntervalId: Record<string, IntervalIssue[]> = {};
  const issues: IntervalIssue[] = [];

  if (!intervals || intervals.length === 0) {
    issues.push({ severity: "warning", message: "Hole has no intervals." });
    return { issues, byIntervalId };
  }

  const ids = new Set<string>();
  for (const it of intervals) {
    if (!it.id || typeof it.id !== "string") {
      issues.push({ severity: "error", message: "Interval missing a valid id." });
      continue;
    }
    if (ids.has(it.id)) {
      const dup: IntervalIssue = { severity: "error", message: `Duplicate interval id "${it.id}".`, intervalId: it.id };
      issues.push(dup);
      push(byIntervalId, it.id, dup);
    }
    ids.add(it.id);

    // from/to checks
    if (!isFiniteNumber(it.from)) {
      const iss: IntervalIssue = { severity: "error", message: "from must be a finite number.", intervalId: it.id, field: "from" };
      issues.push(iss); push(byIntervalId, it.id, iss);
    }
    if (!isFiniteNumber(it.to)) {
      const iss: IntervalIssue = { severity: "error", message: "to must be a finite number.", intervalId: it.id, field: "to" };
      issues.push(iss); push(byIntervalId, it.id, iss);
    }

    if (isFiniteNumber(it.from) && isFiniteNumber(it.to)) {
      if (!(it.from < it.to)) {
        const iss: IntervalIssue = { severity: "error", message: "from must be < to.", intervalId: it.id };
        issues.push(iss); push(byIntervalId, it.id, iss);
      }
      if (it.from < 0) {
        const iss: IntervalIssue = { severity: "error", message: "from must be >= 0.", intervalId: it.id, field: "from" };
        issues.push(iss); push(byIntervalId, it.id, iss);
      }
      if (it.to > holeDepth) {
        const iss: IntervalIssue = { severity: "error", message: `to exceeds hole depth (${holeDepth} m).`, intervalId: it.id, field: "to" };
        issues.push(iss); push(byIntervalId, it.id, iss);
      }
    }

    // lith
    if (typeof it.lith !== "string" || it.lith.trim().length === 0) {
      const iss: IntervalIssue = { severity: "warning", message: "Lithology code is blank.", intervalId: it.id, field: "lith" };
      issues.push(iss); push(byIntervalId, it.id, iss);
    }

    // rqd/recovery
    if (it.rqd !== undefined) {
      if (!isFiniteNumber(it.rqd) || it.rqd < 0 || it.rqd > 100) {
        const iss: IntervalIssue = { severity: "warning", message: "RQD should be within 0–100.", intervalId: it.id, field: "rqd" };
        issues.push(iss); push(byIntervalId, it.id, iss);
      }
    }
    if (it.recovery !== undefined) {
      if (!isFiniteNumber(it.recovery) || it.recovery < 0 || it.recovery > 100) {
        const iss: IntervalIssue = { severity: "warning", message: "Recovery should be within 0–100.", intervalId: it.id, field: "recovery" };
        issues.push(iss); push(byIntervalId, it.id, iss);
      }
    }
  }

  // overlap + gaps (only for intervals with finite from/to)
  const clean = intervals
    .filter((i) => isFiniteNumber(i.from) && isFiniteNumber(i.to))
    .map((i) => ({ ...i }));

  const sorted = sortIntervalsStable(clean);
  let prevEnd: number | null = null;
  for (const it of sorted) {
    if (prevEnd !== null) {
      if (it.from < prevEnd) {
        const iss: IntervalIssue = { severity: "error", message: "Overlaps previous interval.", intervalId: it.id };
        issues.push(iss); push(byIntervalId, it.id, iss);
      } else if (it.from > prevEnd) {
        // gap warning (non-blocking)
        const iss: IntervalIssue = { severity: "warning", message: `Depth gap from ${prevEnd} to ${it.from} m.`, intervalId: it.id };
        issues.push(iss); push(byIntervalId, it.id, iss);
      }
    }
    prevEnd = it.to;
  }

  return { issues, byIntervalId };
}
