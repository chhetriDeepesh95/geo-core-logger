import type { ProjectFile } from "@/app/lib/model";

export function computeStats(project: ProjectFile) {
  const holes = project.drillholes ?? [];
  const holeCount = holes.length;

  const totalMeters = holes.reduce((s, h) => s + (Number.isFinite(h.depth) ? h.depth : 0), 0);
  const avgDepth = holeCount ? totalMeters / holeCount : 0;

  let intervalCount = 0;
  let withRqd = 0;
  let withRec = 0;

  for (const h of holes) {
    const ints = h.intervals ?? [];
    intervalCount += ints.length;
    for (const it of ints) {
      if (typeof it.rqd === "number" && Number.isFinite(it.rqd)) withRqd += 1;
      if (typeof it.recovery === "number" && Number.isFinite(it.recovery)) withRec += 1;
    }
  }

  const withRqdPct = intervalCount ? Math.round((withRqd / intervalCount) * 100) : 0;
  const withRecPct = intervalCount ? Math.round((withRec / intervalCount) * 100) : 0;

  return { holeCount, totalMeters, avgDepth, intervalCount, withRqdPct, withRecPct };
}
