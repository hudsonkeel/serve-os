import { connection } from "next/server";
import { COMMUNITY, DEMO_PROSPECTS } from "@/lib/demo/communityData";
import { createServerClient } from "@/lib/supabase/server";
import { Prospect, ProspectStatus } from "@/lib/supabase/types";

export type ResidentTabValue =
  | "all"
  | "wellness_watch"
  | "prospects"
  | "active_clients"
  | "former_clients";

export type RelationshipStatus = "Prospect" | "Serve Client" | "Former Client";

export interface CommunityMetricCounts {
  totalResidents: number;
  activeProspects: number;
  serveClients: number;
  wellnessChecksDue: number;
  requiresFollowUp: number;
  pendingAssessments: number;
  familiesAwaitingProposal: number;
  formerClients: number;
  birthdaysThisWeek: number;
}

export interface CommunityResidentRecord {
  id: string;
  prospect: Prospect;
  residentName: string;
  familyContact: string;
  phone: string | null;
  email: string | null;
  supportType: string | null;
  startTiming: string | null;
  referralSource: string | null;
  createdAt: string;
  relationshipStatus: RelationshipStatus;
  source: "Website Intake" | "Demo Data";
}

export interface CommunityMetricsData {
  communityName: string;
  metrics: CommunityMetricCounts;
  residentTabCounts: Record<ResidentTabValue, number>;
  prospects: Prospect[];
  residentRecords: CommunityResidentRecord[];
  error?: string;
}

const ACTIVE_PROSPECT_STATUSES: ProspectStatus[] = [
  "new",
  "reviewing",
  "contacted",
  "assessment_scheduled",
];

function isActiveProspect(prospect: Prospect) {
  return ACTIVE_PROSPECT_STATUSES.includes(prospect.status);
}

function isWebsiteIntake(prospect: Prospect) {
  return prospect.source === "website_intake";
}

function normalizeEmail(email: string | null) {
  return email?.trim().toLowerCase() || null;
}

function normalizePhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 7 ? digits : null;
}

function normalizeName(first: string | null, last: string | null) {
  const name = [first, last].filter(Boolean).join(" ").trim().toLowerCase();
  return name || null;
}

function careRecipientFirstName(prospect: Prospect) {
  return prospect.care_recipient_first_name ?? prospect.resident_first_name;
}

function careRecipientLastName(prospect: Prospect) {
  return prospect.care_recipient_last_name ?? prospect.resident_last_name;
}

function prospectIdentity(prospect: Prospect) {
  const email = normalizeEmail(prospect.contact_email);
  if (email) return `email:${email}`;

  const phone = normalizePhone(prospect.contact_phone);
  const careRecipientName = normalizeName(
    careRecipientFirstName(prospect),
    careRecipientLastName(prospect)
  );
  if (phone && careRecipientName) {
    return `phone-care-recipient:${phone}:${careRecipientName}`;
  }
  if (phone) return `phone:${phone}`;

  return `id:${prospect.id}`;
}

function sortNewestFirst(prospects: Prospect[]) {
  return [...prospects].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function mergeProspects(realProspects: Prospect[]) {
  const realKeys = new Set(realProspects.map(prospectIdentity));
  const demoOnly = DEMO_PROSPECTS.filter(
    (prospect) => !realKeys.has(prospectIdentity(prospect))
  );

  return sortNewestFirst([...realProspects, ...demoOnly]);
}

function relationshipStatus(prospect: Prospect): RelationshipStatus {
  if (prospect.status === "converted") return "Serve Client";
  if (prospect.status === "closed") return "Former Client";
  return "Prospect";
}

function displayName(first: string | null, last: string | null, fallback: string) {
  return [first, last].filter(Boolean).join(" ") || fallback;
}

export function mapProspectToResidentRecord(
  prospect: Prospect
): CommunityResidentRecord {
  return {
    id: prospect.id,
    prospect,
    residentName: displayName(
      careRecipientFirstName(prospect),
      careRecipientLastName(prospect),
      "Unknown Prospect"
    ),
    familyContact: displayName(
      prospect.contact_first_name,
      prospect.contact_last_name,
      "No contact on file"
    ),
    phone: prospect.contact_phone,
    email: prospect.contact_email,
    supportType: prospect.support_type,
    startTiming: prospect.start_timing,
    referralSource: prospect.referral_source,
    createdAt: prospect.created_at,
    relationshipStatus: relationshipStatus(prospect),
    source: isWebsiteIntake(prospect) ? "Website Intake" : "Demo Data",
  };
}

function liveProspects(prospects: Prospect[]) {
  return prospects.filter(isWebsiteIntake);
}

function countDedupedActiveDemoProspects(realProspects: Prospect[]) {
  const realKeys = new Set(realProspects.map(prospectIdentity));

  return DEMO_PROSPECTS.filter(
    (prospect) => isActiveProspect(prospect) && realKeys.has(prospectIdentity(prospect))
  ).length;
}

function countLiveByStatus(
  prospects: Prospect[],
  predicate: (prospect: Prospect) => boolean
) {
  return liveProspects(prospects).filter(predicate).length;
}

function buildMetrics(
  prospects: Prospect[],
  realProspects: Prospect[]
): CommunityMetricCounts {
  const activeLiveProspects = countLiveByStatus(prospects, isActiveProspect);
  const dedupedActiveDemoProspects =
    countDedupedActiveDemoProspects(realProspects);
  const liveRequiresFollowUp = countLiveByStatus(prospects, (prospect) =>
    ["new", "reviewing"].includes(prospect.status)
  );
  const livePendingAssessments = countLiveByStatus(
    prospects,
    (prospect) => prospect.status === "assessment_scheduled"
  );
  const liveAwaitingProposal = countLiveByStatus(
    prospects,
    (prospect) => prospect.status === "contacted"
  );

  return {
    totalResidents: COMMUNITY.totalResidents,
    activeProspects:
      COMMUNITY.activeProspects + activeLiveProspects - dedupedActiveDemoProspects,
    serveClients: COMMUNITY.serveClients,
    wellnessChecksDue: COMMUNITY.wellnessChecksDue,
    requiresFollowUp: COMMUNITY.requiresFollowUp + liveRequiresFollowUp,
    pendingAssessments: COMMUNITY.pendingAssessments + livePendingAssessments,
    familiesAwaitingProposal:
      COMMUNITY.familiesAwaitingProposal + liveAwaitingProposal,
    formerClients: COMMUNITY.formerClients,
    birthdaysThisWeek: COMMUNITY.birthdaysThisWeek,
  };
}

function buildResidentTabCounts(
  metrics: CommunityMetricCounts
): Record<ResidentTabValue, number> {
  return {
    all: metrics.totalResidents,
    wellness_watch: metrics.wellnessChecksDue,
    prospects: metrics.activeProspects,
    active_clients: metrics.serveClients,
    former_clients: metrics.formerClients,
  };
}

async function fetchSupabaseProspects(): Promise<{
  prospects: Prospect[];
  error?: string;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getCommunityMetrics:supabase:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return {
      prospects: [],
      error: "Failed to load live Supabase prospects.",
    };
  }

  console.log("[getCommunityMetrics:supabase:success]", {
    rowCount: data?.length ?? 0,
    websiteIntakeCount:
      data?.filter((prospect) => prospect.source === "website_intake").length ??
      0,
    newestCreatedAt: data?.[0]?.created_at ?? null,
  });

  return { prospects: data ?? [] };
}

export async function getCommunityMetrics(): Promise<CommunityMetricsData> {
  await connection();

  const { prospects: realProspects, error } = await fetchSupabaseProspects();
  const prospects = mergeProspects(realProspects);
  const metrics = buildMetrics(prospects, realProspects);

  return {
    communityName: COMMUNITY.name,
    metrics,
    residentTabCounts: buildResidentTabCounts(metrics),
    prospects,
    residentRecords: prospects.map(mapProspectToResidentRecord),
    error,
  };
}

export async function getCommunityResidentById(id: string) {
  const data = await getCommunityMetrics();
  return (
    data.residentRecords.find((record) => record.id === id) ?? null
  );
}
