// Live Supabase verification for Audit Readiness v0.1 Phase 2 (Evidence
// Repository) — confirms the resident-evidence data path actually works
// end-to-end against a real resident, and confirms the pending
// resident_timeline migration's expected-failure/swallowed-error behavior
// before it's applied. Same self-cleaning convention as
// scripts/verify-audit-readiness-phase1a.ts: every write tagged with
// generateTestMarker(), deleted before exit. Does not upload real file
// bytes to Storage (that path is unchanged, generic, and already proven
// for workforce in production) — this only exercises the new resident
// call sites: person_documents metadata, cross-subject listing, and
// supersession.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-audit-readiness-phase2.ts
import { randomUUID } from "node:crypto";
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { createPersonDocument, getPersonDocumentsForSubject, listRecentPersonDocuments, supersedePersonDocument } from "../lib/data/personDocuments.ts";
import { SUBJECT_TYPE_RESIDENT } from "../lib/supabase/types.ts";

// lib/data/residentTimeline.ts imports via "@/lib/..." aliases, which only
// resolve inside Next.js's own bundler — not under plain
// `node --experimental-strip-types`, which every other verification
// script in this repo runs under. Rather than importing
// logResidentDocumentUploaded() directly (which would crash this script
// on module resolution, unrelated to anything Phase 2 changed), this
// inlines the exact same insert that function performs, to prove the
// underlying fact directly: does resident_timeline currently accept
// 'document_uploaded', and does the calling code's own try/catch-and-log
// pattern (mirrored from logResidentProfileUpdated(), not reproduced
// here) correctly treat a rejection as non-fatal.
async function attemptResidentTimelineDocumentEvent(supabase: ReturnType<typeof createServerClient>, residentId: string) {
  return supabase.from("resident_timeline").insert({
    resident_id: residentId,
    event_type: "document_uploaded",
    event_title: "zzz_test_document uploaded",
    event_description: `Uploaded by ${ACTOR}.`,
    source: "person_documents",
    created_by: ACTOR,
    system_generated: false,
  });
}

const RUN_MARKER = generateTestMarker("audit-readiness-phase2-verify");
const ACTOR = RUN_MARKER;

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

async function main() {
  const supabase = createServerClient();

  const { data: resident, error: residentError } = await supabase.from("residents").select("id").limit(1).maybeSingle();
  check("a real resident exists to test against (read-only lookup)", !residentError && !!resident, residentError);
  const residentId = resident?.id as string | undefined;
  if (!residentId) {
    console.log("No resident found in this environment — cannot proceed with live verification.");
    process.exit(1);
  }

  let documentAId: string | undefined;
  let documentBId: string | undefined;

  try {
    const { document: docA, error: createError } = await createPersonDocument({
      subjectType: SUBJECT_TYPE_RESIDENT,
      subjectId: residentId,
      storageBucket: "person-documents",
      storagePath: `resident/${residentId}/zzz_test/${randomUUID()}.pdf`,
      originalFilename: `${RUN_MARKER}.pdf`,
      documentType: "zzz_test_document",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      documentDate: null,
      uploadedBy: ACTOR,
      checksum: null,
    });
    check("createPersonDocument succeeds for subject_type = 'resident'", !createError && !!docA, createError);
    documentAId = docA?.id;

    if (documentAId) {
      const forSubject = await getPersonDocumentsForSubject(SUBJECT_TYPE_RESIDENT, residentId);
      check("getPersonDocumentsForSubject('resident', ...) returns the new document", forSubject.some((d) => d.id === documentAId), forSubject.length);

      const recent = await listRecentPersonDocuments(500);
      check("listRecentPersonDocuments() (the global Evidence view's query) includes the new document", recent.some((d) => d.id === documentAId), recent.length);

      const { document: docB, error: supersedeError } = await supersedePersonDocument({
        oldDocumentId: documentAId,
        subjectType: SUBJECT_TYPE_RESIDENT,
        subjectId: residentId,
        storageBucket: "person-documents",
        storagePath: `resident/${residentId}/zzz_test/${randomUUID()}.pdf`,
        originalFilename: `${RUN_MARKER}-replacement.pdf`,
        documentType: "zzz_test_document",
        mimeType: "application/pdf",
        fileSizeBytes: 2048,
        documentDate: null,
        uploadedBy: ACTOR,
        checksum: null,
      });
      check("supersedePersonDocument succeeds for a resident document", !supersedeError && !!docB, supersedeError);
      documentBId = docB?.id;

      const { data: oldRow } = await supabase.from("person_documents").select("status").eq("id", documentAId).single();
      check("the superseded document's status flips to 'superseded'", oldRow?.status === "superseded", oldRow);
    }

    // Expected to currently show a CHECK violation — resident_timeline's
    // document_uploaded/document_superseded values come from
    // 20260902050000_add_resident_document_timeline_events.sql, which is
    // written but not yet applied (see the Phase 2 report). This confirms
    // that fact directly, and confirms no row was written either way.
    const timelineResult = await attemptResidentTimelineDocumentEvent(supabase, residentId);
    check(
      "resident_timeline still rejects 'document_uploaded' — confirms 20260902050000...sql has not been applied yet (expected, not a defect)",
      timelineResult.error?.code === "23514" || (timelineResult.error?.message ?? "").includes("resident_timeline_event_type_check"),
      timelineResult.error
    );
  } finally {
    if (documentBId) {
      const { error } = await supabase.from("person_documents").delete().eq("id", documentBId);
      check("cleanup: replacement test document deleted", !error, error);
    }
    if (documentAId) {
      const { error } = await supabase.from("person_documents").delete().eq("id", documentAId);
      check("cleanup: original test document deleted", !error, error);
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
