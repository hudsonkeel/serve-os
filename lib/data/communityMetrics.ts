import { connection } from "next/server";
import { COMMUNITY } from "@/lib/demo/communityData";
import { createServerClient } from "@/lib/supabase/server";
import {
  getPreferredNamesByResident,
  getRelationshipProfile,
} from "@/lib/data/connections";
import {
  getWellnessFollowUpDashboardCounts,
  getWellnessWatchSummaryByResident,
  WellnessFollowUpDashboardCounts,
  WellnessWatchSummary,
} from "@/lib/data/wellnessFollowUps";
import { getLastObservedAtByResident } from "@/lib/data/wellnessNotes";
import {
  getActiveRelationshipSummariesByResident,
  getRelationshipPipelineCounts,
  RelationshipPipelineCounts,
  ResidentRelationshipSummary,
} from "@/lib/data/relationships";
import { collapseLegacyProspectStatus, deriveServeRelationshipStatus } from "@/lib/residents/search";
import type { CommunityQueryFilter } from "@/lib/auth/communityScope";
import {
  Resident,
  ResidentContactImport,
  ResidentRelationshipImport,
  ServeRelationshipStatus,
} from "@/lib/supabase/types";

export type ResidentTabValue =
  | "all"
  | "active_clients"
  | "hold"
  | "former_clients"
  | "wellness_watch";

export type ServeRelationshipLabel =
  | "No Serve Relationship"
  | "Active Client"
  | "On Hold"
  | "Former Client"
  | "Wellness Watch";

export interface CommunityMetricCounts {
  totalResidents: number;
  // Final Canonical Truth Cleanup: serveClients/onHold/formerClients
  // (CINCH-staged-status-priority aggregate counts) were removed here —
  // proven to have zero live consumers (the Dashboard, their one real
  // caller, was moved to the canonical ServeRelationshipProjection-based
  // count instead). Do not reintroduce a current-status aggregate from
  // record.serveRelationshipStatus/serveRelationshipLabel — those fields
  // remain, but only as the deliberate, documented low-priority
  // "legacy_resident_status" fallback input to
  // lib/residents/serveRelationshipProjection.ts's projectServeRelationship()
  // — never a source of current-status counts on their own.
  //
  // Deterministically derived from active (open/in_progress)
  // resident_wellness_follow_ups rows — see getWellnessFollowUpDashboardCounts().
  // Mutually exclusive buckets: a follow-up counts in exactly one of the two.
  wellnessFollowUpsDueOrOverdue: number;
  wellnessFollowUpsDueThisWeek: number;
  requiresFollowUp: number;
  pendingAssessments: number;
  familiesAwaitingProposal: number;
  birthdaysThisWeek: number;
}

export interface CommunityResidentRecord {
  id: string;
  resident: Resident;
  residentName: string;
  // Staff-captured "goes by" nickname from resident_relationship_profiles —
  // distinct from resident.preferred_name, which is imported/canonical.
  preferredNickname: string | null;
  // residentName with the nickname inserted (e.g. Michele "Mick" Helsley),
  // or residentName unchanged when there is no nickname.
  residentDisplayName: string;
  familyContact: string;
  phone: string | null;
  email: string | null;
  unitNumber: string | null;
  building: string | null;
  residentType: string | null;
  needsReview: string | null;
  importedRelationships: ResidentRelationshipImport[];
  importedContacts: ResidentContactImport[];
  importedSourceStatus: string | null;
  importedServiceModel: string | null;
  importReviewNotes: string[];
  sourceRelationshipStatus: ServeRelationshipStatus | null;
  sourceCinchStatus: string | null;
  sourceServiceType: string | null;
  sourceDisplayName: string | null;
  sourceFullName: string | null;
  sourceMatchNotes: string[];
  sourceNameDiffers: boolean;
  createdAt: string;
  updatedAt: string | null;
  serveRelationshipStatus: ServeRelationshipStatus;
  serveRelationshipLabel: ServeRelationshipLabel;
  source: "Supabase Resident";
  // Derived, not persisted — present only when the resident has at least one
  // open/in_progress resident_wellness_follow_ups row. Orthogonal to
  // serveRelationshipStatus: an active client or prospect can also be on
  // Wellness Watch. Only populated in the directory list path
  // (getCommunityMetrics); left null on the single-resident detail path
  // since that page already fetches full wellness data directly.
  wellnessWatch: WellnessWatchSummary | null;
  lastWellnessObservedAt: string | null;
  // Derived, not persisted — every active (non-closed) Relationship linked
  // to this resident, most recently updated first (see
  // getActiveRelationshipSummariesByResident()). Prospect status lives
  // exclusively in Relationships now — this is how the Residents directory
  // surfaces it, as read-only context, never as a resident-level field.
  // Only populated in the directory list path (getCommunityMetrics); left
  // empty on the single-resident detail path, which fetches full
  // Relationship data directly via getRelationshipsByResident().
  activeRelationships: ResidentRelationshipSummary[];
}

export interface CommunityMetricsData {
  communityName: string;
  metrics: CommunityMetricCounts;
  residentRecords: CommunityResidentRecord[];
  error?: string;
  residentsError?: string;
}

function displayName(first: string | null, last: string | null, fallback: string) {
  return [first, last].filter(Boolean).join(" ") || fallback;
}

function trimmed(value: string | null | undefined) {
  return value?.trim() || null;
}

function residentName(resident: Resident) {
  const nameFromRosterParts = displayName(
    trimmed(resident.first_name),
    trimmed(resident.last_name),
    ""
  );

  // Resident identity is always sourced from public.residents. Prefer the
  // roster first/last fields when present so imported display/full names can
  // never leak into the primary resident name.
  return (
    nameFromRosterParts ||
    trimmed(resident.display_name) ||
    trimmed(resident.full_name) ||
    "Unknown Resident"
  );
}

function formatNameWithNickname(
  resident: Resident,
  canonicalName: string,
  preferredNickname: string | null
): string {
  if (!preferredNickname) return canonicalName;

  const first = trimmed(resident.first_name);
  const last = trimmed(resident.last_name);
  if (first && last) {
    return `${first} "${preferredNickname}" ${last}`;
  }

  return `${canonicalName} "${preferredNickname}"`;
}

export function serveRelationshipStatus(
  resident: Resident
): ServeRelationshipStatus {
  return resident.serve_relationship_status ?? "none";
}

export function serveRelationshipLabel(
  status: ServeRelationshipStatus
): ServeRelationshipLabel {
  switch (status) {
    case "active_client":
      return "Active Client";
    case "hold":
      return "On Hold";
    case "former_client":
      return "Former Client";
    case "wellness_watch":
      return "Wellness Watch";
    default:
      // Includes the legacy 'prospect' value, if it ever reaches this
      // function directly — see collapseLegacyProspectStatus() above.
      return "No Serve Relationship";
  }
}

function sortResidents(residents: Resident[]) {
  return [...residents].sort((a, b) => {
    const aName = residentName(a).toLowerCase();
    const bName = residentName(b).toLowerCase();
    return aName.localeCompare(bName);
  });
}

function contactName(contact: ResidentContactImport) {
  return (
    contact.contact_name ||
    displayName(contact.first_name ?? null, contact.last_name ?? null, "")
  );
}

function relationshipImportStatus(importRecord: ResidentRelationshipImport) {
  return (
    importRecord.cinch_status ||
    importRecord.source_status ||
    importRecord.relationship_status ||
    importRecord.status ||
    null
  );
}

function normalizeServeRelationshipStatus(
  value: string | null | undefined
): ServeRelationshipStatus | null {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "_");
  switch (normalized) {
    case "prospect":
    case "prospective_client":
      return "prospect";
    case "active":
    case "active_client":
    case "serve_client":
      return "active_client";
    case "hold":
    case "on_hold":
      return "hold";
    case "discharged":
    case "former_client":
    case "closed":
      return "former_client";
    case "wellness_watch":
      return "wellness_watch";
    case "none":
      return "none";
    default:
      return null;
  }
}

// CINCH is never a relationship source, current or otherwise (same
// principle lib/residents/serveRelationshipProjection.ts's own header
// documents) — importRecord.cinch_status is deliberately excluded from
// this priority chain. It remains available separately, for pure
// historical/provenance display only, via importedSourceStatus/
// sourceCinchStatus in mapResidentToRecord() below — that field is
// never read back into current-relationship computation.
function stagedServeRelationshipStatus(
  relationshipImports: ResidentRelationshipImport[]
) {
  return sortNewestFirst(relationshipImports)
    .map((importRecord) =>
      normalizeServeRelationshipStatus(
        importRecord.serve_relationship_status ||
          importRecord.source_status ||
          importRecord.relationship_status ||
          importRecord.status
      )
    )
    .find(Boolean) ?? null;
}

function relationshipImportServiceModel(importRecord: ResidentRelationshipImport) {
  return (
    importRecord.service_model ||
    importRecord.service_type ||
    importRecord.care_model ||
    null
  );
}

function relationshipImportSourceName(importRecord: ResidentRelationshipImport) {
  return (
    importRecord.resident_name ||
    importRecord.display_name ||
    importRecord.full_name ||
    displayName(
      importRecord.first_name ?? null,
      importRecord.last_name ?? null,
      ""
    ) ||
    null
  );
}

function contactImportSourceName(importRecord: ResidentContactImport) {
  return (
    importRecord.resident_name ||
    importRecord.resident_display_name ||
    importRecord.resident_full_name ||
    displayName(
      importRecord.resident_first_name ?? null,
      importRecord.resident_last_name ?? null,
      ""
    ) ||
    null
  );
}

function relationshipImportFullName(importRecord: ResidentRelationshipImport) {
  return (
    importRecord.full_name ||
    displayName(
      importRecord.first_name ?? null,
      importRecord.last_name ?? null,
      ""
    ) ||
    null
  );
}

function sourceNameDiffers(canonicalName: string, sourceName: string | null) {
  if (!sourceName) return false;
  return normalizeText(canonicalName) !== normalizeText(sourceName);
}

function newestDate(value: {
  imported_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}) {
  return value.imported_at || value.updated_at || value.created_at || "";
}

function sortNewestFirst<T extends {
  imported_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(newestDate(b)).getTime() - new Date(newestDate(a)).getTime()
  );
}

function residentMatchKeys(resident: Resident) {
  return [
    resident.id,
    resident.external_source_key,
  ].filter(Boolean) as string[];
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

function normalizeUnit(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/^unit\s+/i, "") || null;
}

function nameUnitKey(name: string | null | undefined, unit: string | null | undefined) {
  const normalizedName = normalizeText(name);
  const normalizedUnit = normalizeUnit(unit);
  return normalizedName && normalizedUnit
    ? `${normalizedName}::${normalizedUnit}`
    : null;
}

function residentNameUnitKey(resident: Resident) {
  return (
    nameUnitKey(
      displayName(
        trimmed(resident.first_name),
        trimmed(resident.last_name),
        ""
      ),
      resident.unit_number
    ) ||
    nameUnitKey(resident.display_name, resident.unit_number) ||
    nameUnitKey(resident.full_name, resident.unit_number)
  );
}

function relationshipImportMatchKeys(importRecord: ResidentRelationshipImport) {
  return [
    importRecord.resident_id,
    importRecord.external_source_key,
    importRecord.resident_external_source_key,
    importRecord.source_resident_id,
    importRecord.resident_source_id,
  ].filter(Boolean) as string[];
}

function relationshipImportNameUnitKey(importRecord: ResidentRelationshipImport) {
  const name =
    importRecord.resident_name ||
    importRecord.full_name ||
    importRecord.display_name ||
    displayName(
      importRecord.first_name ?? null,
      importRecord.last_name ?? null,
      ""
    );
  const unit =
    importRecord.unit_number || importRecord.unit || importRecord.apartment || null;

  return nameUnitKey(name, unit);
}

function contactImportMatchKeys(importRecord: ResidentContactImport) {
  return [
    importRecord.resident_id,
    importRecord.external_source_key,
    importRecord.resident_external_source_key,
    importRecord.source_resident_id,
    importRecord.resident_source_id,
  ].filter(Boolean) as string[];
}

function contactImportNameUnitKey(importRecord: ResidentContactImport) {
  const name =
    importRecord.resident_name ||
    importRecord.resident_full_name ||
    importRecord.resident_display_name ||
    displayName(
      importRecord.resident_first_name ?? null,
      importRecord.resident_last_name ?? null,
      ""
    );
  const unit =
    importRecord.resident_unit_number ||
    importRecord.unit_number ||
    importRecord.unit ||
    importRecord.apartment ||
    null;

  return nameUnitKey(name, unit);
}

function mapImportsToResidents<T>(
  residents: Resident[],
  imports: T[],
  importKeys: (importRecord: T) => string[],
  importNameUnitKey: (importRecord: T) => string | null,
  reviewMessage: string
) {
  const residentIdByMatchKey = new Map<string, string>();
  const residentIdsByNameUnitKey = new Map<string, string[]>();

  residents.forEach((resident) => {
    residentMatchKeys(resident).forEach((key) => {
      residentIdByMatchKey.set(key, resident.id);
    });
    const fallbackKey = residentNameUnitKey(resident);
    if (fallbackKey) {
      residentIdsByNameUnitKey.set(fallbackKey, [
        ...(residentIdsByNameUnitKey.get(fallbackKey) ?? []),
        resident.id,
      ]);
    }
  });

  return imports.reduce<{
    importsByResidentId: Record<string, T[]>;
    reviewNotesByResidentId: Record<string, string[]>;
  }>(
    (acc, importRecord) => {
      const directResidentId = importKeys(importRecord)
      .map((key) => residentIdByMatchKey.get(key))
      .find(Boolean);

      if (directResidentId) {
        acc.importsByResidentId[directResidentId] = [
          ...(acc.importsByResidentId[directResidentId] ?? []),
          importRecord,
        ];
        return acc;
      }

      const fallbackKey = importNameUnitKey(importRecord);
      const fallbackResidentIds = fallbackKey
        ? residentIdsByNameUnitKey.get(fallbackKey) ?? []
        : [];

      if (fallbackResidentIds.length === 1) {
        const residentId = fallbackResidentIds[0];
        acc.importsByResidentId[residentId] = [
          ...(acc.importsByResidentId[residentId] ?? []),
          importRecord,
        ];
        acc.reviewNotesByResidentId[residentId] = [
          ...(acc.reviewNotesByResidentId[residentId] ?? []),
          reviewMessage,
        ];
      }

      return acc;
    },
    { importsByResidentId: {}, reviewNotesByResidentId: {} }
  );
}

export function mapResidentToRecord(
  resident: Resident,
  relationshipImports: ResidentRelationshipImport[] = [],
  contactImports: ResidentContactImport[] = [],
  importReviewNotes: string[] = [],
  preferredNickname: string | null = null,
  wellnessWatch: WellnessWatchSummary | null = null,
  lastWellnessObservedAt: string | null = null,
  activeRelationships: ResidentRelationshipSummary[] = []
): CommunityResidentRecord {
  const importedContacts = sortNewestFirst(contactImports);
  const importedRelationships = sortNewestFirst(relationshipImports);
  const stagedStatus = stagedServeRelationshipStatus(importedRelationships);
  const baseStatus = collapseLegacyProspectStatus(
    stagedStatus ?? serveRelationshipStatus(resident)
  );
  const status = deriveServeRelationshipStatus(baseStatus, activeRelationships);
  const primaryImportedContact =
    importedContacts.find((contact) => contact.is_primary) ?? importedContacts[0];
  const importedContactName = primaryImportedContact
    ? contactName(primaryImportedContact)
    : null;
  const importedSourceStatus =
    importedRelationships.map(relationshipImportStatus).find(Boolean) ?? null;
  const importedServiceModel =
    importedRelationships.map(relationshipImportServiceModel).find(Boolean) ??
    null;
  const sourceDisplayName =
    importedRelationships.map(relationshipImportSourceName).find(Boolean) ||
    importedContacts.map(contactImportSourceName).find(Boolean) ||
    null;
  const sourceFullName =
    importedRelationships.map(relationshipImportFullName).find(Boolean) ||
    sourceDisplayName;
  const canonicalName = residentName(resident);
  const importNameDiffers = sourceNameDiffers(canonicalName, sourceDisplayName);
  const sourceMatchNotes = [
    ...importReviewNotes,
    ...(importNameDiffers ? ["Source name differs from resident roster."] : []),
  ];
  const uniqueReviewNotes = [...new Set(sourceMatchNotes)];

  return {
    id: resident.id,
    resident,
    residentName: canonicalName,
    preferredNickname,
    residentDisplayName: formatNameWithNickname(
      resident,
      canonicalName,
      preferredNickname
    ),
    familyContact:
      resident.family_contact_name || importedContactName || "No contact on file",
    phone:
      resident.family_contact_phone ||
      primaryImportedContact?.phone ||
      resident.phone,
    email:
      resident.family_contact_email ||
      primaryImportedContact?.email ||
      resident.email,
    unitNumber: resident.unit_number,
    building: resident.building,
    residentType: resident.resident_type,
    needsReview:
      resident.needs_review ||
      (uniqueReviewNotes.length > 0 ? "staging_match_review" : null),
    importedRelationships,
    importedContacts,
    importedSourceStatus,
    importedServiceModel,
    importReviewNotes: uniqueReviewNotes,
    sourceRelationshipStatus: stagedStatus,
    sourceCinchStatus: importedSourceStatus,
    sourceServiceType: importedServiceModel,
    sourceDisplayName,
    sourceFullName,
    sourceMatchNotes: uniqueReviewNotes,
    sourceNameDiffers: importNameDiffers,
    createdAt: resident.created_at,
    updatedAt: resident.updated_at,
    serveRelationshipStatus: status,
    serveRelationshipLabel: serveRelationshipLabel(status),
    source: "Supabase Resident",
    wellnessWatch,
    lastWellnessObservedAt,
    activeRelationships,
  };
}

function buildMetrics(
  records: CommunityResidentRecord[],
  pipelineCounts: RelationshipPipelineCounts,
  wellnessDashboardCounts: WellnessFollowUpDashboardCounts
): CommunityMetricCounts {
  return {
    totalResidents: records.length,
    wellnessFollowUpsDueOrOverdue: wellnessDashboardCounts.dueOrOverdue,
    wellnessFollowUpsDueThisWeek: wellnessDashboardCounts.dueThisWeek,
    requiresFollowUp: pipelineCounts.requiresFollowUp,
    pendingAssessments: pipelineCounts.pendingAssessments,
    familiesAwaitingProposal: pipelineCounts.familiesAwaitingProposal,
    birthdaysThisWeek: 0,
  };
}

// SQL-first community scoping — the one query this whole module's resident
// population ultimately comes from. A "none" filter never even reaches the
// database: there is no community-owned population to return, and the
// caller (getCommunityMetrics) short-circuits before this runs.
async function fetchSupabaseResidents(filter: CommunityQueryFilter): Promise<{
  residents: Resident[];
  error?: string;
}> {
  const supabase = createServerClient();
  let query = supabase.from("residents").select("*").eq("is_active", true);
  if (filter.mode === "single") {
    query = query.eq("community_id", filter.communityId);
  }
  const { data, error } = await query.order("display_name", { ascending: true });

  if (error) {
    console.error("[getCommunityMetrics:residents:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return {
      residents: [],
      error: "Failed to load live Supabase residents.",
    };
  }

  return { residents: data ?? [] };
}

async function fetchRelationshipImports(): Promise<ResidentRelationshipImport[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_relationship_imports")
    .select("*");

  if (error) {
    console.error("[getCommunityMetrics:relationship-imports:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return data ?? [];
}

async function fetchContactImports(): Promise<ResidentContactImport[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_contact_imports")
    .select("*");

  if (error) {
    console.error("[getCommunityMetrics:contact-imports:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return data ?? [];
}

const EMPTY_COMMUNITY_METRICS: CommunityMetricsData = {
  communityName: COMMUNITY.name,
  metrics: {
    totalResidents: 0,
    wellnessFollowUpsDueOrOverdue: 0,
    wellnessFollowUpsDueThisWeek: 0,
    requiresFollowUp: 0,
    pendingAssessments: 0,
    familiesAwaitingProposal: 0,
    birthdaysThisWeek: 0,
  },
  residentRecords: [],
};

export async function getCommunityMetrics(filter: CommunityQueryFilter): Promise<CommunityMetricsData> {
  await connection();

  // No community-owned population is returned for "none" — never a fetch
  // that gets filtered away client-side. See communityScopeToQueryFilter()'s
  // own contract: unassigned/non_community/unauthorized scope resolves
  // here, not to every resident.
  if (filter.mode === "none") {
    return EMPTY_COMMUNITY_METRICS;
  }

  const { residents, error: residentsError } = await fetchSupabaseResidents(filter);
  const [
    pipelineCounts,
    relationshipImports,
    contactImports,
    preferredNamesByResident,
    wellnessWatchByResident,
    lastObservedAtByResident,
    wellnessDashboardCounts,
    activeRelationshipsByResident,
  ] = await Promise.all([
    getRelationshipPipelineCounts(),
    fetchRelationshipImports(),
    fetchContactImports(),
    getPreferredNamesByResident(),
    getWellnessWatchSummaryByResident(),
    getLastObservedAtByResident(),
    getWellnessFollowUpDashboardCounts(),
    getActiveRelationshipSummariesByResident(),
  ]);
  const relationshipImportMatches = mapImportsToResidents(
    residents,
    relationshipImports,
    relationshipImportMatchKeys,
    relationshipImportNameUnitKey,
    "Staged relationship matched by resident name and unit. Verify before using for workflow decisions."
  );
  const contactImportMatches = mapImportsToResidents(
    residents,
    contactImports,
    contactImportMatchKeys,
    contactImportNameUnitKey,
    "Imported contact matched by resident name and unit. Verify contact ownership before outreach."
  );

  const residentRecords = sortResidents(residents).map((resident) =>
    mapResidentToRecord(
      resident,
      relationshipImportMatches.importsByResidentId[resident.id] ?? [],
      contactImportMatches.importsByResidentId[resident.id] ?? [],
      [
        ...(relationshipImportMatches.reviewNotesByResidentId[resident.id] ?? []),
        ...(contactImportMatches.reviewNotesByResidentId[resident.id] ?? []),
      ],
      preferredNamesByResident.get(resident.id) ?? null,
      wellnessWatchByResident.get(resident.id) ?? null,
      lastObservedAtByResident.get(resident.id) ?? null,
      activeRelationshipsByResident.get(resident.id) ?? []
    )
  );
  const metrics = buildMetrics(residentRecords, pipelineCounts, wellnessDashboardCounts);

  return {
    communityName: residents[0]?.community_name || COMMUNITY.name,
    metrics,
    residentRecords,
    error: residentsError,
    residentsError,
  };
}

// SQL-first scope enforcement, not fetch-then-check: a resident outside the
// caller's authorized filter simply never comes back from this query — the
// same "not found" a genuinely missing id would produce. See section 6 of
// this phase's brief: a direct URL to a resident in another community must
// not bypass scope, and the caller (the resident detail page) already
// treats a null result as notFound().
export async function getCommunityResidentById(id: string, filter: CommunityQueryFilter) {
  await connection();

  if (filter.mode === "none") {
    return null;
  }

  const supabase = createServerClient();
  let residentQuery = supabase.from("residents").select("*").eq("id", id);
  if (filter.mode === "single") {
    residentQuery = residentQuery.eq("community_id", filter.communityId);
  }

  const [
    { data, error },
    relationshipImports,
    contactImports,
    profile,
  ] = await Promise.all([
    residentQuery.maybeSingle<Resident>(),
    fetchRelationshipImports(),
    fetchContactImports(),
    getRelationshipProfile(id),
  ]);

  if (error) {
    console.error("[getCommunityResidentById:error]", {
      id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  if (!data) return null;

  const relationshipImportMatches = mapImportsToResidents(
    [data],
    relationshipImports,
    relationshipImportMatchKeys,
    relationshipImportNameUnitKey,
    "Staged relationship matched by resident name and unit. Verify before using for workflow decisions."
  );
  const contactImportMatches = mapImportsToResidents(
    [data],
    contactImports,
    contactImportMatchKeys,
    contactImportNameUnitKey,
    "Imported contact matched by resident name and unit. Verify contact ownership before outreach."
  );

  return mapResidentToRecord(
    data,
    relationshipImportMatches.importsByResidentId[id] ?? [],
    contactImportMatches.importsByResidentId[id] ?? [],
    [
      ...(relationshipImportMatches.reviewNotesByResidentId[id] ?? []),
      ...(contactImportMatches.reviewNotesByResidentId[id] ?? []),
    ],
    profile?.preferred_name ?? null
  );
}
