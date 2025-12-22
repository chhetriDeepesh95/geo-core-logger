import type { ProjectFile } from "@/app/lib/model";
import type { ReportTheme } from "../reportHtml";

type Opts = {
  project: ProjectFile;
  width: number;
  height: number;
  includeLabels: boolean;
  selectedId: string | null;
  theme: ReportTheme;
};

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function escape(s: string) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// small deterministic hash to generate unique ids (avoids clipPath id collisions across multiple svgs)
function hashId(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // keep it short, always positive
  return (h >>> 0).toString(36);
}

export function buildPlanSvg(opts: Opts): string {
  const { project, width, height, includeLabels, selectedId, theme } = opts;
  const holes = project.drillholes ?? [];

  // IMPORTANT: make svg responsive to its container while keeping a stable coordinate system
  // - width/height 100% prevents huge intrinsic sizing that can push content to a new pdf page
  // - viewBox keeps your existing px-based math correct
  // - overflow hidden prevents paint overflow from affecting layout in chromium pdf rendering
  const uid = hashId(
    `${project.project?.name ?? "project"}|${holes.length}|${width}x${height}|${selectedId ?? ""}|${includeLabels ? "l" : "n"}`
  );
  const clipId = `clip_${uid}`;

  const svgOpen = (inner: string) => `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${width} ${height}"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style="display:block; overflow:hidden;"
    >
      ${inner}
    </svg>
  `;

  const pad = 34;
  const titleH = 34;
  const innerX = pad;
  const innerY = pad + titleH;
  const innerW = width - pad * 2;
  const innerH = height - (pad + titleH) - pad;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const h of holes) {
    minX = Math.min(minX, h.collar.x);
    maxX = Math.max(maxX, h.collar.x);
    minZ = Math.min(minZ, h.collar.z);
    maxZ = Math.max(maxZ, h.collar.z);
  }

  const empty = !holes.length || !Number.isFinite(minX);
  if (empty) {
    return svgOpen(`
      <rect x="0" y="0" width="${width}" height="${height}" fill="${theme.planBg}" />
      <text x="${pad}" y="${pad + 18}" font-size="14" fill="${theme.text}" font-weight="700">2D Plan</text>
      <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="transparent" stroke="${theme.border}" stroke-width="1"/>
      <text x="${innerX + 12}" y="${innerY + 24}" font-size="12" fill="${theme.muted}">No drillholes</text>
    `);
  }

  if (minX === maxX) { minX -= 5; maxX += 5; }
  if (minZ === maxZ) { minZ -= 5; maxZ += 5; }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const padWorld = 0.08 * Math.max(spanX, spanZ);

  minX -= padWorld; maxX += padWorld;
  minZ -= padWorld; maxZ += padWorld;

  const worldW = maxX - minX;
  const worldH = maxZ - minZ;

  const sx = innerW / worldW;
  const sz = innerH / worldH;
  const s = Math.min(sx, sz);

  const drawW = worldW * s;
  const drawH = worldH * s;

  const ox = innerX + (innerW - drawW) / 2;
  const oy = innerY + (innerH - drawH) / 2;

  const px = (x: number) => ox + (x - minX) * s;
  const py = (z: number) => oy + (maxZ - z) * s;

  const step = niceStep(Math.max(worldW, worldH) / 8);

  const gridStartX = Math.floor(minX / step) * step;
  const gridEndX = Math.ceil(maxX / step) * step;
  const gridStartZ = Math.floor(minZ / step) * step;
  const gridEndZ = Math.ceil(maxZ / step) * step;

  const pname = escape(project.project?.name ?? "Project");

  let gridLines = "";
  for (let gx = gridStartX; gx <= gridEndX + 0.5 * step; gx += step) {
    const X = px(gx);
    gridLines += `<line x1="${X}" y1="${oy}" x2="${X}" y2="${oy + drawH}" stroke="${theme.planGrid}" stroke-width="1" />`;
  }
  for (let gz = gridStartZ; gz <= gridEndZ + 0.5 * step; gz += step) {
    const Y = py(gz);
    gridLines += `<line x1="${ox}" y1="${Y}" x2="${ox + drawW}" y2="${Y}" stroke="${theme.planGrid}" stroke-width="1" />`;
  }

  let axes = "";
  if (minZ <= 0 && maxZ >= 0) {
    const Y0 = py(0);
    axes += `<line x1="${ox}" y1="${Y0}" x2="${ox + drawW}" y2="${Y0}" stroke="${theme.planAxis}" stroke-width="1.25" />`;
  }
  if (minX <= 0 && maxX >= 0) {
    const X0 = px(0);
    axes += `<line x1="${X0}" y1="${oy}" x2="${X0}" y2="${oy + drawH}" stroke="${theme.planAxis}" stroke-width="1.25" />`;
  }

  let holesSvg = "";
  for (const h of holes) {
    const cx = px(h.collar.x);
    const cy = py(h.collar.z);
    const isSel = selectedId && h.id === selectedId;
    const r = isSel ? 5 : 4;

    holesSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${isSel ? theme.planHoleSelected : theme.planHole}" stroke="${theme.planHoleStroke}" stroke-width="1" />`;

    if (includeLabels) {
      holesSvg += `<text x="${cx + 7}" y="${cy - 7}" font-size="10" fill="${theme.text}" opacity="0.92">${escape(h.id)}</text>`;
    }
  }

  // scale bar
  const sbWorld = step;
  const sbPx = sbWorld * s;
  const sbX = innerX + 12;
  const sbY = innerY + innerH - 14;

  const nx = innerX + innerW - 40;
  const ny = innerY + 28;

  // <text x="${pad}" y="${pad + 18}" font-size="14" fill="${theme.text}" font-weight="700">2D Plan</text>
  //   <text x="${pad}" y="${pad + 34}" font-size="11" fill="${theme.muted}">${pname} • ${holes.length} holes</text>

  return svgOpen(`
    <rect x="0" y="0" width="${width}" height="${height}" fill="${theme.planBg}" />
    

    <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="transparent" stroke="${theme.border}" stroke-width="1"/>

    <defs>
      <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
        <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}"/>
      </clipPath>
    </defs>

    <g clip-path="url(#${clipId})">
      ${gridLines}
      ${axes}
      ${holesSvg}
    </g>

    <line x1="${sbX}" y1="${sbY}" x2="${sbX + sbPx}" y2="${sbY}" stroke="${theme.text}" stroke-width="2" />
    <line x1="${sbX}" y1="${sbY - 5}" x2="${sbX}" y2="${sbY + 5}" stroke="${theme.text}" stroke-width="2" />
    <line x1="${sbX + sbPx}" y1="${sbY - 5}" x2="${sbX + sbPx}" y2="${sbY + 5}" stroke="${theme.text}" stroke-width="2" />
    <text x="${sbX}" y="${sbY - 8}" font-size="10" fill="${theme.muted}">${fmt(sbWorld)} m</text>

    <path d="M ${nx} ${ny + 18} L ${nx} ${ny - 10}" stroke="${theme.text}" stroke-width="2" />
    <path d="M ${nx} ${ny - 10} L ${nx - 6} ${ny} L ${nx + 6} ${ny} Z" fill="${theme.text}" />
    <text x="${nx - 5}" y="${ny + 30}" font-size="10" fill="${theme.muted}">N</text>
  `);
}
