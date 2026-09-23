-- Price list versioning + per-enrollment price lock + invoice price snapshot.
--
-- Problem this fixes: program_packages.price was edited IN PLACE
-- (0006's updatePackageAction did a plain UPDATE), and every new invoice
-- re-read that same mutable price fresh at creation time -- so an existing
-- participant's very next invoice silently picked up whatever price an
-- admin had most recently typed into the package, with no lock, no
-- history, and no discount/source breakdown stored on the invoice itself.
-- Existing invoices' own `amount`/`package_name`/`sessions_count` were
-- already immutable snapshots (0006), so past bills were never retroactively
-- rewritten -- only the price used for a *participant's next* bill was
-- unprotected.
--
-- Fix, kept as compatible with the existing schema as possible:
--   package_price_versions   = history of a package's price over time.
--                              program_packages.price/currency stay as a
--                              "current price" cache, refreshed only when a
--                              new version is created (never edited in place
--                              for a price change).
--   enrollment_price_locks   = the price a specific enrollment actually pays
--                              for a specific package, locked in at first
--                              billing and left untouched by later price-list
--                              changes. A new row (not an update) is written
--                              whenever an admin deliberately raises it.
--   invoices                 = gains explicit base_price/discount/currency/
--                              price_source/version+lock references, plus
--                              cancelled/expired/superseded lifecycle and a
--                              revision chain (supersedes/superseded_by), so
--                              a sent invoice is corrected by creating a new
--                              invoice, never by silently editing the old one.
--
-- Additive and safe to re-run.

-- ============================================================
-- 1. program_packages: currency + price-version history
-- ============================================================
alter table public.program_packages
  add column if not exists currency text not null default 'IDR';

create table if not exists public.package_price_versions (
  id uuid primary key default gen_random_uuid(),
  program_package_id uuid not null references public.program_packages (id) on delete cascade,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'IDR',
  -- null effective_until = this is the package's current price.
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  note text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists package_price_versions_pkg_idx
  on public.package_price_versions (program_package_id, effective_from desc);

alter table public.package_price_versions enable row level security;

drop policy if exists "authenticated can read package_price_versions" on public.package_price_versions;
create policy "authenticated can read package_price_versions"
  on public.package_price_versions for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin full access to package_price_versions" on public.package_price_versions;
create policy "admin full access to package_price_versions"
  on public.package_price_versions for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- Backfill: one open (effective_until = null) version per existing package,
-- from its current price -- this is exact, not a guess (the price itself
-- was always known; only its *history* wasn't tracked before now).
insert into public.package_price_versions (program_package_id, price, currency, effective_from)
select pp.id, pp.price, pp.currency, pp.created_at
from public.program_packages pp
where not exists (
  select 1 from public.package_price_versions v where v.program_package_id = pp.id
);

-- ============================================================
-- 2. enrollment_price_locks: the price ONE enrollment pays for ONE package
-- ============================================================
create table if not exists public.enrollment_price_locks (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  program_package_id uuid not null references public.program_packages (id) on delete cascade,
  package_price_version_id uuid references public.package_price_versions (id) on delete set null,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'IDR',
  effective_from timestamptz not null default now(),
  reason text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists enrollment_price_locks_lookup_idx
  on public.enrollment_price_locks (enrollment_id, program_package_id, effective_from desc);

alter table public.enrollment_price_locks enable row level security;

-- Admin-only: this is billing bookkeeping, not something ortu/pelatih need to
-- read directly (an invoice already carries its own frozen price_source/
-- base_price/discount for the billing account to see).
drop policy if exists "admin full access to enrollment_price_locks" on public.enrollment_price_locks;
create policy "admin full access to enrollment_price_locks"
  on public.enrollment_price_locks for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- Backfill: lock every currently-active enrollment that has at least one
-- invoice to the package/price that invoice actually billed -- "nominal yang
-- sudah tersimpan pada invoice", per the migration policy, never a guess at
-- a price that isn't already on record. Preference: the most recent PAID
-- invoice (strongest evidence of what they actually pay); otherwise the most
-- recent invoice of any status.
do $$
declare
  v_locked integer := 0;
  v_review integer := 0;
begin
  with candidate as (
    select distinct on (i.enrollment_id)
      i.enrollment_id,
      i.program_package_id,
      i.amount,
      i.created_at
    from public.invoices i
    join public.enrollments e on e.id = i.enrollment_id
    where i.enrollment_id is not null
      and i.program_package_id is not null
      and e.status not in ('cancelled', 'rejected')
      and not exists (
        select 1 from public.enrollment_price_locks l
        where l.enrollment_id = i.enrollment_id and l.program_package_id = i.program_package_id
      )
    order by i.enrollment_id, (i.status = 'paid') desc, i.created_at desc
  )
  insert into public.enrollment_price_locks (enrollment_id, program_package_id, package_price_version_id, price, currency, effective_from, reason)
  select
    c.enrollment_id,
    c.program_package_id,
    (select v.id from public.package_price_versions v
      where v.program_package_id = c.program_package_id and v.price = c.amount
      order by v.effective_from desc limit 1),
    c.amount,
    'IDR',
    c.created_at,
    -- the package's price-at-the-time no longer matches any recorded
    -- version, so the peg to a specific version is unresolved -- the price
    -- itself is still exactly the last real invoice amount, not a guess.
    case when not exists (
      select 1 from public.package_price_versions v
      where v.program_package_id = c.program_package_id and v.price = c.amount
    ) then 'BACKFILL_REVIEW: harga tidak cocok dengan versi harga paket manapun -- tinjau manual'
    else null end
  from candidate c;

  get diagnostics v_locked = row_count;
  select count(*) into v_review
  from public.enrollment_price_locks
  where reason like 'BACKFILL_REVIEW:%';

  raise notice 'enrollment_price_locks backfill: % enrollment(s) locked, % flagged for admin review (reason starts with BACKFILL_REVIEW)', v_locked, v_review;
end $$;

-- ============================================================
-- 3. invoices: full price snapshot + revision lifecycle
-- ============================================================
alter table public.invoices
  add column if not exists base_price numeric(12, 2),
  add column if not exists discount_amount numeric(12, 2) not null default 0,
  add column if not exists discount_type text,
  add column if not exists currency text not null default 'IDR',
  add column if not exists price_source text not null default 'package',
  add column if not exists package_price_version_id uuid references public.package_price_versions (id) on delete set null,
  add column if not exists enrollment_price_lock_id uuid references public.enrollment_price_locks (id) on delete set null,
  add column if not exists override_reason text,
  add column if not exists revision_reason text,
  add column if not exists supersedes_invoice_id uuid references public.invoices (id) on delete set null,
  add column if not exists superseded_by_invoice_id uuid references public.invoices (id) on delete set null,
  add column if not exists internal_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_discount_type_check') then
    alter table public.invoices add constraint invoices_discount_type_check
      -- 'unknown' is only ever set by the backfill below, for a historical
      -- invoice whose original discount breakdown cannot be reconstructed --
      -- flagged for admin review, never guessed at.
      check (discount_type is null or discount_type in ('percent', 'fixed', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoices_price_source_check') then
    alter table public.invoices add constraint invoices_price_source_check
      check (price_source in ('package', 'enrollment_lock', 'override'));
  end if;
end $$;

-- Backfill existing invoices from the one number that was always genuinely
-- known: their own stored `amount`. base_price = amount, no discount --
-- exact for the (large majority) of invoices with no referral discount.
update public.invoices
set base_price = amount,
    price_source = 'package'
where base_price is null;

-- A referral-discounted historical invoice's true base/discount split can no
-- longer be reconstructed (program_packages.price has since moved on, and no
-- discount amount was ever stored) -- marked 'unknown' for admin review
-- rather than guessed at.
update public.invoices i
set discount_type = 'unknown'
from public.students st
where i.student_id = st.id
  and st.referral_discount_type is not null
  and i.discount_type is null;

do $$
declare
  v_unknown integer;
begin
  select count(*) into v_unknown from public.invoices where discount_type = 'unknown';
  raise notice 'invoices backfill: % historical invoice(s) marked discount_type=unknown for admin review (referral discount applied, original base/discount split not recoverable)', v_unknown;
end $$;

-- Widen the status lifecycle: cancelled/expired (Policy A) + superseded (a
-- sent invoice revised into a new one, Policy E) alongside the existing
-- draft/approved/sent/processing/paid.
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.invoices'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if con_name is not null then
    execute format('alter table public.invoices drop constraint %I', con_name);
  end if;
end $$;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'approved', 'sent', 'processing', 'paid', 'cancelled', 'expired', 'superseded'));

-- The billing account keeps seeing an invoice that was cancelled/expired/
-- superseded (with a clear status-specific message instead of the payment
-- form) rather than the link going dead with no explanation.
drop policy if exists "ortu can read own invoices" on public.invoices;
create policy "ortu can read own invoices"
  on public.invoices for select
  using (
    billing_account_id = auth.uid()
    and status in ('sent', 'processing', 'paid', 'cancelled', 'expired', 'superseded')
  );

-- ============================================================
-- 4. activity log: audit price-version and price-lock changes too
-- ============================================================

-- enrollment_price_locks has no student_id column of its own (only
-- enrollment_id), so the generic trigger's plain "read student_id off the
-- row" fallback would leave every price-lock entry off a participant's own
-- "Riwayat Aktivitas" tab. One extra case, resolving it through enrollments,
-- so "Perbarui harga peserta" shows up exactly where an admin looks for a
-- participant's history. Everything else about the trigger is unchanged from
-- 0036_admin_operations.sql.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_noise text[] := array['updated_at', 'created_at', 'offer_token', 'offer_expires_at', 'claim_token',
                          'payment_proof_url', 'proof_submitted_at'];
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_actor uuid := auth.uid();
  v_entity uuid := nullif(v_row->>'id', '')::uuid;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> all (v_noise) and (v_old->v_key) is distinct from (v_new->v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old->v_key, v_new->v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  else
    v_changes := v_row - v_noise;
  end if;

  -- who this is about, readable later even if the row or the person is gone
  if nullif(v_row->>'student_id', '') is not null then
    v_changes := v_changes || jsonb_build_object(
      '_student', (select full_name from public.students where id = (v_row->>'student_id')::uuid)
    );
  elsif tg_table_name = 'enrollment_price_locks' and nullif(v_row->>'enrollment_id', '') is not null then
    v_changes := v_changes || jsonb_build_object(
      '_student', (
        select st.full_name from public.enrollments en
        join public.students st on st.id = en.student_id
        where en.id = (v_row->>'enrollment_id')::uuid
      )
    );
  end if;

  insert into public.activity_log (
    actor_id, actor_name, entity_type, entity_id, action,
    student_id, enrollment_id, slot_id, invoice_id, program_id, changes
  )
  values (
    v_actor,
    (select coalesce(full_name, email) from public.users where id = v_actor),
    tg_table_name,
    v_entity,
    lower(tg_op),
    case tg_table_name
      when 'students' then v_entity
      when 'enrollment_price_locks' then (
        select st.id from public.enrollments en
        join public.students st on st.id = en.student_id
        where en.id = nullif(v_row->>'enrollment_id', '')::uuid
      )
      else nullif(v_row->>'student_id', '')::uuid end,
    case tg_table_name
      when 'enrollments' then v_entity
      else nullif(v_row->>'enrollment_id', '')::uuid end,
    case tg_table_name
      when 'class_slots' then v_entity
      else nullif(v_row->>'slot_id', '')::uuid end,
    case tg_table_name
      when 'invoices' then v_entity
      else null end,
    case tg_table_name
      when 'programs' then v_entity
      else nullif(v_row->>'program_id', '')::uuid end,
    v_changes
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['package_price_versions', 'enrollment_price_locks']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_activity', t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
        t || '_activity', t
      );
    end if;
  end loop;
end $$;
