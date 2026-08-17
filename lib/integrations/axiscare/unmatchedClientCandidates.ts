// "Match to Existing Person" — candidate SUGGESTION for AxisCare clients
// the deterministic auto-matcher (matchAxisCareClientToResident) found no
// match for at all. This is deliberately NOT part of that matcher and
// never touches it: the automatic tiers stay exactly as strict as they
// already are (never weakened to produce more auto-matches), and nothing
// here is ever auto-confirmed — every suggestion still requires a human
// to click Confirm Match. Reuses the SAME canonicalized candidate pool
// (buildAxisCareMatchCandidates — already redirect/alias-aware, already
// excludes retired duplicates as independent candidates) and the same
// fuzzy-name primitive (levenshteinDistance) already used elsewhere in
// this codebase — no new identity engine, no new table.
import { levenshteinDistance } from "../../residents/identity/levenshtein.ts";
import type { NormalizedResidentCandidate } from "./clientIdentityMatching.ts";

export interface SuggestedResidentMatch {
  readonly residentId: string;
  readonly displayName: string;
  readonly unitNumber: string | null;
  readonly communityName: string | null;
  readonly reasons: readonly string[];
  // "strong" = safe to lead with a one-click Confirm; "possible" = real
  // but not enough on its own — surfaced for a human glance, never
  // pre-selected as the obvious answer.
  readonly confidence: "strong" | "possible";
}

// AxisCare's own community FIELD is sometimes null even when a class tag
// clearly names the community (live-confirmed: AxisCare Client #7 "Linda
// Kaplan" has community=null but classes includes "Watermere Frisco" —
// this is exactly why she was invisible to the deterministic matcher,
// which only ever reads the community field). This comparison is
// deliberately more lenient than the auto-matcher's exact-string check —
// safe here specifically because a match found this way is ALWAYS
// human-confirmed, never auto-applied.
function normalizeCommunityForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bat\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function communityLikelyMatches(clientCommunity: string | null, classes: readonly string[], residentCommunity: string | null): boolean {
  if (!residentCommunity) return false;
  const normalizedResident = normalizeCommunityForComparison(residentCommunity);
  if (!normalizedResident) return false;

  if (clientCommunity) {
    const normalizedClient = normalizeCommunityForComparison(clientCommunity);
    if (normalizedClient === normalizedResident) return true;
  }

  return classes.some((tag) => {
    const normalizedTag = normalizeCommunityForComparison(tag);
    if (normalizedTag.length < 4) return false; // avoid trivial short-tag false positives ("PC", etc.)
    return normalizedResident.includes(normalizedTag) || normalizedTag.includes(normalizedResident);
  });
}

function firstToken(normalizedFullName: string): string {
  return normalizedFullName.split(" ")[0] ?? "";
}

export function suggestResidentMatchesForAxisCareClient(
  client: {
    readonly normalizedName: string;
    readonly normalizedLastName: string | null;
    readonly normalizedEmail: string | null;
    readonly normalizedPhones: readonly string[];
    readonly communityName: string | null;
    readonly classes: readonly string[];
  },
  candidates: readonly NormalizedResidentCandidate[]
): SuggestedResidentMatch[] {
  const bestByResidentId = new Map<string, SuggestedResidentMatch>();

  for (const r of candidates) {
    const reasons: string[] = [];
    let nameSignal: "exact" | "near" | "none" = "none";

    if (r.normalizedName === client.normalizedName) {
      nameSignal = "exact";
      reasons.push("Name matches exactly");
    } else if (client.normalizedLastName && r.normalizedLastName && r.normalizedLastName === client.normalizedLastName) {
      const clientFirst = firstToken(client.normalizedName);
      const residentFirst = firstToken(r.normalizedName);
      if (clientFirst && residentFirst && levenshteinDistance(clientFirst, residentFirst) <= 1) {
        nameSignal = "near";
        reasons.push(`Same last name; first name differs slightly ("${clientFirst}" vs. "${residentFirst}")`);
      }
    }
    if (nameSignal === "none") continue;

    const communityMatch = communityLikelyMatches(client.communityName, client.classes, r.communityName);
    if (communityMatch) reasons.push(`Likely same community${r.communityName ? ` (${r.communityName})` : ""}`);

    const phoneMatch = r.normalizedPhones.some((p) => client.normalizedPhones.includes(p));
    if (phoneMatch) reasons.push("Phone matches");

    const emailMatch = Boolean(client.normalizedEmail && r.normalizedEmail === client.normalizedEmail);
    if (emailMatch) reasons.push("Email matches");

    const corroborationCount = [communityMatch, phoneMatch, emailMatch].filter(Boolean).length;
    const confidence: "strong" | "possible" = nameSignal === "exact" && corroborationCount > 0 ? "strong" : "possible";

    const candidate: SuggestedResidentMatch = {
      residentId: r.id,
      displayName: r.displayName,
      unitNumber: r.unitNumber,
      communityName: r.communityName,
      reasons,
      confidence,
    };

    // A resident can appear more than once in the canonicalized pool (own
    // name row + alias rows) — keep only the strongest evidence found for
    // them, never report the same person twice.
    const existing = bestByResidentId.get(r.id);
    if (!existing || (existing.confidence === "possible" && confidence === "strong") || candidate.reasons.length > existing.reasons.length) {
      bestByResidentId.set(r.id, candidate);
    }
  }

  return Array.from(bestByResidentId.values()).sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "strong" ? -1 : 1));
}
