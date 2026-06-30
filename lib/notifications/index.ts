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

export async function emitEvent(event: NotificationEvent): Promise<void> {
  const matchingRules = RULES.filter((r) => r.event === event.type);
  if (matchingRules.length === 0) return;

  await Promise.allSettled(
    matchingRules.map((rule) => {
      const to = rule.getRecipients();
      if (to.length === 0) return Promise.resolve();

      if (rule.channel === "email") {
        const p = event.payload as unknown as Record<string, unknown>;
        return sendEmail({
          to,
          subject: rule.getSubject(p),
          html: rule.getBody(p),
        });
      }

      // Future channels (sms, push, slack) handled here — no caller changes needed.
      return Promise.resolve();
    })
  );
}
