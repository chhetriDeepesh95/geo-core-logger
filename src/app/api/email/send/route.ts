import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node runtime (avoid Edge for most email SDKs)

type Payload = {
  toEmail: string;
  toName?: string;
  subject: string;
  text?: string;
  html?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;

    if (!body.toEmail || !body.subject || (!body.text && !body.html)) {
      return NextResponse.json(
        { error: "Missing required fields: toEmail, subject, and text or html." },
        { status: 400 }
      );
    }

    const apiKey = process.env.MAILJET_API_KEY;
    const apiSecret = process.env.MAILJET_API_SECRET;
    const fromEmail = process.env.MAIL_FROM_EMAIL;
    const fromName = process.env.MAIL_FROM_NAME ?? "App";

    if (!apiKey || !apiSecret || !fromEmail) {
      return NextResponse.json(
        { error: "Server email configuration missing." },
        { status: 500 }
      );
    }

    // Mailjet v3.1 send endpoint
    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Basic auth: base64(apiKey:apiSecret)
        Authorization:
          "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"),
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: fromEmail, Name: fromName },
            To: [{ Email: body.toEmail, Name: body.toName ?? body.toEmail }],
            Subject: body.subject,
            TextPart: body.text ?? undefined,
            HTMLPart: body.html ?? undefined,
          },
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Mailjet send failed.", details: data },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected server error.", details: String(err) },
      { status: 500 }
    );
  }
}
