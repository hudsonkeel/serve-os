import { NotificationEvent } from "./types";
import { RULES } from "./rules";
import { sendEmail } from "./channels/email";

export type { NotificationEventType, NotificationEvent } from "./types";

// emitEvent is the single entry point for the Serve Notification Service.
//
// Usage (from any server action):
//   void emitEvent({ type: "recruiting_lead.caregiver_created", payload: { ... } });
//
// The function matches the event against all rules, dispatches each matching
// rule to the appropriate channel handler, and resolves when all notifications
// have settled. Failures in one channel never block others.
//
// To add a new channel: add a handler branch below and define its rule fields
// in types.ts. No other files need to change.

export async function emitEvent(
  event: NotificationEvent
): Promise<{ ok: boolean }> {
  const matchingRules = RULES.filter((r) => r.event === event.type);
  if (matchingRules.length === 0) return { ok: true };

  const results = await Promise.allSettled(
    matchingRules.map(async (rule) => {
      const to = rule.getRecipients();
      if (to.length === 0) {
        console.warn(
          `[notifications] No recipients configured for "${event.type}" — check the recipient env var for this rule.`
        );
        return false;
      }

      if (rule.channel === "email") {
        const p = event.payload as unknown as Record<string, unknown>;
        return sendEmail({
          to,
          subject: rule.getSubject(p),
          html: rule.getBody(p),
        });
      }

      // Future channels (sms, push, slack) handled here — no caller changes needed.
      return true;
    })
  );

  const ok = results.every((r) => r.status === "fulfilled" && r.value === true);
  if (!ok) {
    console.warn(`[notifications] One or more notifications failed for "${event.type}".`);
  }
  return { ok };
}
