// Provenance concepts shared by every Knowledge-layer primitive.
//
// ProvenanceConfidence's three literal values are deliberately identical to
// lib/scheduling/types.ts's existing ProvenanceConfidence — that type is
// NOT imported from here, on purpose. Importing it would create a
// dependency from the domain-agnostic Intelligence Platform core onto one
// domain's (Scheduling's) normalization layer, inverting the intended
// direction (domains depend on the shared core, never the other way
// around — see docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md
// Article X). If the two ever need to diverge, that's a sign this reuse
// decision needs revisiting, not a bug.
export type ProvenanceConfidence = "confirmed" | "inferred" | "unknown";

// Attached to every Historical Fact (and, once implemented in Phase E,
// every Reference Knowledge row). Carries where a piece of knowledge came
// from without ever letting the vendor's own shape leak upward — see
// Constitution Article III's "vendor provenance should remain visible
// without leaking vendor-specific data models upward."
export interface SourceProvenance {
  // Free-form but conventionally a short slug: "axiscare", "cinch_ccm",
  // "serve_os", "family", "community_staff". Not a closed union — new
  // source systems are expected over time.
  readonly sourceSystem: string;
  readonly sourceRecordId: string | null;
  readonly provenanceConfidence: ProvenanceConfidence;
}
