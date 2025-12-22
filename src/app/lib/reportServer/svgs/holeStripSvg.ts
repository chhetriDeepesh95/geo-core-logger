import type { Drillhole, Interval } from "@/app/lib/model";
import type { ReportTheme } from "../reportHtml";

type Opts = {
  hole: Drillhole;
  legend: Record<string, string>;
  width: number;
  height: number;
  theme: ReportTheme;
};

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function esc(s: string): string {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function getLithColor(lith: string, legend: Record<string, string>) {
  const k = (lith ?? "").trim();
  const c = legend?.[k];
  if (typeof c === "string" && c.trim()) return c.trim();
  return "#888888";
}

// deterministic small hash for stable unique ids (avoids clipPath collisions across multiple svgs)
function hashId(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function buildHoleStripSvg(opts: Opts): string {
  const { hole, legend, width, height, theme } = opts;

  const intervals = (hole.intervals ?? []).slice().sort((a, b) => a.from - b.from);

  // make svg responsive + safe for pdf rendering
  const uid = hashId(`${hole.id}|${width}x${height}|${hole.depth}|${intervals.length}`);
  const clipId = `clip_strip_${uid}`;

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

  const pad = 16;
  const top = 18;
  const bottom = 16;
  const usableH = height - top - bottom;

  const depth = hole.depth > 0 ? hole.depth : 1;
  const yAt = (d: number) => top + (d / depth) * usableH;

  const leftLabelW = 48;
  const lithX = leftLabelW;
  const lithW = 220;
  const gap = 18;

  const rqdX = lithX + lithW + gap;
  const rqdW = 220;

  const recX = rqdX + rqdW + gap;
  const recW = width - recX - pad;

  const trackTop = top;
  const trackBot = top + usableH;

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const depthTicks = 6;
  let tickLines = "";
  for (let i = 0; i < depthTicks; i++) {
    const d = (depth * i) / (depthTicks - 1);
    const yRaw = yAt(d);
    const y = clamp(yRaw, trackTop, trackBot);
    tickLines += `
      <line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${theme.border}" stroke-width="1"/>
      <text x="6" y="${clamp(y - 2, trackTop + 12, trackBot - 4)}" font-size="10" fill="${theme.muted}">${fmt(d)}m</text>
    `;
  }

  // Lith blocks
  let lithBlocks = "";
  for (const it of intervals) {
    const y1 = yAt(Math.max(0, it.from));
    const y2 = yAt(Math.min(depth, it.to));
    const yTop = clamp(y1, trackTop, trackBot);
    const yBot = clamp(y2, trackTop, trackBot);
    const h = Math.max(1, yBot - yTop);

    const fill = getLithColor(it.lith, legend);
    const labelY = clamp(yTop + 14, trackTop + 14, trackBot - 4);

    lithBlocks += `
      <rect x="${lithX}" y="${yTop}" width="${lithW}" height="${h}"
            fill="${fill}" opacity="0.78" stroke="${theme.border}" stroke-width="1"/>
      <text x="${lithX + 8}" y="${labelY}" font-size="11" fill="${theme.text}">${esc(it.lith || "—")}</text>
    `;
  }

  // RQD points (midpoint per interval)
  const rqdPts = intervals
    .map((it) => {
      if (typeof it.rqd !== "number" || !Number.isFinite(it.rqd)) return null;
      const v = Math.max(0, Math.min(100, it.rqd));
      const mid = (it.from + it.to) / 2;
      const y = yAt(clamp(mid, 0, depth));
      const x = rqdX + (v / 100) * rqdW;
      return { x, y: clamp(y, trackTop + 3, trackBot - 3) };
    })
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const rqdPath = rqdPts.length ? rqdPts.map((p) => `${p.x},${p.y}`).join(" ") : "";

  // Recovery points
  const recPts = intervals
    .map((it) => {
      if (typeof it.recovery !== "number" || !Number.isFinite(it.recovery)) return null;
      const v = Math.max(0, Math.min(100, it.recovery));
      const mid = (it.from + it.to) / 2;
      const y = yAt(clamp(mid, 0, depth));
      const x = recX + (v / 100) * recW;
      return { x, y: clamp(y, trackTop + 3, trackBot - 3) };
    })
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const recPath = recPts.length ? recPts.map((p) => `${p.x},${p.y}`).join(" ") : "";

  // Track frames and labels
  const tracks = `
    <rect x="${lithX}" y="${trackTop}" width="${lithW}" height="${trackBot - trackTop}" fill="transparent" stroke="${theme.border}" stroke-width="1"/>
    <rect x="${rqdX}" y="${trackTop}" width="${rqdW}" height="${trackBot - trackTop}" fill="transparent" stroke="${theme.border}" stroke-width="1"/>
    <rect x="${recX}" y="${trackTop}" width="${recW}" height="${trackBot - trackTop}" fill="transparent" stroke="${theme.border}" stroke-width="1"/>

    <text x="${lithX + 8}" y="${top + 14}" font-size="11" fill="${theme.muted}" font-weight="700">LITH</text>
    <text x="${rqdX + 8}" y="${top + 14}" font-size="11" fill="${theme.muted}" font-weight="700">RQD</text>
    <text x="${recX + 8}" y="${top + 14}" font-size="11" fill="${theme.muted}" font-weight="700">REC</text>
  `;

  // 0-100 vertical guides for RQD/REC
  const guides = [0, 25, 50, 75, 100]
    .map((v) => {
      const xr = rqdX + (v / 100) * rqdW;
      const xc = recX + (v / 100) * recW;
      const a = v === 0 ? "start" : v === 100 ? "end" : "middle";
      const txr = v === 0 ? rqdX + 2 : v === 100 ? rqdX + rqdW - 2 : xr;
      const txc = v === 0 ? recX + 2 : v === 100 ? recX + recW - 2 : xc;

      return `
        <line x1="${xr}" y1="${trackTop}" x2="${xr}" y2="${trackBot}" stroke="${theme.grid}" stroke-width="1"/>
        <text x="${txr}" y="${top + 30}" font-size="9" fill="${theme.muted}" text-anchor="${a}">${v}</text>

        <line x1="${xc}" y1="${trackTop}" x2="${xc}" y2="${trackBot}" stroke="${theme.grid}" stroke-width="1"/>
        <text x="${txc}" y="${top + 30}" font-size="9" fill="${theme.muted}" text-anchor="${a}">${v}</text>
      `;
    })
    .join("");

  const curves = `
    ${rqdPath ? `<polyline points="${rqdPath}" fill="none" stroke="${theme.accent}" stroke-width="2" opacity="0.95"/>` : ""}
    ${recPath ? `<polyline points="${recPath}" fill="none" stroke="${theme.accent2}" stroke-width="2" opacity="0.95"/>` : ""}

    ${rqdPts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${theme.accent}" opacity="0.95"/>`).join("")}
    ${recPts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${theme.accent2}" opacity="0.95"/>`).join("")}
  `;

  // clip everything to the svg viewport (prevents any stroke/text from affecting pagination)
  return svgOpen(`
    <defs>
      <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
        <rect x="0" y="0" width="${width}" height="${height}" />
      </clipPath>
    </defs>

    <g clip-path="url(#${clipId})">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
      ${tickLines}
      ${tracks}
      ${guides}
      ${lithBlocks}
      ${curves}
    </g>
  `);
}
