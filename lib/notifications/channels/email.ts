export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseRecipients(envVar: string | undefined): string[] {
  if (!envVar) return [];
  return envVar.split(",").map((e) => e.trim()).filter(Boolean);
}

export interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[notifications:email] RESEND_API_KEY not set — skipping:", payload.subject);
    return;
  }
  if (payload.to.length === 0) {
    console.log("[notifications:email] No recipients configured — skipping:", payload.subject);
    return;
  }

  const from = process.env.SERVE_NOTIFICATION_FROM ?? "Serve OS <alerts@servecaregiving.com>";
  const replyTo = process.env.SERVE_NOTIFICATION_REPLY_TO;

  const body: Record<string, unknown> = {
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  };
  if (replyTo) body.reply_to = replyTo;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[notifications:email] Resend error:", res.status, text);
    }
  } catch (err) {
    console.error("[notifications:email] Failed to deliver:", err);
  }
}
