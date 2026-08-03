// Shared resolver layer — the single place every screen reads a workforce
// member's display name, phone, email, primary vendor identity, or
// (Phase 1-unchanged) lifecycle status from. See the "Serve OS Canonical
// Profile Editor" scope, section 5. Never duplicate this logic in a page
// or component — call these instead.
import type { PersonVendorIdentityLink, WorkforceCommunityMembership, WorkforceMember } from "../supabase/types.ts";
import { selectPrimaryLink } from "./identityLinkLifecycle.ts";
import { evaluateWorkforceLifecycleStatus, type WorkforceLifecycleEvaluation } from "./lifecycleStatus.ts";

export function resolvePrimaryVendorIdentity(
  links: PersonVendorIdentityLink[],
  sourceSystem: string = "axiscare"
): PersonVendorIdentityLink | null {
  return selectPrimaryLink(links, sourceSystem);
}

// Priority, per the scope's own ordering:
//   1. Community display-name override, when viewing within that
//      community (pass communityMembership only on a community-scoped
//      page; omit it on global Workforce pages).
//   2. Canonical display_name.
//   3. Preferred name + legal last name.
//   4. Legal first name + legal last name.
//   5. Primary vendor identity display name.
//   6. "Unnamed workforce member".
export function resolveWorkforceDisplayName(
  member: WorkforceMember,
  opts: {
    communityMembership?: WorkforceCommunityMembership | null;
    primaryVendorIdentity?: PersonVendorIdentityLink | null;
  } = {}
): string {
  const communityOverride = opts.communityMembership?.community_display_name_override?.trim();
  if (communityOverride) return communityOverride;

  if (member.display_name && member.display_name.trim().length > 0) {
    return member.display_name.trim();
  }

  // Only priority 3 when a preferred name actually exists — otherwise
  // this would just be the last name alone, silently skipping priority 4
  // (legal first + last) below.
  if (member.preferred_name && member.preferred_name.trim().length > 0) {
    const preferredPlusLast = [member.preferred_name, member.legal_last_name].filter(Boolean).join(" ").trim();
    if (preferredPlusLast) return preferredPlusLast;
  }

  const legalFull = [member.legal_first_name, member.legal_last_name].filter(Boolean).join(" ").trim();
  if (legalFull) return legalFull;

  const vendorName = opts.primaryVendorIdentity?.vendor_display_name?.trim();
  if (vendorName) return vendorName;

  return "Unnamed workforce member";
}

interface AxisCareContactFields {
  personalEmail?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
}

// Canonical primary_phone/primary_email are Serve-owned and take priority;
// the primary vendor identity's contact fields are shown only as a
// fallback when Serve hasn't captured a canonical value.
export function resolveWorkforcePhone(
  member: WorkforceMember,
  primaryVendorIdentity?: PersonVendorIdentityLink | null
): string | null {
  if (member.primary_phone && member.primary_phone.trim().length > 0) return member.primary_phone.trim();
  const sourceData = (primaryVendorIdentity?.approved_source_data ?? {}) as AxisCareContactFields;
  return sourceData.mobilePhone ?? sourceData.homePhone ?? null;
}

export function resolveWorkforceEmail(
  member: WorkforceMember,
  primaryVendorIdentity?: PersonVendorIdentityLink | null
): string | null {
  if (member.primary_email && member.primary_email.trim().length > 0) return member.primary_email.trim();
  const sourceData = (primaryVendorIdentity?.approved_source_data ?? {}) as AxisCareContactFields;
  return sourceData.personalEmail ?? null;
}

// The subset of approved_source_data the derived lifecycle status reads —
// centralized here so every caller shares one extraction, instead of each
// page/data-layer file repeating the same inline cast.
function extractLifecycleSourceData(primaryVendorIdentity: PersonVendorIdentityLink | null | undefined) {
  const sourceData = primaryVendorIdentity?.approved_source_data as
    | { statusActive?: boolean | null; terminationDate?: string | null; startDate?: string | null }
    | undefined;
  if (!sourceData) return null;
  return {
    statusActive: sourceData.statusActive ?? null,
    terminationDate: sourceData.terminationDate ?? null,
    startDate: sourceData.startDate ?? null,
  };
}

// Phase 1/2 scope note: this still derives the GLOBAL lifecycle status
// from the primary vendor identity only — the scope's section 10
// (community-aware status, "Active in at least one community" vs a
// per-community status) is explicitly deferred; see the implementation
// report. Centralizing the call here still satisfies "never duplicate
// this logic across pages," and the community-aware version can be added
// to this same function later without changing any call site.
export function resolveWorkforceStatus(
  primaryVendorIdentity: PersonVendorIdentityLink | null | undefined,
  now?: () => Date
): WorkforceLifecycleEvaluation {
  return evaluateWorkforceLifecycleStatus(extractLifecycleSourceData(primaryVendorIdentity), now);
}
