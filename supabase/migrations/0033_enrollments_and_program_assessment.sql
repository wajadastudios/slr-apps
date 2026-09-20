-- Enrollment-based registration + per-program assessment.
--
-- Principles
--   Account      = users (identity that can log in)
--   Participant  = students (the person; for an adult it is the account itself,
--                  students.is_self = true)
--   Enrollment   = one participant in ONE program (+ its slot). Reports and
--                  records belong to an enrollment, never just to the person, so
--                  Adult Swim and Aquanatal of the same person stay separate.
--   Assessment   = configuration per program (indicators, scale, milestones).
--
-- Backward compatible: every existing student that has a program (or a
-- schedule) gets an ACTIVE 'legacy' enrollment, existing reports/records are
-- linked to it, and triggers keep creating enrollments for the old admin flows
-- (add student, assign schedule). Additive and safe to re-run.

-- ============================================================
-- 1. programs: how each program is assessed
-- ============================================================
alter table public.programs
  add column if not exists assessment_type text not null default 'score_5',
  add column if not exists records_mode text not null default 'medals',
  add column if not exists template_version integer not null default 1,
  add column if not exists self_registration boolean not null default false,
  add column if not exists requires_acknowledgement boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programs_assessment_type_check') then
    alter table public.programs add constraint programs_assessment_type_check
      check (assessment_type in ('score_5', 'support_level', 'observation'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'programs_records_mode_check') then
    alter table public.programs add constraint programs_records_mode_check
      check (records_mode in ('medals', 'personal_goals', 'none'));
  end if;
end $$;

update public.programs set self_registration = true where name in ('Teen & Adult Swim', 'Aquanatal');
update public.programs set requires_acknowledgement = true where name = 'Aquanatal';
update public.programs set assessment_type = 'support_level', records_mode = 'personal_goals' where name = 'Adaptive Swim';
update public.programs set assessment_type = 'observation', records_mode = 'none' where name = 'Aquanatal';

-- the participant row that IS the account holder (adult / self-registered)
alter table public.students add column if not exists is_self boolean not null default false;

-- ============================================================
-- 2. enrollments
-- ============================================================
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  program_id uuid not null references public.programs (id),
  status text not null default 'pending_review' check (
    status in (
      'pending_review', 'waiting_schedule', 'schedule_offered',
      'scheduled', 'active', 'cancelled', 'rejected'
    )
  ),
  source text not null default 'legacy' check (source in ('legacy', 'self_registered', 'admin')),
  preferred_schedule text,
  preferred_location text,
  -- the slot that is locked for this enrollment
  slot_id uuid references public.class_slots (id) on delete set null,
  -- a slot the admin has offered and the participant has not answered yet
  offered_slot_id uuid references public.class_slots (id) on delete set null,
  offered_at timestamptz,
  offer_token text unique,
  offer_expires_at timestamptz,
  decision_note text,
  -- administrative acknowledgement (e.g. Aquanatal) -- never medical data
  acknowledged_at timestamptz,
  acknowledgement_version text,
  -- short, non-medical accommodation note the assigned instructor may read
  adjustment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one LIVE enrollment per participant per program
create unique index if not exists enrollments_live_unique
  on public.enrollments (student_id, program_id)
  where status not in ('cancelled', 'rejected');
create index if not exists enrollments_status_idx on public.enrollments (status);
create index if not exists enrollments_program_idx on public.enrollments (program_id);

alter table public.enrollments enable row level security;

create or replace function public.parent_owns_enrollment(p_enrollment_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.students st on st.id = e.student_id
    where e.id = p_enrollment_id and st.parent_id = auth.uid()
  );
$$;

-- The pengajar assigned to the slot of THIS enrollment's program (or an
-- approved, unexpired substitute for that slot).
create or replace function public.pelatih_teaches_enrollment(p_enrollment_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.schedules s on s.student_id = e.student_id
    join public.class_slots cs on cs.id = s.slot_id and cs.program_id = e.program_id
    where e.id = p_enrollment_id
      and (
        cs.pelatih_id = auth.uid()
        or exists (
          select 1 from public.substitution_requests sr
          where sr.slot_id = cs.id
            and sr.requester_id = auth.uid()
            and sr.status = 'approved'
            and sr.access_until is not null
            and current_date <= sr.access_until
        )
      )
  );
$$;

grant execute on function public.parent_owns_enrollment(uuid) to authenticated;
grant execute on function public.pelatih_teaches_enrollment(uuid) to authenticated;

drop policy if exists "admin full access to enrollments" on public.enrollments;
create policy "admin full access to enrollments"
  on public.enrollments for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- participants and parents read their own; they change nothing directly
-- (registration, answering an offer and cancelling go through the RPCs below)
drop policy if exists "owner can read own enrollments" on public.enrollments;
create policy "owner can read own enrollments"
  on public.enrollments for select
  using (public.parent_owns_student(student_id));

-- Pengajar get a narrow function instead of table access, so offer tokens and
-- admin notes are never readable by them.
create or replace function public.pelatih_enrollments()
returns table (id uuid, student_id uuid, program_id uuid, status text, adjustment_note text)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.student_id, e.program_id, e.status, e.adjustment_note
  from public.enrollments e
  where public.pelatih_teaches_enrollment(e.id);
$$;

grant execute on function public.pelatih_enrollments() to authenticated;

-- ============================================================
-- 3. backfill + triggers so old flows keep producing enrollments
-- ============================================================
insert into public.enrollments (student_id, program_id, status, source)
select s.id, s.program_id, 'active', 'legacy'
from public.students s
where s.program_id is not null
on conflict (student_id, program_id) where status not in ('cancelled', 'rejected') do nothing;

insert into public.enrollments (student_id, program_id, status, source, slot_id)
select distinct on (sc.student_id, cs.program_id) sc.student_id, cs.program_id, 'active', 'legacy', sc.slot_id
from public.schedules sc
join public.class_slots cs on cs.id = sc.slot_id
on conflict (student_id, program_id) where status not in ('cancelled', 'rejected') do nothing;

update public.enrollments e
set slot_id = sc.slot_id
from public.schedules sc
join public.class_slots cs on cs.id = sc.slot_id
where e.slot_id is null
  and e.student_id = sc.student_id
  and e.program_id = cs.program_id
  and e.status not in ('cancelled', 'rejected');

create or replace function public.ensure_student_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.program_id is not null then
    insert into public.enrollments (student_id, program_id, status, source)
    values (new.id, new.program_id, 'active', 'legacy')
    on conflict (student_id, program_id) where status not in ('cancelled', 'rejected') do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists students_ensure_enrollment on public.students;
create trigger students_ensure_enrollment
  after insert or update of program_id on public.students
  for each row execute function public.ensure_student_enrollment();

-- Any schedule row (old admin flow, ortu add-child, accepted offer) is
-- reflected on the matching enrollment; a waiting/offered enrollment that
-- receives a slot becomes 'scheduled'.
create or replace function public.sync_enrollment_on_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
begin
  select program_id into v_program from public.class_slots where id = new.slot_id;
  if v_program is null then
    return new;
  end if;

  insert into public.enrollments as en (student_id, program_id, status, source, slot_id)
  values (new.student_id, v_program, 'active', 'legacy', new.slot_id)
  on conflict (student_id, program_id) where status not in ('cancelled', 'rejected')
  do update set
    slot_id = coalesce(en.slot_id, excluded.slot_id),
    status = case
      when en.status in ('pending_review', 'waiting_schedule', 'schedule_offered') then 'scheduled'
      else en.status
    end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists schedules_sync_enrollment on public.schedules;
create trigger schedules_sync_enrollment
  after insert on public.schedules
  for each row execute function public.sync_enrollment_on_schedule();

-- ============================================================
-- 4. reports + records belong to an enrollment
-- ============================================================
alter table public.progress_reports
  add column if not exists enrollment_id uuid references public.enrollments (id) on delete set null,
  add column if not exists program_id uuid references public.programs (id),
  -- how the scores were measured when written (score_5 / support_level /
  -- observation) and which version of the program template was in force
  add column if not exists assessment_type text not null default 'score_5',
  add column if not exists template_version integer not null default 1;

alter table public.performance_records
  add column if not exists enrollment_id uuid references public.enrollments (id) on delete set null,
  add column if not exists program_id uuid references public.programs (id);

create index if not exists progress_reports_enrollment_idx on public.progress_reports (enrollment_id);
create index if not exists performance_records_enrollment_idx on public.performance_records (enrollment_id);

update public.progress_reports r
set enrollment_id = e.id, program_id = e.program_id
from public.enrollments e
join public.students st on st.id = e.student_id
where r.enrollment_id is null
  and r.student_id = e.student_id
  and e.program_id = st.program_id
  and e.status not in ('cancelled', 'rejected');

update public.performance_records r
set enrollment_id = e.id, program_id = e.program_id
from public.enrollments e
join public.students st on st.id = e.student_id
where r.enrollment_id is null
  and r.student_id = e.student_id
  and e.program_id = st.program_id
  and e.status not in ('cancelled', 'rejected');

-- Integrity: the enrollment must belong to the same participant; new rows are
-- only accepted for an enrollment that is scheduled/active. program_id is
-- copied from the enrollment so lists never need to join it.
create or replace function public.guard_enrollment_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if new.enrollment_id is null then
    return new;
  end if;

  select student_id, program_id, status into v
  from public.enrollments where id = new.enrollment_id;

  if not found or v.student_id <> new.student_id then
    raise exception 'enrollment does not belong to this participant';
  end if;
  if tg_op = 'INSERT' and v.status not in ('scheduled', 'active') then
    raise exception 'enrollment is not active';
  end if;

  new.program_id := v.program_id;
  return new;
end;
$$;

drop trigger if exists progress_reports_guard_enrollment on public.progress_reports;
create trigger progress_reports_guard_enrollment
  before insert or update of enrollment_id, student_id on public.progress_reports
  for each row execute function public.guard_enrollment_row();

drop trigger if exists performance_records_guard_enrollment on public.performance_records;
create trigger performance_records_guard_enrollment
  before insert or update of enrollment_id, student_id on public.performance_records
  for each row execute function public.guard_enrollment_row();

-- RLS: a pengajar only sees / writes reports of enrollments assigned to them;
-- rows without an enrollment (none after the backfill) keep the old rule.
drop policy if exists "pelatih can read own reports" on public.progress_reports;
create policy "pelatih can read own reports"
  on public.progress_reports for select
  using (
    pelatih_id = auth.uid()
    or (enrollment_id is not null and public.pelatih_teaches_enrollment(enrollment_id))
    or (enrollment_id is null and public.pelatih_teaches_student(student_id))
  );

drop policy if exists "pelatih can insert own reports" on public.progress_reports;
create policy "pelatih can insert own reports"
  on public.progress_reports for insert
  with check (
    pelatih_id = auth.uid()
    and public.pelatih_teaches_student(student_id)
    and (enrollment_id is null or public.pelatih_teaches_enrollment(enrollment_id))
  );

drop policy if exists "pelatih can read accessible records" on public.performance_records;
create policy "pelatih can read accessible records"
  on public.performance_records for select
  using (
    pelatih_id = auth.uid()
    or (enrollment_id is not null and public.pelatih_teaches_enrollment(enrollment_id))
    or (enrollment_id is null and public.pelatih_teaches_student(student_id))
  );

drop policy if exists "pelatih can insert own records" on public.performance_records;
create policy "pelatih can insert own records"
  on public.performance_records for insert
  with check (
    pelatih_id = auth.uid()
    and public.pelatih_teaches_student(student_id)
    and (enrollment_id is null or public.pelatih_teaches_enrollment(enrollment_id))
  );

-- ============================================================
-- 5. milestones belong to a program
-- ============================================================
alter table public.milestones
  add column if not exists program_id uuid references public.programs (id) on delete restrict;

update public.milestones
set program_id = (select id from public.programs where name = 'Kids Swim' limit 1)
where program_id is null;

do $$
begin
  if not exists (select 1 from public.milestones where program_id is null) then
    alter table public.milestones alter column program_id set not null;
  end if;
end $$;

create index if not exists milestones_program_idx on public.milestones (program_id, sort_order);

-- Teen & Adult Swim starter set (medals; every item optional per goal path)
insert into public.milestones
  (program_id, seed_key, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order)
select p.id, t.seed_key, t.label, t.level, t.metric_type, t.stroke, t.distance_m, t.bronze, t.silver, t.gold, t.sort_order
from public.programs p
cross join (values
  ('adult-tahan-nafas',    'Tahan Nafas Terkontrol',            'Dasar',    'tahan_nafas',         null,        null::numeric,  5::numeric,  10::numeric, 20::numeric, 1),
  ('adult-mengapung',      'Mengapung Mandiri',                 'Dasar',    'mengapung_telentang', null,        null,           10,          20,          40,          2),
  ('adult-bebas-jarak',    'Gaya Bebas Tanpa Berhenti',         'Menengah', 'jarak_tempuh',        'Bebas',     null,           25,          50,          100,         3),
  ('adult-waktu-25-bebas', 'Waktu 25 m Gaya Bebas',             'Menengah', 'waktu_tempuh',        'Bebas',     25,             70,          55,          45,          4),
  ('adult-waktu-50-bebas', 'Waktu 50 m Gaya Bebas',             'Mahir',    'waktu_tempuh',        'Bebas',     50,             150,         120,         90,          5),
  ('adult-treading',       'Treading Water',                    'Mahir',    'treading_water',      null,        null,           30,          60,          120,         6)
) as t(seed_key, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order)
where p.name = 'Teen & Adult Swim'
on conflict (seed_key) do nothing;

-- ============================================================
-- 6. assessment templates for the non-Kids programs
--    (old configuration is ARCHIVED, never deleted, so any score already
--     written against it still resolves)
-- ============================================================
create temporary table _tpl (
  program_name text, gname text, gorder int, ikey text, label text, iorder int
) on commit drop;

insert into _tpl values
  ('Teen & Adult Swim', 'Water Confidence',            1, 'tpl_ta_wc_nyaman',      'Nyaman berada di air',                     1),
  ('Teen & Adult Swim', 'Water Confidence',            1, 'tpl_ta_wc_wajah',       'Wajah masuk air & bubbling',               2),
  ('Teen & Adult Swim', 'Water Confidence',            1, 'tpl_ta_wc_dalam',       'Nyaman di air yang lebih dalam',           3),
  ('Teen & Adult Swim', 'Independent Swimming',        2, 'tpl_ta_is_apung',       'Mengapung mandiri',                        1),
  ('Teen & Adult Swim', 'Independent Swimming',        2, 'tpl_ta_is_luncur',      'Meluncur',                                 2),
  ('Teen & Adult Swim', 'Independent Swimming',        2, 'tpl_ta_is_jarak',       'Berenang mandiri jarak pendek',            3),
  ('Teen & Adult Swim', 'Independent Swimming',        2, 'tpl_ta_is_arah',        'Mengubah arah dan berbalik',               4),
  ('Teen & Adult Swim', 'Technique',                   3, 'tpl_ta_tk_posisi',      'Posisi tubuh',                             1),
  ('Teen & Adult Swim', 'Technique',                   3, 'tpl_ta_tk_kaki',        'Gerakan kaki',                             2),
  ('Teen & Adult Swim', 'Technique',                   3, 'tpl_ta_tk_tangan',      'Gerakan tangan',                           3),
  ('Teen & Adult Swim', 'Technique',                   3, 'tpl_ta_tk_napas',       'Pernapasan',                               4),
  ('Teen & Adult Swim', 'Technique',                   3, 'tpl_ta_tk_koordinasi',  'Koordinasi gerakan',                       5),
  ('Teen & Adult Swim', 'Stamina & Water Safety',      4, 'tpl_ta_sw_stamina',     'Stamina berenang',                         1),
  ('Teen & Adult Swim', 'Stamina & Water Safety',      4, 'tpl_ta_sw_treading',    'Treading water',                           2),
  ('Teen & Adult Swim', 'Stamina & Water Safety',      4, 'tpl_ta_sw_floating',    'Floating & bertahan di air',               3),
  ('Teen & Adult Swim', 'Stamina & Water Safety',      4, 'tpl_ta_sw_kolam',       'Keluar-masuk kolam dengan aman',           4),

  ('Adaptive Swim', 'Kenyamanan & Regulasi di Air',    1, 'tpl_ad_kr_masuk',       'Masuk dan berada di air',                  1),
  ('Adaptive Swim', 'Kenyamanan & Regulasi di Air',    1, 'tpl_ad_kr_tenang',      'Menjaga rasa nyaman dan tenang di air',    2),
  ('Adaptive Swim', 'Akses & Keselamatan',             2, 'tpl_ad_ak_akses',       'Masuk dan keluar kolam',                   1),
  ('Adaptive Swim', 'Akses & Keselamatan',             2, 'tpl_ad_ak_aturan',      'Mengikuti aturan keselamatan di kolam',    2),
  ('Adaptive Swim', 'Buoyancy & Keseimbangan',         3, 'tpl_ad_bk_apung',       'Mengapung',                                1),
  ('Adaptive Swim', 'Buoyancy & Keseimbangan',         3, 'tpl_ad_bk_seimbang',    'Menjaga keseimbangan tubuh',               2),
  ('Adaptive Swim', 'Pernapasan & Orientasi',          4, 'tpl_ad_po_napas',       'Mengatur pernapasan',                      1),
  ('Adaptive Swim', 'Pernapasan & Orientasi',          4, 'tpl_ad_po_orientasi',   'Orientasi posisi tubuh dan arah di air',   2),
  ('Adaptive Swim', 'Gerak & Propulsi',                5, 'tpl_ad_gp_kaki',        'Gerakan kaki untuk bergerak',              1),
  ('Adaptive Swim', 'Gerak & Propulsi',                5, 'tpl_ad_gp_tangan',      'Gerakan tangan untuk bergerak',            2),
  ('Adaptive Swim', 'Gerak & Propulsi',                5, 'tpl_ad_gp_jarak',       'Bergerak di air',                          3),
  ('Adaptive Swim', 'Komunikasi & Kemandirian',        6, 'tpl_ad_km_isyarat',     'Merespons isyarat dan instruksi',          1),
  ('Adaptive Swim', 'Komunikasi & Kemandirian',        6, 'tpl_ad_km_minta',       'Menyampaikan kebutuhan atau pilihan',      2),
  ('Adaptive Swim', 'Komunikasi & Kemandirian',        6, 'tpl_ad_km_mandiri',     'Menjalankan rutinitas sesi secara mandiri', 3),

  ('Aquanatal', 'Kenyamanan bergerak di air',          1, 'tpl_aq_kb_nyaman',      'Nyaman bergerak di air',                   1),
  ('Aquanatal', 'Kenyamanan bergerak di air',          1, 'tpl_aq_kb_posisi',      'Nyaman dengan posisi dan gerakan di air',  2),
  ('Aquanatal', 'Mengikuti cue napas dan relaksasi',   2, 'tpl_aq_nr_napas',       'Mengikuti cue napas',                      1),
  ('Aquanatal', 'Mengikuti cue napas dan relaksasi',   2, 'tpl_aq_nr_relaks',      'Mengikuti sesi relaksasi',                 2),
  ('Aquanatal', 'Partisipasi gerakan low-impact',      3, 'tpl_aq_lp_ikut',        'Mengikuti gerakan low-impact',             1),
  ('Aquanatal', 'Partisipasi gerakan low-impact',      3, 'tpl_aq_lp_tempo',       'Mengikuti tempo gerakan',                  2),
  ('Aquanatal', 'Menjaga intensitas nyaman',           4, 'tpl_aq_in_nyaman',      'Menjaga intensitas tetap nyaman',          1),
  ('Aquanatal', 'Menjaga intensitas nyaman',           4, 'tpl_aq_in_sesuai',      'Menyesuaikan gerakan dengan kondisi hari itu', 2),
  ('Aquanatal', 'Mengikuti jeda dan hidrasi',          5, 'tpl_aq_jh_jeda',        'Mengambil jeda saat diperlukan',           1),
  ('Aquanatal', 'Mengikuti jeda dan hidrasi',          5, 'tpl_aq_jh_minum',       'Mengikuti pengingat hidrasi',              2);

-- archive whatever these programs had before (only once: rows already using a
-- template key are left alone)
update public.indicators i
set active = false
from public.programs p
where i.program_id = p.id
  and p.name in (select distinct program_name from _tpl)
  and i.key not like 'tpl\_%' escape '\';

update public.indicator_groups g
set active = false
from public.programs p
where g.program_id = p.id
  and p.name in (select distinct program_name from _tpl)
  and not exists (
    select 1 from _tpl t where t.program_name = p.name and t.gname = g.name
  );

insert into public.indicator_groups (program_id, name, sort_order, active)
select distinct p.id, t.gname, t.gorder, true
from _tpl t
join public.programs p on p.name = t.program_name
where not exists (
  select 1 from public.indicator_groups g where g.program_id = p.id and g.name = t.gname
);

update public.indicator_groups g
set sort_order = t.gorder, active = true
from _tpl t
join public.programs p on p.name = t.program_name
where g.program_id = p.id and g.name = t.gname;

insert into public.indicators (program_id, group_id, key, label, sort_order, active)
select p.id, g.id, t.ikey, t.label, t.iorder, true
from _tpl t
join public.programs p on p.name = t.program_name
join public.indicator_groups g on g.program_id = p.id and g.name = t.gname
on conflict (program_id, key) do nothing;

-- ============================================================
-- 7. personal goals (Adaptive Swim): individual, never compared
-- ============================================================
create table if not exists public.personal_goals (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  unit text not null default 'kali' check (unit in ('detik', 'meter', 'kali')),
  baseline numeric,
  target numeric not null check (target > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_goal_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.personal_goals (id) on delete cascade,
  value numeric not null check (value >= 0),
  recorded_at date not null default current_date,
  note text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists personal_goals_enrollment_idx on public.personal_goals (enrollment_id);
create index if not exists personal_goal_entries_goal_idx on public.personal_goal_entries (goal_id, recorded_at);

alter table public.personal_goals enable row level security;
alter table public.personal_goal_entries enable row level security;

drop policy if exists "admin full access to personal_goals" on public.personal_goals;
create policy "admin full access to personal_goals"
  on public.personal_goals for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

drop policy if exists "pelatih manages goals of own enrollments" on public.personal_goals;
create policy "pelatih manages goals of own enrollments"
  on public.personal_goals for all
  using (public.pelatih_teaches_enrollment(enrollment_id))
  with check (public.pelatih_teaches_enrollment(enrollment_id));

drop policy if exists "owner reads goals of own enrollments" on public.personal_goals;
create policy "owner reads goals of own enrollments"
  on public.personal_goals for select
  using (public.parent_owns_enrollment(enrollment_id));

drop policy if exists "admin full access to personal_goal_entries" on public.personal_goal_entries;
create policy "admin full access to personal_goal_entries"
  on public.personal_goal_entries for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

drop policy if exists "pelatih manages entries of own goals" on public.personal_goal_entries;
create policy "pelatih manages entries of own goals"
  on public.personal_goal_entries for all
  using (
    exists (
      select 1 from public.personal_goals g
      where g.id = personal_goal_entries.goal_id
        and public.pelatih_teaches_enrollment(g.enrollment_id)
    )
  )
  with check (
    exists (
      select 1 from public.personal_goals g
      where g.id = personal_goal_entries.goal_id
        and public.pelatih_teaches_enrollment(g.enrollment_id)
    )
  );

drop policy if exists "owner reads entries of own goals" on public.personal_goal_entries;
create policy "owner reads entries of own goals"
  on public.personal_goal_entries for select
  using (
    exists (
      select 1 from public.personal_goals g
      where g.id = personal_goal_entries.goal_id
        and public.parent_owns_enrollment(g.enrollment_id)
    )
  );

-- ============================================================
-- 8. RPCs: registration, schedule offer, cancel
-- ============================================================
create or replace function public.register_participant_enrollment(
  p_program_id uuid,
  p_preferred_schedule text,
  p_preferred_location text,
  p_ack_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program record;
  v_student uuid;
  v_enrollment uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id, active, self_registration, requires_acknowledgement
  into v_program
  from public.programs where id = p_program_id;

  if not found or not v_program.active or not v_program.self_registration then
    raise exception 'program not open for registration';
  end if;
  if v_program.requires_acknowledgement and coalesce(trim(p_ack_version), '') = '' then
    raise exception 'acknowledgement required';
  end if;

  select id into v_student
  from public.students where parent_id = auth.uid() and is_self limit 1;

  if v_student is null then
    select coalesce(full_name, email) into v_name from public.users where id = auth.uid();
    insert into public.students (full_name, parent_id, program_id, active, is_self)
    values (coalesce(v_name, 'Peserta'), auth.uid(), null, true, true)
    returning id into v_student;
  end if;

  if exists (
    select 1 from public.enrollments
    where student_id = v_student and program_id = p_program_id
      and status not in ('cancelled', 'rejected')
  ) then
    raise exception 'already enrolled';
  end if;

  insert into public.enrollments (
    student_id, program_id, status, source,
    preferred_schedule, preferred_location, acknowledged_at, acknowledgement_version
  )
  values (
    v_student, p_program_id, 'pending_review', 'self_registered',
    nullif(trim(coalesce(p_preferred_schedule, '')), ''),
    nullif(trim(coalesce(p_preferred_location, '')), ''),
    case when coalesce(trim(p_ack_version), '') = '' then null else now() end,
    nullif(trim(coalesce(p_ack_version, '')), '')
  )
  returning id into v_enrollment;

  update public.students set program_id = coalesce(program_id, p_program_id) where id = v_student;

  return v_enrollment;
end;
$$;

grant execute on function public.register_participant_enrollment(uuid, text, text, text) to authenticated;

-- core of "answer an offer": one transaction, slot row locked, capacity
-- re-checked. Not exposed directly.
create or replace function public._respond_schedule_offer(p_enrollment_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  v_capacity integer;
  v_filled integer;
begin
  select * into e from public.enrollments where id = p_enrollment_id for update;

  if not found then
    return 'not_found';
  end if;
  if e.status <> 'schedule_offered' or e.offered_slot_id is null then
    return 'not_pending';
  end if;

  if e.offer_expires_at is not null and e.offer_expires_at < now() then
    update public.enrollments
    set status = 'waiting_schedule', offered_slot_id = null, offer_token = null,
        offer_expires_at = null, updated_at = now()
    where id = e.id;
    return 'expired';
  end if;

  if not p_accept then
    update public.enrollments
    set status = 'waiting_schedule', offered_slot_id = null, offer_token = null,
        offer_expires_at = null, decision_note = 'Peserta belum cocok dengan jadwal yang ditawarkan',
        updated_at = now()
    where id = e.id;
    return 'declined';
  end if;

  select capacity into v_capacity from public.class_slots where id = e.offered_slot_id for update;
  if v_capacity is null then
    update public.enrollments
    set status = 'waiting_schedule', offered_slot_id = null, offer_token = null,
        offer_expires_at = null, updated_at = now()
    where id = e.id;
    return 'slot_full';
  end if;

  select count(*) into v_filled from public.schedules where slot_id = e.offered_slot_id;
  if v_filled >= v_capacity then
    update public.enrollments
    set status = 'waiting_schedule', offered_slot_id = null, offer_token = null,
        offer_expires_at = null, updated_at = now()
    where id = e.id;
    return 'slot_full';
  end if;

  insert into public.schedules (student_id, slot_id)
  values (e.student_id, e.offered_slot_id)
  on conflict (student_id, slot_id) do nothing;

  update public.enrollments
  set status = 'scheduled', slot_id = e.offered_slot_id, offered_slot_id = null,
      offer_token = null, offer_expires_at = null, decision_note = null, updated_at = now()
  where id = e.id;
  return 'accepted';
end;
$$;

revoke all on function public._respond_schedule_offer(uuid, boolean) from public;

create or replace function public.respond_schedule_offer_by_token(p_token text, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.enrollments where offer_token = p_token;
  if v_id is null then
    return 'not_found';
  end if;
  return public._respond_schedule_offer(v_id, p_accept);
end;
$$;

create or replace function public.respond_schedule_offer_for_me(p_enrollment_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.parent_owns_enrollment(p_enrollment_id) then
    return 'not_found';
  end if;
  return public._respond_schedule_offer(p_enrollment_id, p_accept);
end;
$$;

grant execute on function public.respond_schedule_offer_by_token(text, boolean) to anon, authenticated;
grant execute on function public.respond_schedule_offer_for_me(uuid, boolean) to authenticated;

-- what the public "approve schedule" page may show for a token
create or replace function public.get_schedule_offer(p_token text)
returns table (
  enrollment_id uuid,
  participant_name text,
  program_name text,
  slot_label text,
  day_of_week smallint,
  start_time time,
  location text,
  expires_at timestamptz,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, split_part(st.full_name, ' ', 1), p.name, cs.label, cs.day_of_week,
         cs.start_time, cs.location, e.offer_expires_at, e.status
  from public.enrollments e
  join public.students st on st.id = e.student_id
  join public.programs p on p.id = e.program_id
  left join public.class_slots cs on cs.id = e.offered_slot_id
  where e.offer_token = p_token;
$$;

grant execute on function public.get_schedule_offer(text) to anon, authenticated;

-- a participant may withdraw a registration that has not started yet
create or replace function public.cancel_my_enrollment(p_enrollment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  if auth.uid() is null or not public.parent_owns_enrollment(p_enrollment_id) then
    return 'not_found';
  end if;

  select * into e from public.enrollments where id = p_enrollment_id for update;
  if e.status not in ('pending_review', 'waiting_schedule', 'schedule_offered', 'scheduled') then
    return 'not_cancellable';
  end if;

  if e.status = 'scheduled' and e.slot_id is not null then
    delete from public.schedules where student_id = e.student_id and slot_id = e.slot_id;
  end if;

  update public.enrollments
  set status = 'cancelled', offered_slot_id = null, offer_token = null,
      offer_expires_at = null, updated_at = now()
  where id = e.id;
  return 'cancelled';
end;
$$;

grant execute on function public.cancel_my_enrollment(uuid) to authenticated;
