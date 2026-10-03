-- Hide QA test data (@tesfitur.com accounts and their [TEST] slots) from the
-- public and from real accounts — at the database level, so it is not only
-- invisible in the UI but also unreadable through the API.
--
-- Who can still see test data: admins (to manage it) and the test accounts
-- themselves (so they keep working for QA). Everyone else — anonymous
-- visitors of the landing page and real parents/coaches — cannot.
--
-- Idempotent: safe to run more than once.

-- 1. Explicit test flag on accounts. Backfilled from an exact allowlist —
--    never a pattern match — the same way 0040 flags slots/students/invoices.
alter table public.users add column if not exists is_test boolean not null default false;

update public.users
set is_test = true
where lower(email) in (
  'admin@tesfitur.com',
  'pengajar@tesfitur.com',
  'ortu@tesfitur.com',
  'dewasa@tesfitur.com',
  'pendaftar@tesfitur.com'
)
  and not is_test;

-- 2. Single rule for "may this viewer see test data?". SECURITY DEFINER so it
--    can read the caller's own profile without depending on users' RLS.
create or replace function public.can_see_test_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and (u.role = 'admin' or u.is_test)
  );
$$;
grant execute on function public.can_see_test_data() to anon, authenticated;

-- 3. Class slots: was "anyone can read" (using true), which exposed the
--    [TEST] slots to anonymous API reads. Admins keep full access through the
--    existing "admin full access to class_slots" policy.
drop policy if exists "anyone can read class_slots" on public.class_slots;
create policy "anyone can read class_slots"
  on public.class_slots for select
  using (not is_test or (select public.can_see_test_data()));

-- 4. Coach names used by the landing page and portals: test coaches only for
--    viewers who may see test data.
create or replace function public.get_public_pelatih_names()
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = public
as $$
  select id, full_name
  from public.users
  where role = 'pelatih'
    and (not is_test or public.can_see_test_data());
$$;
grant execute on function public.get_public_pelatih_names() to anon, authenticated;

-- 5. Seat counts for the landing page / registration: test slots excluded
--    for everyone who may not see them.
create or replace function public.get_slot_availability()
returns table (slot_id uuid, filled bigint)
language sql
security definer
stable
set search_path = public
as $$
  select s.slot_id, count(*) as filled
  from public.schedules s
  join public.class_slots c on c.id = s.slot_id
  where not c.is_test or public.can_see_test_data()
  group by s.slot_id;
$$;
grant execute on function public.get_slot_availability() to anon, authenticated;

do $$
declare
  v_users int;
begin
  select count(*) into v_users from public.users where is_test;
  raise notice '[0045] % account(s) flagged is_test; test slots and test coaches are now hidden from the public and from real accounts.', v_users;
end $$;
