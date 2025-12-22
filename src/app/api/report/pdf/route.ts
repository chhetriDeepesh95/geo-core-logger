import { NextResponse } from "next/server";
import type { ProjectFile } from "@/app/lib/model";
import { buildReportHtml } from "@/app/lib/reportServer/reportHtml";

export const runtime = "nodejs";

type ThemeMode = "light" | "dark";

function isVercel(): boolean {
  // Vercel sets VERCEL="1" in deployments.
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

async function launchBrowser() {
  if (isVercel()) {
    // Vercel/serverless: puppeteer-core + @sparticuz/chromium-min
    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer-core"),
      import("@sparticuz/chromium"),
    ]);

    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
    });

    return browser;
  }

  // Local: puppeteer (bundled Chromium)
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({ headless: true });
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

    // Helps with consistent typography if you load fonts in the HTML
    await page.evaluate(() => (document as any).fonts?.ready);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "18mm",
        right: "18mm",
      },
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
