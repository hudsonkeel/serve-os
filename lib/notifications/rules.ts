// Notification rules: maps event types to recipients and message templates.
//
// To add a new notification:
//   1. Ensure the event type exists in types.ts
//   2. Add a rule object to the RULES array below
//   3. Call emitEvent() from the relevant server action
//
// Rules are pure code — no database required. Recipient lists come from env vars
// so they can be changed without a deploy.

import type { NotificationRule } from "./types.ts";
import { esc, parseRecipients } from "./channels/email.ts";

// ─── Email template helpers ──────────────────────────────────────────────────

function tableRow(label: string, value: string): string {
  return (
    `<tr>` +
    `<td style="padding:4px 12px 4px 0;color:#7B8D9E;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td>` +
    `<td style="padding:4px 0;font-size:13px;color:#2F3F57">${value}</td>` +
    `</tr>`
  );
}

function buildRecruitingLeadHtml(
  p: Record<string, unknown>,
  roleLabel: string
): string {
  const submitted = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const explorationLabels: Record<string, string> = {
    immediately:       "Immediately",
    within_30_days:    "Within 30 days",
    "1_to_3_months":   "1–3 months",
    "3_to_6_months":   "3–6 months",
    future_exploratory: "Future / exploratory only",
  };

  const rows = [
    tableRow("Role", roleLabel),
    p.phone ? tableRow("Phone", esc(String(p.phone))) : "",
    p.email ? tableRow("Email", esc(String(p.email))) : "",
    p.zipCode ? tableRow("ZIP", esc(String(p.zipCode))) : "",
    p.cityState ? tableRow("Location", esc(String(p.cityState))) : "",
    p.availability ? tableRow("Availability", esc(String(p.availability))) : "",
    p.experienceLevel ? tableRow("Experience", esc(String(p.experienceLevel))) : "",
    p.explorationTimeline
      ? tableRow(
          "Exploration Timeline",
          esc(explorationLabels[String(p.explorationTimeline)] ?? String(p.explorationTimeline))
        )
      : "",
    p.linkedinUrl
      ? tableRow(
          "LinkedIn",
          `<a href="${esc(String(p.linkedinUrl))}" style="color:#C9A96E">${esc(String(p.linkedinUrl))}</a>`
        )
      : "",
    p.resumeUrl
      ? tableRow(
          "Resume",
          `<a href="${esc(String(p.resumeUrl))}" style="color:#C9A96E">${esc(p.resumeFilename ? String(p.resumeFilename) : "Download Resume")}</a>`
        )
      : "",
    p.message ? tableRow("Message", esc(String(p.message))) : "",
  ]
    .filter(Boolean)
    .join("");

  // Sanitize the URL: trim whitespace, strip trailing slashes, validate protocol.
  // Do NOT pass through esc() — esc() converts " to &quot; which breaks the href
  // if the env var was entered with surrounding quotes.
  const rawUrl = process.env.SERVE_APP_URL?.trim().replace(/\/+$/, "");
  const safeUrl =
    rawUrl?.startsWith("https://") || rawUrl?.startsWith("http://")
      ? rawUrl
      : undefined;
  const viewLink = safeUrl
    ? `<p style="margin-top:16px"><a href="${safeUrl}/recruiting" style="color:#C9A96E;text-decoration:underline">View in Serve OS &rarr;</a></p>`
    : "";

  return `
    <div style="font-family:sans-serif;color:#2F3F57;max-width:520px">
      <p style="margin:0 0 16px;font-size:14px">
        A new <b>${roleLabel}</b> inquiry was submitted on ${submitted} CT.
      </p>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      ${viewLink}
      <p style="margin-top:24px;font-size:11px;color:#A9B3BC">
        Sent by Serve OS${process.env.SERVE_NOTIFICATION_REPLY_TO ? " — reply to this email to respond." : " — do not reply to this address."}
      </p>
    </div>
  `;
}

function buildExecutiveReviewRequiredHtml(p: Record<string, unknown>): string {
  const rows = [
    tableRow("Subject", `${esc(String(p.subjectType ?? ""))} — ${esc(String(p.subjectId ?? ""))}`),
    tableRow("Decision", esc(String(p.decisionTitle ?? ""))),
    p.decisionDescription ? tableRow("Details", esc(String(p.decisionDescription))) : "",
  ]
    .filter(Boolean)
    .join("");

  const rawUrl = process.env.SERVE_APP_URL?.trim().replace(/\/+$/, "");
  const safeUrl = rawUrl?.startsWith("https://") || rawUrl?.startsWith("http://") ? rawUrl : undefined;
  const viewLink =
    safeUrl && p.recommendationId
      ? `<p style="margin-top:16px"><a href="${safeUrl}/governance/${esc(String(p.recommendationId))}" style="color:#C9A96E;text-decoration:underline">View in Serve OS &rarr;</a></p>`
      : "";

  return `
    <div style="font-family:sans-serif;color:#2F3F57;max-width:520px">
      <p style="margin:0 0 16px;font-size:14px">
        A Governance decision requires executive review. This is a point-in-time
        evaluation based on recorded evidence — not a continuously monitored feed.
      </p>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      ${viewLink}
      <p style="margin-top:24px;font-size:11px;color:#A9B3BC">
        Sent by Serve OS — do not reply to this address.
      </p>
    </div>
  `;
}

// ─── Rules ───────────────────────────────────────────────────────────────────
//
// Event                                Recipients env var           Channel
// ───────────────────────────────────  ───────────────────────────  ───────
// recruiting_lead.caregiver_created    SERVE_NOTIFY_RECRUITING      email
// recruiting_lead.md_created           SERVE_NOTIFY_LEADERSHIP      email
// compliance.executive_review_required SERVE_NOTIFY_LEADERSHIP      email
//
// Scope J (Production Intake Unification) retired the never-finished
// `prospect.completed`/`prospect.created` rules — `prospects` is no longer
// written to by any active intake path. A Contact-Ready-care-inquiry
// notification (the thing `prospect.completed` was reaching for) is a
// reasonable follow-up but out of scope to build here; SERVE_NOTIFY_CARE_PROSPECTS
// is left defined in .env.example for whenever that's picked up.

export const RULES: NotificationRule[] = [
  {
    event: "recruiting_lead.caregiver_created",
    channel: "email",
    getRecipients: () => parseRecipients(process.env.SERVE_NOTIFY_RECRUITING),
    getSubject: (p) =>
      `[Serve] New Caregiver Lead — ${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
    getBody: (p) => buildRecruitingLeadHtml(p, "Caregiver"),
  },
  {
    event: "recruiting_lead.md_created",
    channel: "email",
    getRecipients: () => parseRecipients(process.env.SERVE_NOTIFY_LEADERSHIP),
    getSubject: (p) =>
      `[Serve] New MD Interest — ${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
    getBody: (p) => buildRecruitingLeadHtml(p, "Managing Director"),
  },
  {
    event: "compliance.executive_review_required",
    channel: "email",
    getRecipients: () => parseRecipients(process.env.SERVE_NOTIFY_LEADERSHIP),
    getSubject: (p) => `[Serve] Executive Review Required — ${p.decisionTitle ?? "Governance decision"}`,
    getBody: (p) => buildExecutiveReviewRequiredHtml(p),
  },
];
