begin;

-- Community Roster Import + Reconciliation phase. Mirrors person-documents'
-- exact pattern (20260808000000): private bucket, signed-URL reads only,
-- never a public URL. Original filename is never part of the storage
-- path -- only roster_import_runs.source_filename metadata (matching
-- person_documents.original_filename's own convention).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-roster-imports',
  'community-roster-imports',
  false,
  15728640, -- 15 MB
  array[
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do nothing;

-- ROLLBACK:
--
--   delete from storage.buckets where id = 'community-roster-imports';

commit;
