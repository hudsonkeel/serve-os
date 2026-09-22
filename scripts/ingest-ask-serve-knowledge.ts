// Ask Serve knowledge foundation — deterministic, reproducible ingestion.
//
// Parses the checked-in source corpus (Serve P&P, Texas PAS regulations,
// the EPRP controlled procedure), builds the source-coverage manifest,
// and (when Supabase credentials are available) upserts everything into
// knowledge_documents/knowledge_sections. Idempotent: re-running against
// an unchanged corpus is a no-op at the row level (upsert keyed on
// source_path; a document's sections are fully replaced from its freshly
// parsed content each run, which is safe because sections have no
// independent identity of their own — see lib/data/knowledgeSections.ts).
//
// Run with:
//   npm run knowledge:ingest
// which expands to:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/ingest-ask-serve-knowledge.ts
//
// Parsing (and the coverage manifest it produces) requires no database
// and always runs; the write phase is skipped with a clear message if
// SUPABASE credentials are not present in the environment — this lets the
// manifest and parser output be inspected/regenerated without write
// access, e.g. in a sandboxed review environment.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePnpDocx } from "../lib/askServe/knowledge/parsePnp.ts";
import { parseEprpDocx } from "../lib/askServe/knowledge/parseEprp.ts";
import { parseTexasPasCorpus } from "../lib/askServe/knowledge/parseTexasPas.ts";
import { buildSourceCoverageManifest } from "../lib/askServe/knowledge/coverageManifest.ts";
import type { ParsedDocument } from "../lib/askServe/knowledge/types.ts";

const POLICIES_DIR = "docs/organizational-knowledge/policies";
const REGULATIONS_DIR = "docs/organizational-knowledge/regulations/texas-pas";
const CONTROLLED_PROCEDURES_DIR = "docs/organizational-knowledge/controlled-procedures";
const MANIFEST_PATH = "docs/architecture/ask-serve-knowledge-coverage-manifest.json";

async function findDocxFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(current: string) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.name.toLowerCase().endsWith(".docx")) found.push(fullPath);
    }
  }
  await walk(dir);
  return found;
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

async function parsePnpSource(): Promise<{ document: ParsedDocument | null; issues: string[] }> {
  const files = await findDocxFiles(POLICIES_DIR);
  if (files.length === 0) return { document: null, issues: [`No .docx found under ${POLICIES_DIR} — Serve P&P was not ingested.`] };
  if (files.length > 1) {
    return {
      document: null,
      issues: [`Expected exactly one Serve P&P .docx under ${POLICIES_DIR}, found ${files.length}: ${files.join(", ")}. Not ingesting until this is resolved — ingesting the wrong one silently would be worse than ingesting none.`],
    };
  }
  const buffer = await readFile(files[0]);
  return { document: parsePnpDocx(buffer, toPosixPath(files[0])), issues: [] };
}

async function parseEprpSource(): Promise<{ document: ParsedDocument | null; issues: string[] }> {
  const files = await findDocxFiles(CONTROLLED_PROCEDURES_DIR);
  if (files.length === 0) return { document: null, issues: [`No .docx found under ${CONTROLLED_PROCEDURES_DIR} — EPRP was not ingested.`] };
  if (files.length > 1) {
    return {
      document: null,
      issues: [`Expected exactly one EPRP .docx under ${CONTROLLED_PROCEDURES_DIR}, found ${files.length}: ${files.join(", ")}. Not ingesting until this is resolved.`],
    };
  }
  const buffer = await readFile(files[0]);
  return { document: parseEprpDocx(buffer, toPosixPath(files[0])), issues: [] };
}

async function main() {
  console.log("Ask Serve Knowledge Ingestion");
  console.log("==============================\n");

  const issues: string[] = [];

  const { document: pnpDocument, issues: pnpIssues } = await parsePnpSource();
  issues.push(...pnpIssues);

  const { document: eprpDocument, issues: eprpIssues } = await parseEprpSource();
  issues.push(...eprpIssues);

  const texasResult = await parseTexasPasCorpus(REGULATIONS_DIR);

  const documents: ParsedDocument[] = [...texasResult.documents];
  if (pnpDocument) documents.push(pnpDocument);
  if (eprpDocument) documents.push(eprpDocument);

  if (issues.length > 0) {
    console.log("Source discovery issues:");
    for (const issue of issues) console.log(`  ! ${issue}`);
    console.log("");
  }

  console.log(`Parsed ${documents.length} document(s), ${documents.reduce((n, d) => n + d.sections.length, 0)} section(s) total.`);
  for (const d of documents) {
    console.log(`  - [${d.sourceType}] ${d.title} — ${d.sections.length} section(s), status=${d.sourceStatus}, authority=${d.operationalAuthority}`);
    for (const w of d.warnings) console.log(`      WARN: ${w}`);
  }

  const manifest = buildSourceCoverageManifest(documents, texasResult.excluded);
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\nSource-coverage manifest written to ${MANIFEST_PATH}`);
  console.log(`  Section-number gaps recorded: ${manifest.sectionNumberGaps.length}`);
  console.log(`  Excluded files recorded: ${manifest.excludedFiles.length}`);
  console.log(`  Deduplication notes recorded: ${manifest.deduplicationNotes.length}`);

  const hasDbCredentials = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasDbCredentials) {
    console.log("\nSUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set — skipping the database write phase.");
    console.log("Parsing and the coverage manifest above completed successfully; re-run with credentials to write to Supabase.");
    return;
  }

  const { upsertKnowledgeDocument } = await import("../lib/data/knowledgeDocuments.ts");
  const { deleteKnowledgeSectionsForDocument, insertKnowledgeSections } = await import("../lib/data/knowledgeSections.ts");

  console.log("\nWriting to Supabase...");
  let documentsWritten = 0;
  let sectionsWritten = 0;
  const writeErrors: string[] = [];

  for (const doc of documents) {
    const { document: row, error } = await upsertKnowledgeDocument({
      sourceType: doc.sourceType,
      title: doc.title,
      sourceFilename: doc.sourceFilename,
      sourcePath: doc.sourcePath,
      sourceStatus: doc.sourceStatus,
      operationalAuthority: doc.operationalAuthority,
      effectiveOrUpdatedDate: doc.effectiveOrUpdatedDate,
      relatedSectionNumber: doc.relatedSectionNumber,
      sourceMetadata: doc.sourceMetadata,
      contentHash: doc.contentHash,
    });

    if (error || !row) {
      writeErrors.push(`${doc.sourcePath}: ${error}`);
      continue;
    }
    documentsWritten += 1;

    const { error: deleteError } = await deleteKnowledgeSectionsForDocument(row.id);
    if (deleteError) {
      writeErrors.push(`${doc.sourcePath}: could not clear prior sections: ${deleteError}`);
      continue;
    }

    const { inserted, error: insertError } = await insertKnowledgeSections(
      doc.sections.map((s) => ({
        documentId: row.id,
        sectionNumber: s.sectionNumber,
        sectionTitle: s.sectionTitle,
        subsectionLabel: s.subsectionLabel,
        chunkIndex: s.chunkIndex,
        sortOrder: s.sortOrder,
        bodyText: s.bodyText,
      }))
    );
    if (insertError) writeErrors.push(`${doc.sourcePath}: ${insertError}`);
    sectionsWritten += inserted;
  }

  console.log(`Documents written: ${documentsWritten}/${documents.length}`);
  console.log(`Sections written:  ${sectionsWritten}`);
  if (writeErrors.length > 0) {
    console.log(`Errors: ${writeErrors.length}`);
    for (const e of writeErrors) console.log(`  ! ${e}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Ingestion failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
