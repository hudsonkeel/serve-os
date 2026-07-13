import type {
  AxisCareRawVisit,
  AxisCareRawSchedule,
  AxisCareVisitPersonRef,
} from "../integrations/axiscare/types.ts";
import { parseAxisCareDateTime, DEFAULT_TIMEZONE } from "./dateTime.ts";
import { determineVisitStatus } from "./status.ts";
import type {
  ServeCareModel,
  ServeModificationReason,
  ServePersonRef,
  ServeRecurringSchedule,
  ServeScheduleVisit,
  ServeServiceRef,
  ProvenanceConfidence,
} from "./types.ts";

// Empty until a specific AxisCare service.code -> Serve care model mapping
// has been explicitly verified by the cross-system comparison described
// in docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md's CINCH
// Provenance section (CINCH CCM vs. AxisCare Real Time View vs. GET
// /api/visits vs. GET /api/schedules for a known community-care visit).
// Do not add an entry here from inference alone (field presence, short
// visit duration, etc.) — only from a confirmed comparison.
export const CARE_MODEL_BY_SERVICE_CODE: Record<string, ServeCareModel> = {};

function determineCareModel(serviceCode: string | null): {
  careModel: ServeCareModel;
  provenanceConfidence: ProvenanceConfidence;
} {
  if (serviceCode && CARE_MODEL_BY_SERVICE_CODE[serviceCode]) {
    return {
      careModel: CARE_MODEL_BY_SERVICE_CODE[serviceCode],
      provenanceConfidence: "confirmed",
    };
  }
  return { careModel: "unknown", provenanceConfidence: "unknown" };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function externalIdOf(person: AxisCareVisitPersonRef | undefined | null): string | null {
  if (!person) return null;
  if (person.externalId != null) return String(person.externalId);
  if (person.id != null) return String(person.id);
  return null;
}

function hasPersonIdentity(person: AxisCareVisitPersonRef | undefined | null): boolean {
  if (!person) return false;
  return (
    person.id != null ||
    person.externalId != null ||
    Boolean(person.firstName) ||
    Boolean(person.lastName)
  );
}

// Resident/caregiver display names are built ONLY from firstName/lastName
// already present on the Visit payload — this task deliberately does not
// call the Clients or Caregivers endpoints to enrich identity (both
// expose extensive sensitive fields; see the Client Privacy Policy in
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md). AxisCare's Visit
// response does not appear to expose a resident "goes by"/preferred name
// — a future Serve resident-mapping step may replace this with Serve's
// own preferred-name convention (see components/residents' preferredName
// handling), not this integration.
function buildDisplayName(person: AxisCareVisitPersonRef | undefined | null): string {
  if (!person) return "Unknown";
  const first = typeof person.firstName === "string" ? person.firstName.trim() : "";
  const last = typeof person.lastName === "string" ? person.lastName.trim() : "";
  const full = [first, last].filter(Boolean).join(" ");
  return full || "Unknown";
}

function buildPersonRef(person: AxisCareVisitPersonRef | undefined | null): ServePersonRef {
  return {
    externalId: externalIdOf(person),
    displayName: buildDisplayName(person),
  };
}

function buildServiceRef(
  service: AxisCareRawVisit["service"] | AxisCareRawSchedule["service"]
): ServeServiceRef | null {
  if (!service) return null;
  return {
    externalId: service.id != null ? String(service.id) : null,
    code: stringOrNull(service.code),
    description: stringOrNull(service.description),
    procedureCode: stringOrNull(service.procedureCode),
  };
}

function buildModificationReason(
  reason: AxisCareRawVisit["modificationReason"]
): ServeModificationReason | null {
  if (!reason) return null;
  return {
    id: reason.id != null ? String(reason.id) : null,
    name: stringOrNull(reason.name),
  };
}

// Normalizes one raw AxisCare visit into a ServeScheduleVisit. Returns
// null for a visit with no usable external ID — a malformed/unusable
// record should be dropped by the caller (todaysSchedule.ts), not
// surfaced with a garbage empty-string ID.
export function normalizeAxisCareVisit(raw: AxisCareRawVisit): ServeScheduleVisit | null {
  const externalVisitId = raw.id != null ? String(raw.id) : null;
  if (!externalVisitId) return null;

  const timezone = stringOrNull(raw.timezone) ?? DEFAULT_TIMEZONE;
  const hasCaregiver = hasPersonIdentity(raw.caregiver);

  const clockInTime = parseAxisCareDateTime(raw.clockIn?.time ?? null, timezone);
  const clockOutTime = parseAxisCareDateTime(raw.clockOut?.time ?? null, timezone);

  const status = determineVisitStatus({
    removed: raw.removed === true,
    hasCaregiver,
    clockInTime,
    clockOutTime,
  });

  const serviceCode = stringOrNull(raw.service?.code);
  const { careModel, provenanceConfidence } = determineCareModel(serviceCode);

  // LIVE-FIELD AMBIGUITY: AxisCare visits carry both startDate/endDate and
  // scheduledStartDate/scheduledEndDate. Their exact semantic difference
  // was not confirmed by live discovery (which reports field names only,
  // never values). scheduledStartDate/scheduledEndDate is used as the
  // primary source for the "scheduled" window since the field name most
  // directly matches that concept; startDate/endDate is a fallback only
  // if the "scheduled" pair is absent. See docs/integrations/
  // AXISCARE_READ_ONLY_INTEGRATION.md.
  const scheduledStart =
    parseAxisCareDateTime(raw.scheduledStartDate ?? raw.startDate ?? null, timezone) ?? "";
  const scheduledEnd =
    parseAxisCareDateTime(raw.scheduledEndDate ?? raw.endDate ?? null, timezone) ?? "";

  return {
    externalVisitId,
    sourceSystem: "axiscare",

    resident: buildPersonRef(raw.client),
    caregiver: hasCaregiver ? buildPersonRef(raw.caregiver) : null,
    service: buildServiceRef(raw.service),

    scheduledStart,
    scheduledEnd,
    actualStart: clockInTime,
    actualEnd: clockOutTime,
    timezone: stringOrNull(raw.timezone),

    visitType: stringOrNull(raw.type),
    status,

    assigned: hasCaregiver,
    verified: raw.verified === true,
    removed: raw.removed === true,

    modificationReason: buildModificationReason(raw.modificationReason),

    careModel,
    provenanceConfidence,
  };
}

// Normalizes one raw AxisCare schedule (recurring plan entry) into a
// ServeRecurringSchedule. Returns null for an entry with no usable
// scheduleId. startTime/endTime are passed through as-is (not parsed into
// full ISO instants) — a recurring schedule has no single calendar date
// for a time-of-day to resolve against; see types.ts.
export function normalizeAxisCareSchedule(
  raw: AxisCareRawSchedule
): ServeRecurringSchedule | null {
  const externalScheduleId = raw.scheduleId != null ? String(raw.scheduleId) : null;
  if (!externalScheduleId) return null;

  const timezone = stringOrNull(raw.timezone) ?? DEFAULT_TIMEZONE;
  const serviceCode = stringOrNull(raw.service?.code);
  const { careModel } = determineCareModel(serviceCode);
  const hasCaregiver = hasPersonIdentity(raw.caregiver);

  return {
    externalScheduleId,
    externalPlanId: raw.planId != null ? String(raw.planId) : null,
    sourceSystem: "axiscare",

    residentExternalId: externalIdOf(raw.client),
    residentDisplayName: buildDisplayName(raw.client),

    caregiverExternalId: hasCaregiver ? externalIdOf(raw.caregiver) : null,
    caregiverDisplayName: hasCaregiver ? buildDisplayName(raw.caregiver) : null,

    day: stringOrNull(raw.day),
    startTime: stringOrNull(raw.startTime) ?? "",
    endTime: stringOrNull(raw.endTime) ?? "",
    timezone: stringOrNull(raw.timezone),
    effectiveStartDate: parseAxisCareDateTime(raw.startDate ?? null, timezone),
    effectiveEndDate: parseAxisCareDateTime(raw.endDate ?? null, timezone),
    frequency: stringOrNull(raw.frequency),

    serviceCode,
    serviceDescription: stringOrNull(raw.service?.description),
    careModel,
  };
}
