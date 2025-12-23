import { NextResponse } from "next/server";
import type { ProjectFile } from "@/app/lib/model";
import { buildReportHtml } from "@/app/lib/reportServer/reportHtml";

export const runtime = "nodejs";

type ThemeMode = "light" | "dark";

function isVercel(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

// optional: detect common container environments
function isContainer(): boolean {
  return (
    process.env.DOCKER === "true" ||
    process.env.CI === "true" ||
    process.env.CONTAINER === "true"
  );
}

// In Ubuntu 23.10+ / hardened Linux, Chromium sandbox may not be usable.
// This adds flags only where needed.
function localChromiumArgs(): string[] {
  const base = [
    "--disable-dev-shm-usage", // helps in constrained /tmp or docker environments
    "--font-render-hinting=none",
  ];

  // Use no-sandbox only when you must. Prefer enabling userns sandbox on the OS.
  // However, in container/CI it's often required.
  if (process.platform === "linux" && isContainer()) {
    return [...base, "--no-sandbox", "--disable-setuid-sandbox"];
  }

  // On many desktops with AppArmor userns restrictions, Puppeteer Chromium fails unless sandbox is disabled.
  // If you want a strict approach, gate this behind an env var (see below).
  if (process.platform === "linux" && process.env.PUPPETEER_NO_SANDBOX === "1") {
    return [...base, "--no-sandbox", "--disable-setuid-sandbox"];
  }

  return base;
}

// Optional: allow specifying an existing Chrome/Chromium binary.
// This avoids Puppeteer's downloaded Chromium and can reduce sandbox issues.
function resolveExecutablePath(): string | undefined {
  return (
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_BIN ||
    process.env.CHROMIUM_BIN ||
    undefined
  );
}

async function launchBrowser() {
  if (isVercel()) {
    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer-core"),
      import("@sparticuz/chromium"),
    ]);

    const executablePath = await chromium.executablePath();

    return puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }

  const { default: puppeteer } = await import("puppeteer");

  const executablePath = resolveExecutablePath();

  return puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: localChromiumArgs(),
  });
}

export async function POST(req: Request) {
  let browser: any | null = null;

  try {
    const { project, theme } = (await req.json()) as {
      project: ProjectFile;
      theme: ThemeMode;
    };

    if (!project || !project.project?.name) {
      return NextResponse.json({ error: "Invalid project data" }, { status: 400 });
    }

    browser = await launchBrowser();
    const page = await browser.newPage();

    const html = buildReportHtml(project, theme as any);

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(() => (document as any).fonts?.ready);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    });

    await browser.close();
    browser = null;

    const safeName = (project.project.name || "project").replace(/\s+/g, "_");

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}_report.pdf"`,
      },
    });
  } catch (err: any) {
    console.error(err);

    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }

    return NextResponse.json(
      { error: err?.message ?? "PDF generation failed" },
      { status: 500 }
    );
  }
}
