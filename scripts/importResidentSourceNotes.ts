// One-time, idempotent import of resident/relationship information
// transcribed from two photographed operational documents:
//   - resident_service_needs_photo_2026_07  (typed resident transition/
//     service-needs sheet)
//   - watermere_whiteboard_photo_2026_06_07 (operational planning
//     whiteboard)
//
// See scripts/importResidentSourceNotes/sourceData.ts for the transcribed
// records and scripts/importResidentSourceNotes/matching.ts for the exact
// matching rules. This script never pushes anything to AxisCare or Cinch,
// never creates a new resident, never creates a schedule, and never
// recreates Doris Kakazu (see the synthetic-data policy note on Source 2
// record 13).
//
// Dry run (default):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/importResidentSourceNotes.ts
// Apply (writes only the records the dry run showed as safe):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/importResidentSourceNotes.ts --apply
//
// IMPORTANT — why this script has its own resident data-access module:
// lib/data/residents.ts, residentCurrentNeeds.ts, and residentWorkingNotes.ts
// all import via the Next.js "@/" alias, which a plain `node
// --experimental-strip-types` script cannot resolve (this codebase's
// established convention — see every other scripts/collectors/*.ts file —
// is that script-callable data-layer code uses relative imports with
// explicit .ts extensions). Rather than rewrite those shared app files'
// import style for this one-time script, scripts/importResidentSourceNotes/
// residentDataAccess.ts calls the exact same underlying RPCs
// (save_resident_current_needs, create_resident_working_note) through a
// script-compatible relative import. lib/data/relationships.ts already
// uses relative imports, so relationship writes reuse it directly, unchanged.
import { createServerClient } from "../lib/supabase/server.ts";
import {
  createRelationshipWorkingNote,
  getRelationshipsByResident,
  getRelationshipWorkingNotes,
  getServiceOpportunityByRelationshipId,
  upsertRelationshipServiceOpportunity,
} from "../lib/data/relationships.ts";
import {
  createResidentWorkingNote,
  getCurrentNeedsContent,
  getResidentWorkingNoteContents,
  loadLiveResidents,
  saveCurrentNeeds,
} from "./importResidentSourceNotes/residentDataAccess.ts";
import { matchFirstNamePair, matchResident } from "./importResidentSourceNotes/matching.ts";
import { mergeNeeds } from "./importResidentSourceNotes/needsMerge.ts";
import { hasImportTag, withImportTag } from "./importResidentSourceNotes/dedup.ts";
import { normalizeName } from "./importResidentSourceNotes/normalization.ts";
import { SOURCE_1_RECORDS, SOURCE_2_RECORDS } from "./importResidentSourceNotes/sourceData.ts";
import type { LiveResident, MatchResult, PlannedWrite } from "./importResidentSourceNotes/types.ts";
import type { Relationship, RelationshipWorkingNoteCategory } from "../lib/supabase/types.ts";

const APPLY = process.argv.includes("--apply");
const ACTOR = `Import script (${process.env.USER || process.env.USERNAME || "unknown operator"})`;

const planned: PlannedWrite[] = [];
const matchLog: MatchResult[] = [];

function log(...args: unknown[]) {
  console.log(...args);
}

// ─── Live data ──────────────────────────────────────────────────────────

async function loadNicknameMap(): Promise<Map<string, string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_relationship_profiles")
    .select("resident_id, preferred_name")
    .not("preferred_name", "is", null);

  if (error) throw new Error(`Could not load nicknames: ${error.message}`);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.preferred_name) map.set(row.resident_id as string, row.preferred_name as string);
  }
  return map;
}

function mostRecentNonClosedRelationship(
  relationships: readonly Relationship[]
): Relationship | null {
  const open = relationships.filter((r) => r.status !== "closed");
  if (open.length === 0) return null;
  return [...open].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
}

// First-name-only / nickname match, for whiteboard entries with no
// surname at all ("Mick", "John", "Johnny", "Lajuana").
function matchByFirstNameOrNickname(
  name: string,
  residents: readonly LiveResident[],
  nicknames: Map<string, string>
): MatchResult {
  const normalized = normalizeName(name);
  const byFirstName = residents.filter((r) => normalizeName(r.firstName ?? "") === normalized);
  const byNickname = residents.filter((r) => normalizeName(nicknames.get(r.id) ?? "") === normalized);

  const combined = [...new Map([...byFirstName, ...byNickname].map((r) => [r.id, r])).values()];

  if (combined.length === 1) {
    const only = combined[0];
    const viaNickname = byNickname.some((r) => r.id === only.id) && !byFirstName.some((r) => r.id === only.id);
    return {
      sourceName: name,
      sourceApartment: null,
      status: "matched",
      residentId: only.id,
      residentName: [only.firstName, only.lastName].filter(Boolean).join(" ") || only.displayName || only.fullName,
      residentUnit: only.unitNumber,
      confidence: "medium",
      method: "first_name_pair",
      reason: viaNickname
        ? `Exactly one resident goes by the nickname "${name}".`
        : `Exactly one resident has the first name "${name}".`,
    };
  }

  if (combined.length > 1) {
    return {
      sourceName: name,
      sourceApartment: null,
      status: "ambiguous",
      residentId: null,
      residentName: null,
      residentUnit: null,
      confidence: "none",
      method: "no_match",
      reason: `${combined.length} residents match first name/nickname "${name}" — insufficient identity to match safely.`,
      ambiguousCandidateIds: combined.map((r) => r.id),
    };
  }

  return {
    sourceName: name,
    sourceApartment: null,
    status: "unmatched",
    residentId: null,
    residentName: null,
    residentUnit: null,
    confidence: "none",
    method: "no_match",
    reason: `No resident found with first name or nickname "${name}".`,
  };
}

// ─── Write helpers (plan + optionally apply) ──────────────────────────────

// Multiple source records (e.g. a resident named in both the needs sheet
// and the whiteboard) can target the same resident's Current Needs within
// one run. This cache makes each later record's dry-run preview reflect
// what the earlier record in the SAME run already planned to add — so the
// preview matches what real sequential --apply execution would produce,
// instead of every record independently reading the pre-import content.
const currentNeedsCache = new Map<string, string>();

async function getEffectiveCurrentNeeds(residentId: string): Promise<string> {
  if (!currentNeedsCache.has(residentId)) {
    currentNeedsCache.set(residentId, await getCurrentNeedsContent(residentId));
  }
  return currentNeedsCache.get(residentId)!;
}

async function planCurrentNeedsAppend(
  sourceId: string,
  recordIndex: number,
  residentId: string,
  residentName: string | null,
  needs: readonly string[]
): Promise<void> {
  const existing = await getEffectiveCurrentNeeds(residentId);
  const merge = mergeNeeds(existing, needs);
  currentNeedsCache.set(residentId, merge.mergedContent);

  if (merge.newNeeds.length === 0) {
    planned.push({
      sourceId,
      recordIndex,
      kind: "current_needs_append",
      status: "no_change_needed",
      residentId,
      residentName,
      relationshipId: null,
      description: `Current Needs already reflects: ${merge.alreadyRepresented.join("; ")}`,
      reason: "Every source need is already represented in the resident's current Current Needs content.",
    });
    return;
  }

  const write: PlannedWrite = {
    sourceId,
    recordIndex,
    kind: "current_needs_append",
    status: "will_write",
    residentId,
    residentName,
    relationshipId: null,
    description: `Append: ${merge.appendedContent}`,
    content: merge.mergedContent,
    reason: `New need(s) not already represented: ${merge.newNeeds.join("; ")}`,
  };
  planned.push(write);

  if (APPLY) {
    const { error } = await saveCurrentNeeds({
      residentId,
      content: merge.mergedContent,
      sourceLabel: sourceId,
      actor: ACTOR,
    });
    if (error) log(`  ERROR saving Current Needs for ${residentName}: ${error}`);
  }
}

async function planResidentWorkingNote(
  sourceId: string,
  recordIndex: number,
  residentId: string,
  residentName: string | null,
  content: string,
  category: RelationshipWorkingNoteCategory | null
): Promise<void> {
  const existingContents = await getResidentWorkingNoteContents(residentId);
  if (hasImportTag(existingContents, sourceId, recordIndex)) {
    planned.push({
      sourceId,
      recordIndex,
      kind: "resident_working_note",
      status: "skipped_duplicate",
      residentId,
      residentName,
      relationshipId: null,
      description: "A working note with this import's tag already exists for this resident.",
      reason: "Idempotency: this exact source item has already been imported for this resident.",
    });
    return;
  }

  const tagged = withImportTag(sourceId, recordIndex, content);
  planned.push({
    sourceId,
    recordIndex,
    kind: "resident_working_note",
    status: "will_write",
    residentId,
    residentName,
    relationshipId: null,
    description: "New resident Working Note",
    content: tagged,
    reason: "No existing working note carries this import's tag.",
  });

  if (APPLY) {
    const { error } = await createResidentWorkingNote({ residentId, content: tagged, category, actor: ACTOR });
    if (error) log(`  ERROR creating resident working note for ${residentName}: ${error}`);
  }
}

async function planRelationshipWorkingNote(
  sourceId: string,
  recordIndex: number,
  relationshipId: string,
  residentId: string | null,
  residentName: string | null,
  content: string,
  category: RelationshipWorkingNoteCategory | null
): Promise<void> {
  const existingNotes = await getRelationshipWorkingNotes(relationshipId);
  const existingContents = existingNotes.map((n) => n.content);
  if (hasImportTag(existingContents, sourceId, recordIndex)) {
    planned.push({
      sourceId,
      recordIndex,
      kind: "relationship_working_note",
      status: "skipped_duplicate",
      residentId,
      residentName,
      relationshipId,
      description: "A relationship working note with this import's tag already exists.",
      reason: "Idempotency: this exact source item has already been imported for this relationship.",
    });
    return;
  }

  const tagged = withImportTag(sourceId, recordIndex, content);
  planned.push({
    sourceId,
    recordIndex,
    kind: "relationship_working_note",
    status: "will_write",
    residentId,
    residentName,
    relationshipId,
    description: "New relationship Working Note",
    content: tagged,
    reason: "No existing relationship working note carries this import's tag.",
  });

  if (APPLY) {
    const { error } = await createRelationshipWorkingNote(relationshipId, tagged, category, ACTOR, {
      residentId: residentId ?? undefined,
      sourceDescription: sourceId,
    });
    if (error) log(`  ERROR creating relationship working note: ${error}`);
  }
}

async function planServiceOpportunity(
  sourceId: string,
  recordIndex: number,
  relationshipId: string,
  residentId: string | null,
  residentName: string | null,
  input: {
    serviceSummary: string;
    visitsPerWeek: number | null;
    preferredDays: string | null;
    preferredTimeWindows: string | null;
    estimatedVisitMinutes: number | null;
  }
): Promise<void> {
  const existing = await getServiceOpportunityByRelationshipId(relationshipId);

  const same =
    existing &&
    existing.service_summary === input.serviceSummary &&
    existing.visits_per_week === input.visitsPerWeek &&
    existing.preferred_days === input.preferredDays &&
    existing.preferred_time_windows === input.preferredTimeWindows &&
    existing.estimated_visit_minutes === input.estimatedVisitMinutes;

  if (same) {
    planned.push({
      sourceId,
      recordIndex,
      kind: "relationship_service_opportunity",
      status: "no_change_needed",
      residentId,
      residentName,
      relationshipId,
      description: "Service Opportunity already reflects this proposed frequency/duration.",
      reason: "No difference between the source's proposed detail and the existing Service Opportunity row.",
    });
    return;
  }

  planned.push({
    sourceId,
    recordIndex,
    kind: "relationship_service_opportunity",
    status: "will_write",
    residentId,
    residentName,
    relationshipId,
    description: `${existing ? "Update" : "Create"} Service Opportunity (status: draft): ${input.serviceSummary}`,
    content: JSON.stringify(input),
    reason: existing ? "Existing Service Opportunity differs from the source." : "No Service Opportunity exists yet for this relationship.",
  });

  if (APPLY) {
    const { error } = await upsertRelationshipServiceOpportunity({
      relationshipId,
      serviceSummary: input.serviceSummary,
      visitsPerWeek: input.visitsPerWeek,
      preferredDays: input.preferredDays,
      preferredTimeWindows: input.preferredTimeWindows,
      estimatedVisitMinutes: input.estimatedVisitMinutes,
      anticipatedStartDate: null,
      serviceLocationSummary: null,
      status: "draft",
      actor: ACTOR,
    });
    if (error) log(`  ERROR saving Service Opportunity: ${error}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  log(`\n=== Resident Source Notes Import ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);

  const residents = await loadLiveResidents();
  const nicknames = await loadNicknameMap();
  log(`Loaded ${residents.length} live resident(s).`);

  const relationshipsByResident = new Map<string, Relationship[]>();
  async function relationshipsFor(residentId: string): Promise<Relationship[]> {
    if (!relationshipsByResident.has(residentId)) {
      relationshipsByResident.set(residentId, await getRelationshipsByResident(residentId));
    }
    return relationshipsByResident.get(residentId)!;
  }

  // ─── Source 1 — resident_service_needs_photo_2026_07 ───────────────────
  for (const record of SOURCE_1_RECORDS) {
    log(`\n--- Source 1 #${record.recordIndex}: apartment ${record.apartment}, ${record.residentNames.join(" & ")} ---`);

    const matches = record.residentNames.map((name) => matchResident(name, record.apartment, residents));
    matchLog.push(...matches);
    for (const m of matches) {
      log(`  Match: "${m.sourceName}" -> ${m.status} (${m.confidence}, ${m.method}): ${m.reason}`);
    }

    const isCouple = record.residentNames.length > 1;
    const seenResidentIds = new Set<string>();

    for (const match of matches) {
      if (match.status !== "matched" || !match.residentId) continue;

      if (seenResidentIds.has(match.residentId)) {
        // Two source names in the same couple entry resolved to the same
        // single live resident — meaning only one of the two named people
        // currently has a live resident record (the other may have
        // moved out, passed away, or simply never been entered). Write
        // the shared note once, not once per source name, to avoid
        // inserting a duplicate row on --apply.
        log(`  Note: "${match.sourceName}" resolves to the same resident already handled above — writing once, not twice.`);
        continue;
      }
      seenResidentIds.add(match.residentId);

      if (isCouple) {
        // Shared, unattributed needs — Working Note only, per the
        // transcription note, never Current Needs without attribution.
        const content = `Shared apartment ${record.apartment} needs (recorded jointly for ${record.residentNames.join(" & ")}, from ${record.sourceId}): ${record.needs.join("; ")}. Needs verification of which need applies to which resident before treating any one need as attributed to this specific person.`;
        await planResidentWorkingNote(record.sourceId, record.recordIndex, match.residentId, match.residentName, content, "clinical");
        continue;
      }

      await planCurrentNeedsAppend(record.sourceId, record.recordIndex, match.residentId, match.residentName, record.needs);
    }
  }

  // ─── Source 2 — watermere_whiteboard_photo_2026_06_07 ──────────────────
  for (const record of SOURCE_2_RECORDS) {
    log(`\n--- Source 2 #${record.recordIndex}: ${record.personLabel} ---`);

    if (record.synthenticDataPolicyFlag) {
      log(`  SKIPPED under synthetic-data policy: ${record.doNotInferNote}`);
      planned.push({
        sourceId: record.sourceId,
        recordIndex: record.recordIndex,
        kind: "resident_working_note",
        status: "skipped_synthetic_policy",
        residentId: null,
        residentName: record.personLabel,
        relationshipId: null,
        description: "Not imported — synthetic-data policy.",
        reason: record.doNotInferNote ?? "Synthetic-data policy.",
      });
      continue;
    }

    let matches: MatchResult[];
    if (record.recordIndex === 1) {
      const { a, b } = matchFirstNamePair("Johnny", "Lajuana", residents);
      matches = [a, b];
    } else if (record.personLabel.split(" ").length === 1) {
      matches = [matchByFirstNameOrNickname(record.personLabel, residents, nicknames)];
    } else {
      matches = [matchResident(record.personLabel, record.apartmentHint, residents)];
    }
    matchLog.push(...matches);
    for (const m of matches) {
      log(`  Match: "${m.sourceName}" -> ${m.status} (${m.confidence}, ${m.method}): ${m.reason}`);
    }

    const seenResidentIds = new Set<string>();
    const matchedResidents = matches.filter((m) => {
      if (m.status !== "matched" || !m.residentId) return false;
      if (seenResidentIds.has(m.residentId)) {
        log(`  Note: "${m.sourceName}" resolves to the same resident already handled above — writing once, not twice.`);
        return false;
      }
      seenResidentIds.add(m.residentId);
      return true;
    });
    if (matchedResidents.length === 0) {
      log(`  No resident matched — skipping all destinations for this record.`);
      planned.push({
        sourceId: record.sourceId,
        recordIndex: record.recordIndex,
        kind: "relationship_working_note",
        status: matches.some((m) => m.status === "ambiguous") ? "skipped_ambiguous" : "skipped_unmatched",
        residentId: null,
        residentName: record.personLabel,
        relationshipId: null,
        description: "Not imported — resident identity could not be resolved.",
        reason: matches.map((m) => m.reason).join(" "),
      });
      continue;
    }

    // Build the descriptive content once per record — reused across
    // whichever resident(s)/relationship(s) it applies to (rule 8: couple
    // records stay connected to both residents when both exist).
    const parts: string[] = [];
    if (record.proposedDays) parts.push(`Proposed days: ${record.proposedDays}.`);
    if (record.proposedTimes && record.proposedTimes.length > 0) parts.push(`Proposed times: ${record.proposedTimes.join(", ")}.`);
    if (record.proposedDuration) parts.push(`Proposed duration: ${record.proposedDuration}.`);
    if (record.frequency) parts.push(`Frequency: ${record.frequency}.`);
    if (record.need) parts.push(`Need: ${record.need}.`);
    if (record.contextNote) parts.push(record.contextNote);
    if (record.statusNote) parts.push(record.statusNote);
    if (record.historicalNote) parts.push(record.historicalNote);
    if (record.sourceTextUncertain) parts.push("Source uncertain: additional handwriting was partially illegible and is not represented here.");
    parts.push("This is planning/historical context from a whiteboard photo. It does not confirm a service was approved, started, or is currently active.");
    const noteContent = `Whiteboard planning note (${record.sourceId}): ${parts.join(" ")}`;

    for (const match of matchedResidents) {
      const residentId = match.residentId!;
      const residentName = match.residentName;
      const relationships = await relationshipsFor(residentId);
      const relationship = mostRecentNonClosedRelationship(relationships);

      if (record.destinations.includes("current_needs_reinforce") && record.need) {
        const needList = record.need.split(",").map((n) => n.trim()).filter(Boolean);
        await planCurrentNeedsAppend(record.sourceId, record.recordIndex, residentId, residentName, needList);
      }

      const wantsWorkingNote =
        record.destinations.includes("relationship_working_note") ||
        record.destinations.includes("resident_working_note") ||
        record.destinations.includes("timeline_or_dated_note");

      if (wantsWorkingNote) {
        const preferRelationship =
          record.destinations.includes("relationship_working_note") || record.destinations.includes("timeline_or_dated_note");
        if (preferRelationship && relationship) {
          await planRelationshipWorkingNote(record.sourceId, record.recordIndex, relationship.id, residentId, residentName, noteContent, "operational");
        } else {
          await planResidentWorkingNote(record.sourceId, record.recordIndex, residentId, residentName, noteContent, "operational");
        }
      }

      if (record.destinations.includes("service_opportunity")) {
        if (!relationship) {
          planned.push({
            sourceId: record.sourceId,
            recordIndex: record.recordIndex,
            kind: "relationship_service_opportunity",
            status: "skipped_uncertain_destination",
            residentId,
            residentName,
            relationshipId: null,
            description: "No existing relationship for this resident — Service Opportunity not created (this import never creates a new relationship).",
            reason: "Per data-placement principle C, Service Opportunity is only used when an appropriate relationship already exists.",
          });
          continue;
        }

        const visitsPerWeek =
          record.frequency === "3 times per day" ? 21 : record.proposedDays === "Friday" || record.proposedDays === "Wednesday, Friday" ? (record.proposedDays === "Friday" ? 1 : 2) : record.proposedDays === "Monday through Friday" ? 5 : record.frequency === "once per week" ? 1 : null;

        const estimatedMinutes = record.proposedDuration === "20 minutes" ? 20 : record.proposedDuration === "4 hours" ? 240 : record.proposedDuration === "1 hour" ? 60 : null;

        await planServiceOpportunity(record.sourceId, record.recordIndex, relationship.id, residentId, residentName, {
          serviceSummary: `${record.need ?? record.personLabel} (from ${record.sourceId}, whiteboard planning — not yet approved)`,
          visitsPerWeek,
          preferredDays: record.proposedDays ?? null,
          preferredTimeWindows: record.proposedTimes ? record.proposedTimes.join("; ") : null,
          estimatedVisitMinutes: estimatedMinutes,
        });
      }
    }
  }

  // ─── Reconciliation report ─────────────────────────────────────────────
  printReconciliationReport();
}

function printReconciliationReport() {
  log(`\n\n=== RECONCILIATION REPORT ${APPLY ? "(APPLIED)" : "(DRY RUN)"} ===`);

  const buckets: Record<string, PlannedWrite[]> = {};
  for (const p of planned) {
    buckets[p.status] = buckets[p.status] ?? [];
    buckets[p.status].push(p);
  }

  const order: PlannedWrite["status"][] = [
    "will_write",
    "no_change_needed",
    "skipped_duplicate",
    "skipped_synthetic_policy",
    "skipped_ambiguous",
    "skipped_unmatched",
    "skipped_uncertain_destination",
  ];

  for (const status of order) {
    const items = buckets[status] ?? [];
    log(`\n${status.toUpperCase()} (${items.length})`);
    for (const item of items) {
      log(`  [${item.sourceId} #${item.recordIndex}] ${item.kind} — ${item.residentName ?? "(unmatched)"}: ${item.description}`);
    }
  }

  const ambiguousOrUnmatchedMatches = matchLog.filter((m) => m.status !== "matched");
  log(`\nAMBIGUOUS/UNMATCHED SOURCE NAMES (${ambiguousOrUnmatchedMatches.length})`);
  for (const m of ambiguousOrUnmatchedMatches) {
    log(`  "${m.sourceName}" (apartment: ${m.sourceApartment ?? "none given"}) — ${m.status}: ${m.reason}`);
  }

  log(`\nTotal planned items: ${planned.length}`);
  log(`No AxisCare or Cinch records were touched by this script — it has no code path capable of it.`);
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
