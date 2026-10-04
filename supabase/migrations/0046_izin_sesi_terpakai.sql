-- "Izin — sesi terpakai": a participant who cancels after the coach has
-- already arrived at the pool. The coach reports the fact (izin + "kabar
-- diterima setelah saya tiba di kolam"); an admin decides whether that
-- session uses one session of the paid package.
--
--   late_notice     set by the coach on an izin report
--   quota_decision  set by an admin only: 'used' (counts against the paid
--                   package, coach paid at rate_izin_terpakai) or
--                   'not_used' (an ordinary izin). NULL = not decided yet.
--
-- "Sessions used" (quota/billing) = hadir + izin with quota_decision='used'.
-- "Sessions attended" (progress) stays hadir only.
--
-- Idempotent: safe to run more than once.

alter table public.progress_reports
  add column if not exists late_notice boolean not null default false,
  add column if not exists quota_decision text,
  add column if not exists quota_decided_by uuid references public.users (id) on delete set null,
  add column if not exists quota_decided_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'progress_reports_quota_decision_check') then
    alter table public.progress_reports
      add constraint progress_reports_quota_decision_check check (quota_decision in ('used', 'not_used'));
  end if;
end $$;

-- Pending decisions are listed for admins; keep that lookup cheap.
create index if not exists progress_reports_pending_quota_idx
  on public.progress_reports (session_date)
  where late_notice and quota_decision is null;

-- Only an admin (or a server/SQL context without a signed-in user) may set
-- the decision; a decision only exists on a late-notice izin.
create or replace function public.guard_quota_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := auth.uid() is null or public.get_my_role() = 'admin';
begin
  if not v_admin then
    if tg_op = 'INSERT' then
      new.quota_decision := null;
      new.quota_decided_by := null;
      new.quota_decided_at := null;
    else
      new.quota_decision := old.quota_decision;
      new.quota_decided_by := old.quota_decided_by;
      new.quota_decided_at := old.quota_decided_at;
    end if;
  end if;

  if new.attendance is distinct from 'izin' then
    new.late_notice := false;
  end if;
  if not new.late_notice then
    new.quota_decision := null;
    new.quota_decided_by := null;
    new.quota_decided_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists progress_reports_guard_quota_decision on public.progress_reports;
create trigger progress_reports_guard_quota_decision
  before insert or update on public.progress_reports
  for each row execute function public.guard_quota_decision();

-- Per-coach pay for a used izin session. NULL = not set yet: payroll flags
-- it instead of paying Rp0.
alter table public.pelatih_rates
  add column if not exists rate_izin_terpakai numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pelatih_rates_rate_izin_terpakai_check') then
    alter table public.pelatih_rates
      add constraint pelatih_rates_rate_izin_terpakai_check check (rate_izin_terpakai is null or rate_izin_terpakai >= 0);
  end if;
end $$;

-- Coach's quota view: sessions USED (hadir + izin terpakai) drive "remaining";
-- "attended" stays hadir only. The return type changes, so drop first.
drop function if exists public.pelatih_session_quota(uuid);
create function public.pelatih_session_quota(p_enrollment_id uuid)
returns table(total_sessions integer, attended integer, used integer, remaining integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(total.n, 0)::int,
    coalesce(attended.n, 0)::int,
    coalesce(used.n, 0)::int,
    greatest(0, coalesce(total.n, 0) - coalesce(used.n, 0))::int
  from
    (select sum(sessions_count) n from public.invoices where enrollment_id = p_enrollment_id and status = 'paid') total,
    (select count(distinct session_date) n from public.progress_reports
       where enrollment_id = p_enrollment_id and attendance = 'hadir' and status = 'final') attended,
    (select count(distinct session_date) n from public.progress_reports
       where enrollment_id = p_enrollment_id and status = 'final'
         and (attendance = 'hadir' or (attendance = 'izin' and quota_decision = 'used'))) used
  where public.pelatih_teaches_enrollment(p_enrollment_id);
$$;
grant execute on function public.pelatih_session_quota(uuid) to authenticated;
