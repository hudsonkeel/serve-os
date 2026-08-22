begin;

-- Multi-Community Foundation, Phase E/F completion (1 of 1 migration this
-- pass) — canonical community identity on intake_assessment_sessions,
-- additive alongside the existing community_name_snapshot (which stays;
-- it's real historical/display information, never the canonical
-- relationship). Nullable, no default: a future direct-home Traditional
-- Care assessment may legitimately have no partner community at all —
-- never made globally non-null.
--
-- Pre-migration classification (this session, read-only, against
-- production): all 9 existing intake_assessment_sessions rows have a
-- real resident_id, and every one of those residents already has a
-- non-null community_id (all 9 -> Watermere at Frisco,
-- 6f40bc6e-8eb3-4edd-a084-8c56216b60b6). Zero ambiguous records — every
-- row resolves deterministically via the strongest source (the linked
-- resident's own canonical community_id), never guessed or defaulted.

alter table public.intake_assessment_sessions
  add column if not exists community_id uuid references public.communities(id);

comment on column public.intake_assessment_sessions.community_id is
  'Canonical community this assessment belongs to. Additive alongside community_name_snapshot, which remains the historical/display text field. Null is structurally valid -- a future direct-home Traditional Care assessment may have no partner community at all; never made globally non-null.';

-- Backfill: every existing row resolves via its linked resident (the only
-- source needed -- confirmed unambiguous for all 9 rows above).
update public.intake_assessment_sessions s
set community_id = r.community_id
from public.residents r
where s.resident_id = r.id
  and s.community_id is null
  and r.community_id is not null;

create index if not exists intake_assessment_sessions_community_id_idx
  on public.intake_assessment_sessions (community_id);

-- ROLLBACK:
--
--   drop index if exists intake_assessment_sessions_community_id_idx;
--   alter table public.intake_assessment_sessions drop column if exists community_id;

commit;
