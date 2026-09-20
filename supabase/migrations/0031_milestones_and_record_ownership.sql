-- Admin-managed milestones + editable performance records.
--
-- 1. milestones: the 7 formerly hard-coded milestones become data
--    (seeded below), with an active flag and sort order.
-- 2. performance_records gains
--      awards      jsonb  -- { "<milestone id>": "bronze|silver|gold" }, frozen
--                            when the record is saved; NULL = legacy record
--                            (the app freezes those before any milestone edit)
--      created_by  uuid   -- who entered it (admin entries have pelatih_id NULL)
-- 3. RLS: a pelatih may now update/delete ONLY records they own
--    (pelatih_id = auth.uid()) for students they teach; admin keeps full
--    access; ortu stays read-only. Records with pelatih_id NULL (deleted
--    trainer, or entered by admin) are admin-only.
-- Badge rule (documented for admins/parents): a badge is decided when the
-- record is saved, against the targets in force then. Changing targets later
-- never removes an earned badge; it only applies to newly saved records.
-- Additive and safe to re-run.

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  seed_key text unique,
  label text not null check (length(trim(label)) > 0),
  level text not null default 'Umum' check (length(trim(level)) > 0),
  metric_type text not null check (
    metric_type in ('waktu_tempuh', 'jarak_tempuh', 'tahan_nafas', 'treading_water')
  ),
  stroke text check (stroke is null or stroke in ('Bebas', 'Dada', 'Punggung', 'Kupu-kupu')),
  distance_m numeric check (distance_m is null or distance_m > 0),
  bronze numeric not null check (bronze > 0),
  silver numeric not null check (silver > 0),
  gold numeric not null check (gold > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.performance_records
  add column if not exists awards jsonb,
  add column if not exists created_by uuid references public.users (id) on delete set null;

alter table public.milestones enable row level security;

drop policy if exists "authenticated can read milestones" on public.milestones;
create policy "authenticated can read milestones"
  on public.milestones for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin full access to milestones" on public.milestones;
create policy "admin full access to milestones"
  on public.milestones for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

drop policy if exists "pelatih can update own records" on public.performance_records;
create policy "pelatih can update own records"
  on public.performance_records for update
  using (
    pelatih_id = auth.uid()
    and public.pelatih_teaches_student(student_id)
  )
  with check (
    pelatih_id = auth.uid()
    and public.pelatih_teaches_student(student_id)
  );

drop policy if exists "pelatih can delete own records" on public.performance_records;
create policy "pelatih can delete own records"
  on public.performance_records for delete
  using (
    pelatih_id = auth.uid()
    and public.pelatih_teaches_student(student_id)
  );

-- A milestone that has already produced an award may not be deleted
-- (archive it instead). Atomic check + delete.
create or replace function public.admin_delete_milestone(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'not authorized';
  end if;

  if exists (
    select 1 from public.performance_records
    where awards is not null and awards ? p_id::text
  ) then
    raise exception 'milestone in use';
  end if;

  delete from public.milestones where id = p_id;
end;
$$;

grant execute on function public.admin_delete_milestone(uuid) to authenticated;

-- Seed the seven original milestones (same values as the old constants).
insert into public.milestones
  (seed_key, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order)
values
  ('tahan-nafas',        'Tahan Nafas',           'Dasar 1',  'tahan_nafas',    null,        null, 3,  5,  8,  1),
  ('jarak-meluncur',     'Jarak Meluncur',        'Dasar 2',  'jarak_tempuh',   null,        null, 5,  8,  10, 2),
  ('waktu-25m-bebas',    'Waktu 25m Gaya Bebas',  'Menengah', 'waktu_tempuh',   'Bebas',     25,   60, 50, 40, 3),
  ('treading-water',     'Treading Water',        'Mahir',    'treading_water', null,        null, 15, 22, 30, 4),
  ('waktu-25m-punggung', '25m Gaya Punggung',     'Mahir',    'waktu_tempuh',   'Punggung',  25,   65, 50, 35, 5),
  ('waktu-25m-dada',     '25m Gaya Dada',         'Mahir',    'waktu_tempuh',   'Dada',      25,   70, 55, 40, 6),
  ('waktu-25m-kupu',     '25m Gaya Kupu-kupu',    'Mahir',    'waktu_tempuh',   'Kupu-kupu', 25,   80, 60, 45, 7)
on conflict (seed_key) do nothing;
