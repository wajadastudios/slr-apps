-- Kurikulum penilaian berlevel (6 skill, Level 1-3 untuk empat gaya), tes
-- kemampuan, dan level per gaya per anak.
--
-- Everything here is ADDITIVE and dormant: a program stays on its current
-- ("legacy") assessment model until an admin switches it with
-- set_curriculum_mode(). Reuses indicator_groups (= a skill) and indicators
-- so score storage (progress_reports.scores {key: stars}), snapshots and the
-- version counter (programs.template_version) keep working unchanged.
--
-- Key semantics for reports written under the level curriculum
-- (progress_reports.curriculum_version is not null):
--   * only indicators the pengajar actually assessed are in `scores`; a key
--     that is absent means "not assessed", and 0 means "observed, cannot yet
--     do it". Legacy reports (curriculum_version null) cannot tell the two
--     apart (the old form posted every indicator, defaulting to 0).
--   * assessment_context = {"skills": {"<group_id>": {"level": n}},
--                           "na": {"<indicator key>": "reason"}}.

alter table public.programs
  add column if not exists curriculum_mode text not null default 'legacy'
  check (curriculum_mode in ('legacy', 'levels_v1'));

alter table public.indicator_groups
  add column if not exists slug text,
  add column if not exists skill_kind text check (skill_kind in ('foundation', 'safety', 'stroke')),
  add column if not exists has_levels boolean not null default false;

create unique index if not exists indicator_groups_slug_uniq
  on public.indicator_groups (program_id, slug) where slug is not null;

alter table public.indicators
  add column if not exists level smallint check (level between 1 and 3),
  add column if not exists description text,
  add column if not exists rubric text,
  add column if not exists required boolean not null default true,
  add column if not exists seed_key text,
  -- what `active` was before the level curriculum was switched on, so it can
  -- be switched back without guessing
  add column if not exists legacy_active boolean;

create unique index if not exists indicators_seed_key_uniq
  on public.indicators (program_id, seed_key) where seed_key is not null;

alter table public.progress_reports
  add column if not exists curriculum_version smallint,
  add column if not exists assessment_context jsonb not null default '{}'::jsonb;

-- ============================================================
-- Rules: what "dikuasai" / "lulus level" means. Configurable per skill (and
-- per level for strokes); NOT a universal standard. Passing is never decided
-- by an average: every required indicator and the required test must meet
-- these, then the pengajar confirms.
-- ============================================================
create table if not exists public.skill_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.indicator_groups (id) on delete cascade,
  level smallint check (level between 1 and 3),
  mastery_min_score numeric not null default 4 check (mastery_min_score between 0 and 5),
  min_evidence_sessions integer not null default 2 check (min_evidence_sessions >= 1),
  requires_test boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists skill_rules_uniq on public.skill_rules (group_id, coalesce(level, 0));

-- ============================================================
-- Tests and versioned targets
-- ============================================================
create table if not exists public.skill_test_types (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  group_id uuid not null references public.indicator_groups (id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  label text not null check (length(trim(label)) > 0),
  measure text not null check (measure in ('distance_m', 'duration_s', 'checklist')),
  level_specific boolean not null default false,
  steps jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (program_id, code)
);

-- A target row never changes once written: a new standard is a new row (and
-- the old one is switched off), so an old result keeps meaning what it meant
-- when it was recorded.
create table if not exists public.skill_test_targets (
  id uuid primary key default gen_random_uuid(),
  test_type_id uuid not null references public.skill_test_types (id) on delete cascade,
  level smallint check (level between 1 and 3),
  target_value numeric not null check (target_value > 0),
  requires_unassisted boolean not null default true,
  requires_technique boolean not null default true,
  version integer not null default 1,
  active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists skill_test_targets_uniq
  on public.skill_test_targets (test_type_id, coalesce(level, 0), version);

create or replace function public.guard_skill_target_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.test_type_id is distinct from old.test_type_id
     or new.level is distinct from old.level
     or new.target_value is distinct from old.target_value
     or new.requires_unassisted is distinct from old.requires_unassisted
     or new.requires_technique is distinct from old.requires_technique
     or new.version is distinct from old.version then
    raise exception 'target_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists skill_test_targets_immutable on public.skill_test_targets;
create trigger skill_test_targets_immutable
  before update on public.skill_test_targets
  for each row execute function public.guard_skill_target_immutable();

-- ============================================================
-- Results. Personal records and achievements are NOT stored: they are always
-- derived from valid results, so editing or deleting a report (results go
-- with it, ON DELETE CASCADE) can never leave a false achievement behind.
-- ============================================================
create table if not exists public.skill_test_results (
  id uuid primary key default gen_random_uuid(),
  progress_report_id uuid not null references public.progress_reports (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  program_id uuid references public.programs (id),
  test_type_id uuid not null references public.skill_test_types (id),
  level smallint check (level between 1 and 3),
  distance_m numeric check (distance_m > 0),
  duration_s numeric check (duration_s > 0),
  time_s numeric check (time_s > 0),
  assisted boolean not null default false,
  assistance_note text,
  conditions text,
  conditions_comparable boolean not null default true,
  technique_met boolean not null default false,
  steps_passed jsonb,
  validation text not null default 'divalidasi'
    check (validation in ('divalidasi', 'belum_divalidasi', 'tidak_valid')),
  target_id uuid references public.skill_test_targets (id) on delete set null,
  notes text,
  pelatih_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (progress_report_id, test_type_id),
  check (distance_m is not null or duration_s is not null or steps_passed is not null)
);
create index if not exists skill_test_results_enrollment_idx on public.skill_test_results (enrollment_id);

drop trigger if exists skill_test_results_guard_enrollment on public.skill_test_results;
create trigger skill_test_results_guard_enrollment
  before insert or update of enrollment_id, student_id on public.skill_test_results
  for each row execute function public.guard_enrollment_row();

create or replace function public.guard_skill_result_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select enrollment_id, student_id into v from public.progress_reports where id = new.progress_report_id;
  if not found or v.enrollment_id is distinct from new.enrollment_id or v.student_id is distinct from new.student_id then
    raise exception 'result does not belong to this report';
  end if;
  return new;
end;
$$;

drop trigger if exists skill_test_results_guard_report on public.skill_test_results;
create trigger skill_test_results_guard_report
  before insert or update of progress_report_id, enrollment_id, student_id on public.skill_test_results
  for each row execute function public.guard_skill_result_report();

-- ============================================================
-- Level per stroke per child. Confirming a pass is a pengajar decision, not
-- an automatic result of an average.
-- ============================================================
create table if not exists public.skill_level_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  group_id uuid not null references public.indicator_groups (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  kind text not null check (kind in ('placement', 'promotion')),
  effective_on date not null default current_date,
  confirmed_by uuid references public.users (id) on delete set null,
  note text,
  evidence jsonb,
  created_at timestamptz not null default now()
);
create index if not exists skill_level_events_idx
  on public.skill_level_events (enrollment_id, group_id, effective_on, created_at);

create or replace function public.guard_skill_level_event()
returns trigger
language plpgsql
as $$
declare
  v_prev smallint;
begin
  select level into v_prev
  from public.skill_level_events
  where enrollment_id = new.enrollment_id and group_id = new.group_id
  order by effective_on desc, created_at desc
  limit 1;

  if new.kind = 'placement' and v_prev is not null then
    raise exception 'placement_exists';
  end if;
  if new.kind = 'promotion' and (v_prev is null or new.level <> v_prev + 1) then
    raise exception 'promotion_must_follow_previous_level';
  end if;
  return new;
end;
$$;

drop trigger if exists skill_level_events_guard on public.skill_level_events;
create trigger skill_level_events_guard
  before insert on public.skill_level_events
  for each row execute function public.guard_skill_level_event();

-- ============================================================
-- RLS
-- ============================================================
alter table public.skill_rules enable row level security;
alter table public.skill_test_types enable row level security;
alter table public.skill_test_targets enable row level security;
alter table public.skill_test_results enable row level security;
alter table public.skill_level_events enable row level security;

-- definitions: any signed-in user reads, only admin writes (same as indicators)
drop policy if exists "authenticated can read skill_rules" on public.skill_rules;
create policy "authenticated can read skill_rules" on public.skill_rules for select
  using (auth.role() = 'authenticated');
drop policy if exists "admin full access to skill_rules" on public.skill_rules;
create policy "admin full access to skill_rules" on public.skill_rules for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

drop policy if exists "authenticated can read skill_test_types" on public.skill_test_types;
create policy "authenticated can read skill_test_types" on public.skill_test_types for select
  using (auth.role() = 'authenticated');
drop policy if exists "admin full access to skill_test_types" on public.skill_test_types;
create policy "admin full access to skill_test_types" on public.skill_test_types for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

drop policy if exists "authenticated can read skill_test_targets" on public.skill_test_targets;
create policy "authenticated can read skill_test_targets" on public.skill_test_targets for select
  using (auth.role() = 'authenticated');
drop policy if exists "admin full access to skill_test_targets" on public.skill_test_targets;
create policy "admin full access to skill_test_targets" on public.skill_test_targets for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- results: visible exactly when the report they belong to is visible to the
-- caller (progress_reports' own RLS already hides drafts from parents and
-- other pengajar, and limits pengajar to enrollments they teach), writable
-- only by that report's author.
drop policy if exists "results visible with their report" on public.skill_test_results;
create policy "results visible with their report" on public.skill_test_results for select
  using (exists (select 1 from public.progress_reports r where r.id = skill_test_results.progress_report_id));

drop policy if exists "author writes own results" on public.skill_test_results;
create policy "author writes own results" on public.skill_test_results for all
  using (exists (select 1 from public.progress_reports r
                 where r.id = skill_test_results.progress_report_id and r.pelatih_id = auth.uid()))
  with check (exists (select 1 from public.progress_reports r
                      where r.id = skill_test_results.progress_report_id and r.pelatih_id = auth.uid()));

drop policy if exists "admin full access to skill_test_results" on public.skill_test_results;
create policy "admin full access to skill_test_results" on public.skill_test_results for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- levels: the pengajar who teaches the enrollment reads and records them,
-- the family reads; correcting a recorded event is an admin job.
drop policy if exists "pelatih reads levels of taught enrollments" on public.skill_level_events;
create policy "pelatih reads levels of taught enrollments" on public.skill_level_events for select
  using (public.pelatih_teaches_enrollment(enrollment_id));

drop policy if exists "pelatih records levels of taught enrollments" on public.skill_level_events;
create policy "pelatih records levels of taught enrollments" on public.skill_level_events for insert
  with check (confirmed_by = auth.uid() and public.pelatih_teaches_enrollment(enrollment_id));

drop policy if exists "family reads levels" on public.skill_level_events;
create policy "family reads levels" on public.skill_level_events for select
  using (public.can_view_enrollment_records(enrollment_id));

drop policy if exists "admin full access to skill_level_events" on public.skill_level_events;
create policy "admin full access to skill_level_events" on public.skill_level_events for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- audit trail (log_activity, 0036) for everything an admin or pengajar can change
do $$
declare
  t text;
begin
  foreach t in array array['skill_rules', 'skill_test_types', 'skill_test_targets', 'skill_test_results', 'skill_level_events']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_activity', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t || '_activity', t
    );
  end loop;
end $$;

-- ============================================================
-- Atomic save of a report's test results (replaces them as a unit, so a
-- report can never end up saved with half its tests -- the old record flow
-- could). SECURITY INVOKER: RLS above decides who may write. A result keeps
-- the target row it was first measured against when its report is edited.
-- ============================================================
create or replace function public.save_report_tests(p_report_id uuid, p_tests jsonb)
returns void
language plpgsql
as $$
declare
  r record;
  t jsonb;
  v_old jsonb;
  v_level smallint;
  v_type uuid;
  v_target uuid;
begin
  select id, enrollment_id, student_id, pelatih_id into r
  from public.progress_reports where id = p_report_id;
  if not found then
    raise exception 'report not found';
  end if;
  if r.pelatih_id is distinct from auth.uid() and public.get_my_role() <> 'admin' then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_object_agg(test_type_id::text || '|' || coalesce(level::text, '0'), target_id), '{}'::jsonb)
  into v_old
  from public.skill_test_results
  where progress_report_id = p_report_id and target_id is not null;

  delete from public.skill_test_results where progress_report_id = p_report_id;

  for t in select * from jsonb_array_elements(coalesce(p_tests, '[]'::jsonb)) loop
    v_type := (t ->> 'test_type_id')::uuid;
    v_level := nullif(t ->> 'level', '')::smallint;
    v_target := nullif(v_old ->> (v_type::text || '|' || coalesce(v_level::text, '0')), '')::uuid;
    if v_target is null then
      select id into v_target
      from public.skill_test_targets
      where test_type_id = v_type and active and coalesce(level, 0) = coalesce(v_level, 0)
      order by version desc
      limit 1;
    end if;

    insert into public.skill_test_results (
      progress_report_id, enrollment_id, student_id, test_type_id, level,
      distance_m, duration_s, time_s, assisted, assistance_note, conditions,
      conditions_comparable, technique_met, steps_passed, validation, target_id,
      notes, pelatih_id
    ) values (
      p_report_id, r.enrollment_id, r.student_id, v_type, v_level,
      nullif(t ->> 'distance_m', '')::numeric,
      nullif(t ->> 'duration_s', '')::numeric,
      nullif(t ->> 'time_s', '')::numeric,
      coalesce((t ->> 'assisted')::boolean, false),
      nullif(btrim(t ->> 'assistance_note'), ''),
      nullif(btrim(t ->> 'conditions'), ''),
      coalesce((t ->> 'conditions_comparable')::boolean, true),
      coalesce((t ->> 'technique_met')::boolean, false),
      case when jsonb_typeof(t -> 'steps_passed') = 'array' then t -> 'steps_passed' else null end,
      coalesce(nullif(t ->> 'validation', ''), 'divalidasi'),
      v_target,
      nullif(btrim(t ->> 'notes'), ''),
      r.pelatih_id
    );
  end loop;
end;
$$;

grant execute on function public.save_report_tests(uuid, jsonb) to authenticated;

-- ============================================================
-- One-time switch between the old model and the level curriculum. While in
-- 'levels_v1' the program's legacy indicators are hidden (kept, not
-- deleted) and the seeded curriculum indicators are live; switching back
-- restores exactly what was active before. Admin only.
-- ============================================================
create or replace function public.set_curriculum_mode(p_program_id uuid, p_mode text)
returns void
language plpgsql
as $$
declare
  v_current text;
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'not authorized';
  end if;
  if p_mode not in ('legacy', 'levels_v1') then
    raise exception 'invalid mode';
  end if;

  select curriculum_mode into v_current from public.programs where id = p_program_id;
  if not found then
    raise exception 'program not found';
  end if;
  if v_current = p_mode then
    return;
  end if;

  if p_mode = 'levels_v1' then
    if not exists (select 1 from public.indicators where program_id = p_program_id and seed_key is not null) then
      raise exception 'curriculum not prepared for this program';
    end if;
    update public.indicators set legacy_active = active where program_id = p_program_id;
    update public.indicators set active = (seed_key is not null) where program_id = p_program_id;
    update public.indicator_groups g set active = true
    where g.program_id = p_program_id
      and exists (select 1 from public.indicators i where i.group_id = g.id and i.seed_key is not null);
  else
    update public.indicators set active = coalesce(legacy_active, false) where program_id = p_program_id;
  end if;

  update public.programs
  set curriculum_mode = p_mode, template_version = template_version + 1
  where id = p_program_id;
end;
$$;

grant execute on function public.set_curriculum_mode(uuid, text) to authenticated;
