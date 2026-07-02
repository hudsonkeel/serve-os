alter table public.residents
  add column if not exists serve_relationship_status text not null default 'none';

do $$
begin
  if to_regclass('public.resident_relationship_imports') is not null then
    alter table public.resident_relationship_imports
      add column if not exists resident_id uuid;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'resident_relationship_imports_resident_id_fkey'
        and conrelid = 'public.resident_relationship_imports'::regclass
    ) then
      alter table public.resident_relationship_imports
        add constraint resident_relationship_imports_resident_id_fkey
        foreign key (resident_id) references public.residents(id)
        on delete set null;
    end if;
  end if;

  if to_regclass('public.resident_contact_imports') is not null then
    alter table public.resident_contact_imports
      add column if not exists resident_id uuid;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'resident_contact_imports_resident_id_fkey'
        and conrelid = 'public.resident_contact_imports'::regclass
    ) then
      alter table public.resident_contact_imports
        add constraint resident_contact_imports_resident_id_fkey
        foreign key (resident_id) references public.residents(id)
        on delete set null;
    end if;
  end if;
end $$;

update public.residents
set serve_relationship_status = 'none'
where serve_relationship_status not in (
  'none',
  'prospect',
  'active_client',
  'hold',
  'former_client',
  'wellness_watch'
);

-- Correct any earlier prototype mapping that treated generic resident/source
-- "active" status as an active Serve client relationship.
update public.residents
set serve_relationship_status = 'none'
where serve_relationship_status = 'active_client'
  and lower(coalesce(source_status, '')) = 'active'
  and lower(coalesce(relationship_status, '')) in ('resident', 'active', '');

do $$
declare
  status_column text;
begin
  if to_regclass('public.resident_relationship_imports') is not null then
    select column_name
    into status_column
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'resident_relationship_imports'
      and column_name in (
        'cinch_status',
        'source_status',
        'relationship_status',
        'status'
      )
    order by array_position(
      array['cinch_status', 'source_status', 'relationship_status', 'status'],
      column_name
    )
    limit 1;

    if status_column is not null and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'resident_relationship_imports'
        and column_name = 'resident_id'
    ) then
      execute format($sql$
        with latest_relationship_import as (
          select distinct on (resident_id)
            resident_id,
            %1$I::text as imported_status
          from public.resident_relationship_imports
          where resident_id is not null
          order by resident_id
        )
        update public.residents as resident
        set serve_relationship_status = case
          when lower(coalesce(imported.imported_status, '')) in (
            'prospective client',
            'prospective_client',
            'prospect'
          ) then 'prospect'
          when lower(coalesce(imported.imported_status, '')) in (
            'active',
            'active client',
            'active_client',
            'serve_client'
          ) then 'active_client'
          when lower(coalesce(imported.imported_status, '')) = 'hold'
            then 'hold'
          when lower(coalesce(imported.imported_status, '')) in (
            'discharged',
            'former client',
            'former_client',
            'closed'
          ) then 'former_client'
          else resident.serve_relationship_status
        end
        from latest_relationship_import as imported
        where imported.resident_id::text = resident.id::text
      $sql$, status_column);
    end if;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'residents_serve_relationship_status_check'
      and conrelid = 'public.residents'::regclass
  ) then
    alter table public.residents
      add constraint residents_serve_relationship_status_check
      check (
        serve_relationship_status in (
          'none',
          'prospect',
          'active_client',
          'hold',
          'former_client',
          'wellness_watch'
        )
      );
  end if;
end $$;

create index if not exists residents_serve_relationship_status_idx
  on public.residents (serve_relationship_status)
  where is_active = true;

do $$
begin
  if to_regclass('public.resident_relationship_imports') is not null then
    create index if not exists resident_relationship_imports_resident_id_idx
      on public.resident_relationship_imports (resident_id)
      where resident_id is not null;
  end if;

  if to_regclass('public.resident_contact_imports') is not null then
    create index if not exists resident_contact_imports_resident_id_idx
      on public.resident_contact_imports (resident_id)
      where resident_id is not null;
  end if;
end $$;
