import type { Drillhole, Interval, ProjectFile } from "@/app/lib/model";
import { buildPlanSvg } from "./svgs/planSvg";
import { buildHoleStripSvg } from "./svgs/holeStripSvg";
import { computeStats } from "./stats";

export function validateProjectFileOrThrow(p: ProjectFile) {
  // strict, fail-safe validation (no silent corrections)
  if (!p || typeof p !== "object") throw new Error("ProjectFile missing.");
  if (typeof p.version !== "string" || !p.version.trim()) throw new Error("ProjectFile.version missing/invalid.");
  if (!p.project || typeof p.project !== "object") throw new Error("ProjectFile.project missing.");
  if (typeof p.project.name !== "string") throw new Error("ProjectFile.project.name missing/invalid.");
  if (!p.project.units || p.project.units.length !== "m") throw new Error(`Units must be meters (units.length="m").`);
  if (!Array.isArray(p.drillholes)) throw new Error("ProjectFile.drillholes must be an array.");

  const ids = new Set<string>();
  for (const h of p.drillholes) {
    validateHoleOrThrow(h);

    if (ids.has(h.id)) throw new Error(`Duplicate drillhole id: "${h.id}".`);
    ids.add(h.id);

    if (h.intervals !== undefined) {
      if (!Array.isArray(h.intervals)) throw new Error(`Drillhole "${h.id}" intervals must be an array.`);
      validateIntervalsOrThrow(h.id, h.depth, h.intervals);
      // rule: intervals must always be ordered by depth
      for (let i = 1; i < h.intervals.length; i++) {
        if (h.intervals[i - 1].from > h.intervals[i].from) {
          throw new Error(`Drillhole "${h.id}" intervals not ordered by depth (from).`);
        }
      }
    }
  }
}

function validateHoleOrThrow(h: Drillhole) {
  if (!h || typeof h !== "object") throw new Error("Invalid drillhole record.");
  if (typeof h.id !== "string" || !h.id.trim()) throw new Error("Drillhole.id missing/invalid.");
  if (!h.collar || typeof h.collar !== "object") throw new Error(`Drillhole "${h.id}" collar missing.`);
  for (const k of ["x", "y", "z"] as const) {
    const v = h.collar[k];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Drillhole "${h.id}" collar.${k} invalid.`);
  }
  if (typeof h.depth !== "number" || !Number.isFinite(h.depth) || h.depth <= 0) {
    throw new Error(`Drillhole "${h.id}" depth invalid (must be > 0).`);
  }
}

function validateIntervalsOrThrow(holeId: string, depth: number, intervals: Interval[]) {
  // strict checks: from < to, within depth, no overlaps, numeric fields range-check
  for (const it of intervals) {
    if (!it || typeof it !== "object") throw new Error(`Drillhole "${holeId}" has invalid interval record.`);
    if (typeof it.id !== "string" || !it.id.trim()) throw new Error(`Drillhole "${holeId}" interval.id missing.`);
    if (typeof it.from !== "number" || !Number.isFinite(it.from)) throw new Error(`Interval "${it.id}" from invalid.`);
    if (typeof it.to !== "number" || !Number.isFinite(it.to)) throw new Error(`Interval "${it.id}" to invalid.`);
    if (!(it.from < it.to)) throw new Error(`Interval "${it.id}" must satisfy from < to.`);
    if (it.from < 0) throw new Error(`Interval "${it.id}" from must be >= 0.`);
    if (it.to > depth) throw new Error(`Interval "${it.id}" to exceeds hole depth (${depth}).`);
    if (typeof it.lith !== "string" || !it.lith.trim()) throw new Error(`Interval "${it.id}" lith missing/invalid.`);

    if (it.rqd !== undefined) {
      if (typeof it.rqd !== "number" || !Number.isFinite(it.rqd)) throw new Error(`Interval "${it.id}" rqd invalid.`);
      if (it.rqd < 0 || it.rqd > 100) throw new Error(`Interval "${it.id}" rqd out of range (0–100).`);
    }

    if (it.recovery !== undefined) {
      if (typeof it.recovery !== "number" || !Number.isFinite(it.recovery)) {
        throw new Error(`Interval "${it.id}" recovery invalid.`);
      }
      if (it.recovery < 0 || it.recovery > 100) throw new Error(`Interval "${it.id}" recovery out of range (0–100).`);
    }
  }

  // overlap check
  const sorted = [...intervals].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from < sorted[i - 1].to) {
      throw new Error(`Drillhole "${holeId}" has overlapping intervals ("${sorted[i - 1].id}" and "${sorted[i].id}").`);
    }
  }
}

export function buildReportHtml(
  project: ProjectFile,
  opts: { theme: "light" | "dark"; includeLabels: boolean }
): string {
  const theme = makeReportTheme(opts.theme);
  const stats = computeStats(project);

  // 2D plan SVG (vector)
  const planSvg = buildPlanSvg({
    project,
    width: 1100,
    height: 680,
    includeLabels: opts.includeLabels,
    selectedId: null,
    theme,
  });

  const holesSorted = [...project.drillholes].sort((a, b) => a.id.localeCompare(b.id));

  // IMPORTANT:
  // Each hole is now a .dh block (NOT wrapped in .page).
  // A pagination script will move these blocks into .page containers only when needed.
  const holeBlocks = holesSorted
    .map((h) => {
      const stripSvg = buildHoleStripSvg({
        hole: h,
        legend: project.lithLegend ?? {},
        width: 820,
        height: 560,
        theme,
      });

      return `
        <section class="dh">
          <div class="page-header">
            <div>
              <div class="h-title">${escapeHtml(h.id)}</div>
              <div class="subtle">
                Collar: (${fmt(h.collar.x)}, ${fmt(h.collar.y)}, ${fmt(h.collar.z)}) • Depth: ${fmt(h.depth)} m
              </div>
            </div>
          </div>

          <div class="grid-2">
            <div class="card">
              <div class="card-title">Core profile • RQD • Recovery</div>
              <div class="card-body">
                ${stripSvg}
              </div>
            </div>

            <div class="card">
              <div class="card-title">Intervals</div>
              <div class="card-body">
                ${renderIntervalsTable(h.intervals ?? [], theme)}
              </div>
            </div>
          </div>
        </section>
      `;
    })
    .join("");

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Geotechnical Core Logging Report</title>
    <style>
      ${reportCss(theme)}
    </style>
  </head>
  <body>
    <!-- COVER / SUMMARY (kept as a single true page) -->
    <div class="page">
      <div class="cover">
        <div>
          <div class="title">Geotechnical Core Logging Report</div>
          <div class="subtitle">${escapeHtml(project.project.name)}</div>
          <div class="subtle">Units: meters (m) • Version: ${escapeHtml(project.version)}</div>
        </div>

        <div class="summary card">
          <div class="card-title">Project summary</div>
          <div class="stats">
            <div class="stat">
              <div class="k">Drillholes</div>
              <div class="v">${stats.holeCount}</div>
            </div>
            <div class="stat">
              <div class="k">Total drilled meters</div>
              <div class="v">${fmt(stats.totalMeters)} m</div>
            </div>
            <div class="stat">
              <div class="k">Average depth</div>
              <div class="v">${fmt(stats.avgDepth)} m</div>
            </div>
            <div class="stat">
              <div class="k">Intervals</div>
              <div class="v">${stats.intervalCount}</div>
            </div>
            <div class="stat">
              <div class="k">Intervals with RQD</div>
              <div class="v">${stats.withRqdPct}%</div>
            </div>
            <div class="stat">
              <div class="k">Intervals with Recovery</div>
              <div class="v">${stats.withRecPct}%</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 14px;">
        <div class="card-title">2D Plan</div>
        <div class="card-body">
          ${planSvg}
        </div>
      </div>
    </div>

    <!-- DH SOURCE (blocks will be moved into real .page containers by script) -->
    <div id="dh-source">
      ${holeBlocks}
    </div>

    <!-- DH OUTPUT (pages created here) -->
    <div id="dh-pages"></div>

    <script>
      (function paginateHolesIntoPages() {
        const src = document.getElementById("dh-source");
        const out = document.getElementById("dh-pages");
        if (!src || !out) return;

        // helper: create a new page container matching your existing .page sizing/padding
        const newPage = () => {
          const page = document.createElement("div");
          page.className = "page dh-page";
          out.appendChild(page);
          return page;
        };

        const blocks = Array.from(src.querySelectorAll(".dh"));

        // remove any existing content in output
        out.innerHTML = "";

        // Wait until fonts settle to avoid late reflow changing heights after we decide page fits.
        const run = () => {
          // We will place blocks into pages and detect overflow using scrollHeight > clientHeight.
          let page = newPage();

          for (const block of blocks) {
            page.appendChild(block);

            // Force layout update
            const overflow = page.scrollHeight > page.clientHeight + 1;

            // If overflow and this isn't the first item on the page, move it to the next page.
            // If the block itself is taller than a page, let it overflow naturally (Chromium will split it).
            if (overflow) {
              // If it's the first child, keep it here (oversized block).
              if (page.children.length === 1) {
                continue;
              }

              // Move block to a fresh page
              page.removeChild(block);
              page = newPage();
              page.appendChild(block);
            }
          }

          // remove the source container from the layout (everything moved)
          src.style.display = "none";
        };

        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(run)));
        } else {
          requestAnimationFrame(() => requestAnimationFrame(run));
        }
      })();
    </script>
  </body>
</html>
  `;
}

function renderIntervalsTable(intervals: Interval[], theme: ReportTheme): string {
  if (!intervals.length) {
    return `<div class="subtle">No intervals logged.</div>`;
  }

  const rows = [...intervals]
    .sort((a, b) => a.from - b.from)
    .map((it) => {
      const lith = escapeHtml(it.lith || "");
      const rqd = it.rqd === undefined ? "—" : fmt(it.rqd);
      const rec = it.recovery === undefined ? "—" : fmt(it.recovery);
      return `
        <tr>
          <td>${fmt(it.from)}</td>
          <td>${fmt(it.to)}</td>
          <td>${lith}</td>
          <td class="num">${rqd}</td>
          <td class="num">${rec}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="tbl">
      <thead>
        <tr>
          <th>From</th>
          <th>To</th>
          <th>Lith</th>
          <th class="num">RQD</th>
          <th class="num">Rec</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type ReportTheme = {
  mode: "light" | "dark";
  bg: string;
  cardBg: string;
  text: string;
  muted: string;
  border: string;
  grid: string;

  accent: string;
  accent2: string;

  planBg: string;
  planGrid: string;
  planAxis: string;
  planHole: string;
  planHoleStroke: string;
  planHoleSelected: string;
};

function makeReportTheme(mode: "light" | "dark"): ReportTheme {
  if (mode === "dark") {
    return {
      mode,
      bg: "#070b16",
      cardBg: "#0b1222",
      text: "rgba(255,255,255,0.92)",
      muted: "rgba(255,255,255,0.62)",
      border: "rgba(255,255,255,0.10)",
      grid: "rgba(255,255,255,0.06)",
      accent: "#5aa7ff",
      accent2: "#ffd166",

      planBg: "#070b16",
      planGrid: "rgba(255,255,255,0.06)",
      planAxis: "rgba(255,255,255,0.14)",
      planHole: "#6fb6ff",
      planHoleStroke: "rgba(255,255,255,0.22)",
      planHoleSelected: "#ffd166",
    };
  }

  return {
    mode,
    bg: "#f6f7fb",
    cardBg: "#ffffff",
    text: "rgba(10,18,35,0.92)",
    muted: "rgba(10,18,35,0.60)",
    border: "rgba(10,18,35,0.10)",
    grid: "rgba(10,18,35,0.08)",
    accent: "#1f6feb",
    accent2: "#d97706",

    planBg: "#ffffff",
    planGrid: "rgba(10,18,35,0.08)",
    planAxis: "rgba(10,18,35,0.16)",
    planHole: "#1f6feb",
    planHoleStroke: "rgba(10,18,35,0.18)",
    planHoleSelected: "#d97706",
  };
}

function reportCss(t: ReportTheme) {
  return `
    @page { size: A4; margin: 0; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: ${t.bg};
      color: ${t.text};
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* page container (this is the only thing that should page-break) */
    .page {
      width: 210mm;
      height: 297mm;            /* fixed height (not min-height) so overflow detection is stable */
      padding: 14mm;
      box-sizing: border-box;
      page-break-after: always;
      overflow: hidden;          /* important: makes scrollHeight/clientHeight overflow detection meaningful */
    }

    /* source container should not affect layout much */
    #dh-source { width: 0; height: 0; overflow: hidden; }

    /* each drillhole block must be kept intact when possible */
    .dh {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 12px;
    }

    /* ensure svg doesn't introduce extra inline spacing */
    svg { display: block; }

    .title { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
    .subtitle { font-size: 16px; font-weight: 600; margin-top: 6px; color: ${t.muted}; }
    .subtle { color: ${t.muted}; font-size: 12px; line-height: 1.35; }

    .card {
      background: ${t.cardBg};
      border: 1px solid ${t.border};
      border-radius: 12px;
      overflow: hidden;
    }
    .card-title {
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${t.muted};
      border-bottom: 1px solid ${t.border};
    }
    .card-body { padding: 12px; }

    .cover { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; align-items: start; }
    .summary { padding-bottom: 0; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
    .stat { border: 1px solid ${t.border}; border-radius: 10px; padding: 10px; }
    .stat .k { color: ${t.muted}; font-size: 11px; }
    .stat .v { font-size: 16px; font-weight: 800; margin-top: 4px; }

    .page-header {
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap: 12px;
      margin-bottom: 10px;
    }
    .h-title { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }
    .meta { display:grid; gap: 4px; min-width: 260px; }
    .meta .k { color: ${t.muted}; font-size: 11px; display:inline-block; width: 62px; }
    .meta .v { font-size: 11px; color: ${t.text}; }

    .grid-2 { display:grid; grid-template-columns: 1.25fr 0.75fr; gap: 12px; }

    .tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
    .tbl thead th {
      text-align: left;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${t.muted};
      padding: 8px 6px;
      border-bottom: 1px solid ${t.border};
    }
    .tbl tbody td {
      padding: 8px 6px;
      border-bottom: 1px solid ${t.border};
      vertical-align: top;
    }
    .tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
  `;
}
