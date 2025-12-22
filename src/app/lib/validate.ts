import type { Drillhole, ProjectFile, Vec3 } from "./model";

export type ValidationIssue = {
  path: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationResult<T> =
  | { ok: true; value: T; issues: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateVec3(v: unknown, path: string): ValidationResult<Vec3> {
  const issues: ValidationIssue[] = [];
  if (typeof v !== "object" || v === null) {
    return { ok: false, issues: [{ path, message: "Expected object {x,y,z}.", severity: "error" }] };
  }
  const o = v as any;
  if (!isFiniteNumber(o.x)) issues.push({ path: `${path}.x`, message: "x must be a finite number.", severity: "error" });
  if (!isFiniteNumber(o.y)) issues.push({ path: `${path}.y`, message: "y must be a finite number.", severity: "error" });
  if (!isFiniteNumber(o.z)) issues.push({ path: `${path}.z`, message: "z must be a finite number.", severity: "error" });

  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { x: o.x, y: o.y, z: o.z }, issues: [] };
}

export function validateDrillhole(dh: unknown, path: string): ValidationResult<Drillhole> {
  const issues: ValidationIssue[] = [];
  if (typeof dh !== "object" || dh === null) {
    return { ok: false, issues: [{ path, message: "Expected drillhole object.", severity: "error" }] };
  }
  const o = dh as any;

  if (typeof o.id !== "string" || o.id.trim().length === 0) {
    issues.push({ path: `${path}.id`, message: "id must be a non-empty string.", severity: "error" });
  }

  const collarRes = validateVec3(o.collar, `${path}.collar`);
  if (!collarRes.ok) issues.push(...collarRes.issues);

  if (!isFiniteNumber(o.depth) || o.depth <= 0) {
    issues.push({ path: `${path}.depth`, message: "depth must be a finite number > 0.", severity: "error" });
  }

  // intervals validation will be added in Logging step; keep strict presence but don’t mutate
  if (o.intervals !== undefined && !Array.isArray(o.intervals)) {
    issues.push({ path: `${path}.intervals`, message: "intervals must be an array when provided.", severity: "error" });
  }

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    value: {
      id: o.id,
      collar: (o.collar as Vec3),
      depth: o.depth,
      intervals: o.intervals,
    },
    issues: [],
  };
}

export function validateProjectFile(pf: unknown): ValidationResult<ProjectFile> {
  const issues: ValidationIssue[] = [];
  if (typeof pf !== "object" || pf === null) {
    return { ok: false, issues: [{ path: "root", message: "Expected project file object.", severity: "error" }] };
  }
  const o = pf as any;

  if (typeof o.version !== "string" || o.version.trim().length === 0) {
    issues.push({ path: "version", message: "version must be a non-empty string.", severity: "error" });
  }

  if (typeof o.project !== "object" || o.project === null) {
    issues.push({ path: "project", message: "project must be an object.", severity: "error" });
  } else {
    if (typeof o.project.name !== "string" || o.project.name.trim().length === 0) {
      issues.push({ path: "project.name", message: "project.name must be a non-empty string.", severity: "error" });
    }
    if (typeof o.project.units !== "object" || o.project.units === null || o.project.units.length !== "m") {
      issues.push({ path: "project.units.length", message: 'units.length must be exactly "m".', severity: "error" });
    }
  }

  if (!Array.isArray(o.drillholes)) {
    issues.push({ path: "drillholes", message: "drillholes must be an array.", severity: "error" });
  } else {
    const ids = new Set<string>();
    o.drillholes.forEach((dh: unknown, i: number) => {
      const res = validateDrillhole(dh, `drillholes[${i}]`);
      if (!res.ok) issues.push(...res.issues);
      else {
        if (ids.has(res.value.id)) {
          issues.push({ path: `drillholes[${i}].id`, message: `Duplicate drillhole id "${res.value.id}".`, severity: "error" });
        }
        ids.add(res.value.id);
      }
    });
  }

  if (o.lithLegend !== undefined && (typeof o.lithLegend !== "object" || o.lithLegend === null || Array.isArray(o.lithLegend))) {
    issues.push({ path: "lithLegend", message: "lithLegend must be a record/object when provided.", severity: "error" });
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, value: o as ProjectFile, issues: [] };
}
