// Idempotency helpers for tables with no dedicated source/import column
// (resident_working_notes, relationship_working_notes). Every working note
// this import creates is tagged with a stable, deterministic marker in its
// own content — a rerun checks for that exact tag before inserting again,
// rather than relying on content equality (which would break the moment
// wording is refined).

export function importTag(sourceId: string, recordIndex: number): string {
  return `[Import: ${sourceId} #${recordIndex}]`;
}

export function withImportTag(sourceId: string, recordIndex: number, content: string): string {
  return `${importTag(sourceId, recordIndex)} ${content}`;
}

export function hasImportTag(existingContents: readonly string[], sourceId: string, recordIndex: number): boolean {
  const tag = importTag(sourceId, recordIndex);
  return existingContents.some((c) => c.includes(tag));
}
