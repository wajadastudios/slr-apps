-- Periodic narrative report cycle.
--
-- Regular programs (Kids Swim, Teen & Adult Swim) must get a narrative
-- summary every Nth VALID session per student+program (enrollment), counted
-- only from session_date >= 2026-10-01 -- never retroactive on migrated
-- history. Other programs keep narrative fully optional unless an admin
-- opts them in. See supabase/migrations and src/lib/narrative-cycle.ts (the
-- narrative_required()/position math is mirrored there for the UI -- keep
-- both in sync if the policy semantics ever change).

alter table public.programs
  add column if not exists narrative_policy text not null default 'none'
  check (narrative_policy in ('none', 'every_4', 'every_2', 'every_1'));

update public.programs
set narrative_policy = 'every_4'
where name in ('Kids Swim', 'Teen & Adult Swim');

-- No draft/final concept existed for progress_reports before this: every
-- insert was immediately treated as done. Default 'final' means every
-- existing row is valid with no data migration -- exactly what it always
-- was. 'cancelled' is reserved so the cycle count and any future
-- cancel/void action stay consistent from day one; no UI sets it yet.
alter table public.progress_reports
  add column if not exists status text not null default 'final'
  check (status in ('draft', 'final', 'cancelled'));

create or replace function public.narrative_required(p_policy text, p_position int)
returns boolean
language sql
immutable
as $$
  select case p_policy
    when 'every_1' then p_position > 0
    when 'every_2' then p_position > 0 and p_position % 2 = 0
    when 'every_4' then p_position > 0 and p_position % 4 = 0
    else false
  end;
$$;

-- Enforced in the database, not just the UI: a "final" hadir report dated on
-- or after the cutoff cannot land on a required cycle position without a
-- narrative. Position is always derived from what's already committed --
-- nothing is stored -- so there is no stale sequence number that editing or
-- reordering session dates could ever leave wrong.
create or replace function public.guard_narrative_cycle()
returns trigger
language plpgsql
as $$
declare
  v_policy text;
  v_position int;
begin
  if new.status <> 'final' or new.attendance <> 'hadir' or new.enrollment_id is null
     or new.session_date < '2026-10-01' then
    return new;
  end if;

  -- Serializes concurrent finalizations of DIFFERENT sessions on the same
  -- enrollment so two simultaneous saves can never both compute the same
  -- position (the enrollment+session_date unique constraint, 0040, already
  -- rules out two saves racing on the SAME session).
  perform pg_advisory_xact_lock(hashtext(new.enrollment_id::text));

  select narrative_policy into v_policy from public.programs where id = new.program_id;

  select count(*) + 1 into v_position
  from public.progress_reports
  where enrollment_id = new.enrollment_id
    and status = 'final'
    and attendance = 'hadir'
    and session_date >= '2026-10-01'
    and session_date <= new.session_date
    and id is distinct from new.id;

  if public.narrative_required(coalesce(v_policy, 'none'), v_position)
     and (new.notes is null or btrim(new.notes) = '') then
    raise exception 'narrative_required';
  end if;

  return new;
end;
$$;

drop trigger if exists progress_reports_guard_narrative on public.progress_reports;
create trigger progress_reports_guard_narrative
  before insert or update on public.progress_reports
  for each row execute function public.guard_narrative_cycle();

-- RLS tightened (not new policies) so a draft is only ever visible to the
-- pengajar who wrote it -- never surfaced as done to a parent, never shown
-- as another pengajar's finished report.
drop policy if exists "pelatih can read own reports" on public.progress_reports;
create policy "pelatih can read own reports"
  on public.progress_reports for select
  using (
    pelatih_id = auth.uid()
    or (status = 'final' and enrollment_id is not null and public.pelatih_teaches_enrollment(enrollment_id))
    or (status = 'final' and enrollment_id is null and public.pelatih_teaches_student(student_id))
  );

drop policy if exists "ortu can read reports for own children" on public.progress_reports;
create policy "ortu can read reports for own children"
  on public.progress_reports for select
  using (
    status = 'final'
    and (
      (enrollment_id is not null and public.can_view_enrollment_records(enrollment_id))
      or (enrollment_id is null and public.can_view_student_records(student_id))
    )
  );

-- A draft session must not count as an attended session yet on the handover
-- quota card (0043_report_history_and_corrections.sql).
create or replace function public.pelatih_session_quota(p_enrollment_id uuid)
returns table(total_sessions integer, attended integer, remaining integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(total.n, 0)::int,
    coalesce(attended.n, 0)::int,
    greatest(0, coalesce(total.n, 0) - coalesce(attended.n, 0))::int
  from
    (select sum(sessions_count) n from public.invoices where enrollment_id = p_enrollment_id and status = 'paid') total,
    (select count(distinct session_date) n from public.progress_reports where enrollment_id = p_enrollment_id and attendance = 'hadir' and status = 'final') attended
  where public.pelatih_teaches_enrollment(p_enrollment_id);
$$;
