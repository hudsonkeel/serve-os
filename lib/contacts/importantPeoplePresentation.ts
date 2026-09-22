// Pure display grouping for a canonical person's role rows (Slice C.3 refinement, 2026-09-19).
//
// Relationship-to-resident (e.g. "Daughter") and operational roles (Primary Contact, Decision
// Maker, ...) are conceptually different things, but both are stored as contact_roles.role_type
// values (see roleTypes.ts's own comment on the "relationship:" prefix convention). When the SAME
// relationship word is asserted by two different assessment field paths for the same person (e.g.
// primary_contact_relationship AND decision_maker_relationship both say "Daughter"), that is one
// fact about the person, not two — production surfaced this as "Daughter" rendered twice. This
// module decides what to SHOW; it never drops, merges, or mutates the underlying role rows
// themselves, so every contributing source fact is still there for provenance.

export const ROLE_LABELS: Record<string, string> = {
  primary_contact: "Primary Contact",
  decision_maker: "Decision Maker",
  emergency_contact: "Emergency Contact",
  medical_poa: "Medical POA",
  financial_poa: "Financial POA",
  guardian: "Guardian",
};

export const AUTHORITY_ROLE_TYPES: ReadonlySet<string> = new Set(["medical_poa", "financial_poa", "guardian"]);

export function isRelationshipRoleType(roleType: string): boolean {
  return roleType.startsWith("relationship:");
}

export function relationshipText(roleType: string): string {
  return roleType.slice("relationship:".length);
}

export function operationalRoleLabel(roleType: string): string {
  return ROLE_LABELS[roleType] ?? roleType;
}

export interface PresentedPersonRoles<TRole extends { roleType: string }> {
  /** Deduplicated (case-insensitive) relationship descriptors, in first-seen order. Usually zero
   * or one entry; more than one means the assessment genuinely asserted different relationship
   * words for this person (never silently collapsed into a single guess). */
  readonly relationshipLabels: readonly string[];
  /** Ordinary operational roles (primary_contact, decision_maker, emergency_contact) — excludes
   * relationship descriptors and authority-bearing roles, which get their own treatment. */
  readonly operationalRoles: readonly TRole[];
  /** Authority-bearing roles (medical_poa, financial_poa, guardian) — always shown with their own
   * claimed/verified status, never folded into the plain operational-role list. */
  readonly authorityRoles: readonly TRole[];
}

export function presentPersonRoles<TRole extends { roleType: string }>(
  roles: readonly TRole[]
): PresentedPersonRoles<TRole> {
  const seen = new Set<string>();
  const relationshipLabels: string[] = [];
  for (const role of roles) {
    if (!isRelationshipRoleType(role.roleType)) continue;
    const text = relationshipText(role.roleType);
    const key = text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    relationshipLabels.push(text);
  }

  const operationalRoles = roles.filter((r) => !isRelationshipRoleType(r.roleType) && !AUTHORITY_ROLE_TYPES.has(r.roleType));
  const authorityRoles = roles.filter((r) => AUTHORITY_ROLE_TYPES.has(r.roleType));

  return { relationshipLabels, operationalRoles, authorityRoles };
}
