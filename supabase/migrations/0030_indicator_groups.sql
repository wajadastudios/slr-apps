-- Structured assessment indicators, managed by admin per program.
--
-- Until now a program's indicators were a flat jsonb array of names
-- (programs.skill_template) and progress_reports.scores was keyed by that
-- exact name. This adds groups + indicators with a STABLE KEY separate from
-- the editable label:
--   * every existing indicator is migrated with key = its original name, so
--     all historical scores keep resolving with no rewrite of report data;
--   * new indicators get generated keys (ind_xxxxxxxx);
--   * renaming only changes `label`, never `key`, so old scores stay readable.
-- progress_reports.indicator_snapshot freezes the label/group of every scored
-- indicator at write time, so history renders as it was when written.
-- programs.skill_template is left in place (legacy, no longer edited).
-- Additive and safe to re-run.

create table if not exists public.indicator_groups (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.indicators (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  group_id uuid not null references public.indicator_groups (id) on delete cascade,
  key text not null check (length(trim(key)) > 0),
  label text not null check (length(trim(label)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (program_id, key)
);

create index if not exists indicator_groups_program_idx
  on public.indicator_groups (program_id, sort_order);
create index if not exists indicators_group_idx
  on public.indicators (group_id, sort_order);

alter table public.progress_reports
  add column if not exists indicator_snapshot jsonb;

alter table public.indicator_groups enable row level security;
alter table public.indicators enable row level security;

drop policy if exists "authenticated can read indicator_groups" on public.indicator_groups;
create policy "authenticated can read indicator_groups"
  on public.indicator_groups for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin full access to indicator_groups" on public.indicator_groups;
create policy "admin full access to indicator_groups"
  on public.indicator_groups for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

drop policy if exists "authenticated can read indicators" on public.indicators;
create policy "authenticated can read indicators"
  on public.indicators for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin full access to indicators" on public.indicators;
create policy "admin full access to indicators"
  on public.indicators for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- Keys that appear in any saved report score. Admin-only; used to tell the
-- admin which indicators can still be deleted.
create or replace function public.used_indicator_keys()
returns setof text
language sql
security definer
stable
set search_path = public
as $$
  select distinct k
  from public.progress_reports pr,
       lateral jsonb_object_keys(
         case when jsonb_typeof(pr.scores) = 'object' then pr.scores else '{}'::jsonb end
       ) as k
  where public.get_my_role() = 'admin';
$$;

grant execute on function public.used_indicator_keys() to authenticated;

-- Permanent delete, only when no report has ever scored this indicator.
-- Checked and executed atomically here so the app can't race it.
create or replace function public.admin_delete_indicator(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'not authorized';
  end if;

  select key into v_key from public.indicators where id = p_id;
  if v_key is null then
    raise exception 'indicator not found';
  end if;

  if exists (
    select 1 from public.progress_reports
    where jsonb_typeof(scores) = 'object' and scores ? v_key
  ) then
    raise exception 'indicator in use';
  end if;

  delete from public.indicators where id = p_id;
end;
$$;

grant execute on function public.admin_delete_indicator(uuid) to authenticated;

-- ============================================================
-- Seed: convert each program's existing skill_template into groups +
-- indicators. Group = text before " - " (typos normalised), otherwise a
-- single "Indikator" group. key = the ORIGINAL template string.
-- Skipped for any program that already has groups (safe to re-run).
-- ============================================================
do $$
declare
  p record;
  elem text;
  ord integer;
  norm text;
  pos integer;
  gname text;
  iname text;
  gid uuid;
  gmap jsonb;
  gcount integer;
  icount jsonb;
  n integer;
  preset text[];
  g text;
begin
  for p in select id, name, skill_template from public.programs loop
    if exists (select 1 from public.indicator_groups where program_id = p.id) then
      continue;
    end if;
    if p.skill_template is null
       or jsonb_typeof(p.skill_template) <> 'array'
       or jsonb_array_length(p.skill_template) = 0 then
      continue;
    end if;

    gmap := '{}'::jsonb;
    icount := '{}'::jsonb;
    gcount := 0;

    -- Kids Swim keeps a fixed, curriculum-defined group order.
    if lower(p.name) like '%kids swim%' then
      preset := array['Dasar', 'Water Safety', 'Gaya Bebas', 'Gaya Dada', 'Gaya Punggung', 'Gaya Kupu-Kupu'];
      foreach g in array preset loop
        gcount := gcount + 1;
        insert into public.indicator_groups (program_id, name, sort_order)
        values (p.id, g, gcount)
        returning id into gid;
        gmap := gmap || jsonb_build_object(g, gid::text);
      end loop;
    end if;

    for elem, ord in
      select value, ordinality
      from jsonb_array_elements_text(p.skill_template) with ordinality
    loop
      norm := regexp_replace(elem, 'Kupu\s*-\s*Kupu', 'Kupu-Kupu', 'g');
      norm := regexp_replace(norm, '^Gaya Daya\M', 'Gaya Dada');
      pos := position(' - ' in norm);
      if pos > 0 then
        gname := left(norm, pos - 1);
        iname := substr(norm, pos + 3);
      else
        gname := 'Indikator';
        iname := norm;
      end if;
      iname := replace(iname, 'Pernapasaran', 'Pernapasan');
      iname := replace(iname, 'Koordinasi gerakan', 'Koordinasi Gerakan');

      if gmap ? gname then
        gid := (gmap ->> gname)::uuid;
      else
        gcount := gcount + 1;
        insert into public.indicator_groups (program_id, name, sort_order)
        values (p.id, gname, gcount)
        returning id into gid;
        gmap := gmap || jsonb_build_object(gname, gid::text);
      end if;

      n := coalesce((icount ->> gid::text)::integer, 0) + 1;
      icount := icount || jsonb_build_object(gid::text, n);

      insert into public.indicators (program_id, group_id, key, label, sort_order)
      values (p.id, gid, elem, iname, n)
      on conflict (program_id, key) do nothing;
    end loop;
  end loop;
end $$;

-- Backfill: freeze the label/group of every already-scored indicator on
-- existing reports, so renaming or moving an indicator later does not rewrite
-- what an old report said. Only reports without a snapshot are touched.
update public.progress_reports pr
set indicator_snapshot = sub.snap
from (
  select
    r.id,
    jsonb_object_agg(
      i.key,
      jsonb_build_object(
        'label', i.label,
        'group', g.name,
        'gorder', g.sort_order,
        'order', i.sort_order
      )
    ) as snap
  from public.progress_reports r
  join public.students s on s.id = r.student_id
  cross join lateral jsonb_object_keys(
    case when jsonb_typeof(r.scores) = 'object' then r.scores else '{}'::jsonb end
  ) as k(key)
  join public.indicators i on i.program_id = s.program_id and i.key = k.key
  join public.indicator_groups g on g.id = i.group_id
  where r.indicator_snapshot is null
  group by r.id
) sub
where pr.id = sub.id;
