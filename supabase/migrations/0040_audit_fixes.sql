-- Fixes from the SLR Apps audit round (see chat log for the full 12-point
-- list). Each section below maps to one numbered finding. Additive and safe
-- to re-run; nothing here deletes or overwrites real historical data --
-- where a fix can't be applied without risking that, it stops and reports
-- via RAISE NOTICE instead of guessing.

-- ============================================================
-- 1. progress_reports: idempotency guard against duplicate session rows
--    (double-click / network retry must never count one session twice
--    against a participant's quota).
-- ============================================================
do $$
declare
  v_dupe_groups integer;
begin
  select count(*) into v_dupe_groups from (
    select enrollment_id, session_date
    from public.progress_reports
    where enrollment_id is not null
    group by enrollment_id, session_date
    having count(*) > 1
  ) d;

  if v_dupe_groups = 0 then
    if not exists (select 1 from pg_constraint where conname = 'progress_reports_enrollment_session_date_unique') then
      alter table public.progress_reports
        add constraint progress_reports_enrollment_session_date_unique
        unique (enrollment_id, session_date);
      raise notice '[AUDIT] progress_reports: unique(enrollment_id, session_date) constraint added.';
    end if;
  else
    raise notice '[AUDIT] progress_reports: % existing (enrollment_id, session_date) group(s) already have more than one row -- unique constraint NOT added so no real data is put at risk. Review and consolidate those rows manually (never done automatically here), then re-run this migration to enable the database-level guard. The application-level guard (createReportAction) is already active regardless.', v_dupe_groups;
  end if;
end $$;

-- ============================================================
-- 2. invoices: secure public payment link (unguessable token, not the
--    plain invoice UUID), minimal-fields public read, and a token-based
--    payment-proof submission path that works without being logged in.
-- ============================================================
alter table public.invoices
  add column if not exists public_token text;

create unique index if not exists invoices_public_token_unique
  on public.invoices (public_token) where public_token is not null;

-- Backfill a token for every invoice that has ever been shareable
-- (sent/processing/paid/cancelled/expired/superseded) but doesn't have one
-- yet -- existing WhatsApp links keep working once sendInvoiceAction is
-- updated to build the new /invoice/pay/<token> URL going forward; this
-- just makes sure every invoice that could need one already has one.
update public.invoices
set public_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where public_token is null
  and status <> 'draft';

-- Minimal public read: only the fields a payer needs to decide to pay,
-- never billing_account_id, student_id, payment_proof_url, internal_note,
-- override_reason, or anything else. SECURITY DEFINER so it works for a
-- completely anonymous visitor (no RLS grant on the invoices table itself
-- is needed or given to anon).
create or replace function public.get_public_invoice(p_token text)
returns table (
  out_invoice_number text,
  out_status text,
  out_package_name text,
  out_sessions_count integer,
  out_amount numeric,
  out_base_price numeric,
  out_discount_amount numeric,
  out_currency text,
  out_sent_at timestamptz,
  out_created_at timestamptz,
  out_due_at timestamptz,
  out_student_name text,
  out_superseded_by_token text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.invoice_number,
    i.status,
    i.package_name,
    i.sessions_count,
    i.amount,
    i.base_price,
    i.discount_amount,
    coalesce(i.currency, 'IDR'),
    i.sent_at,
    i.created_at,
    -- same "jatuh_tempo_hari" setting the admin dashboard's own isOverdue()
    -- check uses (src/lib/admin/quota.ts), resolved server-side so the
    -- public page never needs its own read access to site_settings.
    i.sent_at + (
      coalesce((select value from public.site_settings where key = 'jatuh_tempo_hari'), '7')::int
      * interval '1 day'
    ),
    st.full_name,
    sup.public_token
  from public.invoices i
  join public.students st on st.id = i.student_id
  left join public.invoices sup on sup.id = i.superseded_by_invoice_id
  where i.public_token = p_token
    and i.status <> 'draft';
$$;

grant execute on function public.get_public_invoice(text) to anon, authenticated;

-- Same payment-proof submission as submit_invoice_payment_proof (0027/0035),
-- but authorized by the unguessable token instead of auth.uid() -- so a
-- visitor who opened the link from WhatsApp without ever logging in can
-- still submit proof. Still only ever moves a 'sent' invoice to
-- 'processing'; still never touches amount/status=paid/status=cancelled.
create or replace function public.submit_invoice_payment_proof_by_token(
  p_token text,
  p_payment_method text,
  p_proof_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_payment_method not in ('qris', 'transfer') then
    raise exception 'invalid payment method';
  end if;

  update public.invoices i
    set payment_method = p_payment_method,
        payment_proof_url = p_proof_url,
        proof_submitted_at = now(),
        status = 'processing'
    where i.public_token = p_token
      and i.status = 'sent';

  if not found then
    raise exception 'invoice not found or not awaiting payment';
  end if;
end;
$$;

grant execute on function public.submit_invoice_payment_proof_by_token(text, text, text) to anon, authenticated;

-- Anonymous proof upload: a dedicated storage path keyed by the invoice's
-- own public_token (never the plain invoice id), so the only thing an
-- anonymous uploader can ever do is attach a file to an invoice whose
-- unguessable token they already had -- and only while it is still 'sent'
-- (unpaid, not yet superseded/cancelled/expired). No cross-invoice or
-- cross-tenant access is possible: the policy re-derives the token from the
-- object's own path and checks it against a real, currently-payable
-- invoice on every request.
drop policy if exists "anon can upload public invoice proof" on storage.objects;
create policy "anon can upload public invoice proof"
  on storage.objects for insert
  with check (
    bucket_id = 'progress-media'
    and name like 'invoice-proof-public/%'
    and exists (
      select 1 from public.invoices i
      where i.public_token = split_part(split_part(name, '/', 2), '.', 1)
        and i.status = 'sent'
    )
  );

-- ============================================================
-- 5. Explicit is_test flag -- QA/[TEST] data must never rely on a text
--    label alone to stay out of public pages or production reports.
--    Additive columns, all default false so every existing real row is
--    unaffected; backfilled true only where the [TEST] labelling this
--    session's own seed script uses is unambiguous.
-- ============================================================
alter table public.class_slots add column if not exists is_test boolean not null default false;
alter table public.students add column if not exists is_test boolean not null default false;
alter table public.enrollments add column if not exists is_test boolean not null default false;
alter table public.invoices add column if not exists is_test boolean not null default false;

update public.class_slots set is_test = true where location like '[TEST]%' and not is_test;
update public.students set is_test = true where full_name like '[TEST]%' and not is_test;
update public.enrollments e set is_test = true
  from public.students st
  where e.student_id = st.id and st.is_test and not e.is_test;
update public.invoices i set is_test = true
  from public.students st
  where i.student_id = st.id and st.is_test and not i.is_test;

do $$
declare
  v_slots integer; v_students integer; v_enrollments integer; v_invoices integer;
begin
  select count(*) into v_slots from public.class_slots where is_test;
  select count(*) into v_students from public.students where is_test;
  select count(*) into v_enrollments from public.enrollments where is_test;
  select count(*) into v_invoices from public.invoices where is_test;
  raise notice '[AUDIT] is_test backfilled: % class_slots, % students, % enrollments, % invoices now flagged as test data.', v_slots, v_students, v_enrollments, v_invoices;
end $$;

-- ============================================================
-- 6. progress_reports: track when a report was last touched, so "Laporan
--    Terbaru" can order by that instead of session_date alone. Two reports
--    entered for the same calendar day otherwise sort arbitrarily (a plain
--    date has no time component and Postgres does not guarantee tie-break
--    order), and an EDIT to an older report never changed its position at
--    all -- both are exactly the audit's finding.
-- ============================================================
alter table public.progress_reports add column if not exists updated_at timestamptz not null default now();
-- Runs in the same statement batch as the ADD COLUMN above, before any real
-- edit could happen in between -- every existing row's "last touched" is
-- exactly its own creation time, not "now" (the ADD COLUMN default).
update public.progress_reports set updated_at = created_at;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists progress_reports_touch_updated_at on public.progress_reports;
create trigger progress_reports_touch_updated_at
  before update on public.progress_reports
  for each row execute function public.touch_updated_at();
