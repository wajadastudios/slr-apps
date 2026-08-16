-- Phase 6: admin-managed pricing packages per program, replacing the
-- fixed 4-session assumption from 0005. Invoices snapshot package
-- name/sessions/price at creation time so editing a package later
-- never changes an already-issued invoice.
-- Safe to re-run.

-- ============================================================
-- program_packages
-- ============================================================
create table if not exists public.program_packages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null,
  sessions_count integer not null check (sessions_count > 0),
  price numeric(12, 2) not null check (price >= 0),
  benefits text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.program_packages enable row level security;

drop policy if exists "authenticated can read program_packages" on public.program_packages;
create policy "authenticated can read program_packages"
  on public.program_packages for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin full access to program_packages" on public.program_packages;
create policy "admin full access to program_packages"
  on public.program_packages for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- invoices: snapshot columns + drop the old fixed-4 package_number
-- ============================================================
alter table public.invoices
  add column if not exists program_package_id uuid references public.program_packages (id);

alter table public.invoices
  add column if not exists package_name text not null default '';

alter table public.invoices
  add column if not exists sessions_count integer not null default 4;

-- Give existing Phase 5/5.5 test rows a readable label instead of blank.
update public.invoices
  set package_name = 'Paket Awal (migrasi)'
  where package_name = '';

alter table public.invoices
  drop constraint if exists invoices_student_package_unique;

alter table public.invoices
  drop column if exists package_number;

-- ============================================================
-- students: ortu's renewal preference for their next invoice
-- ============================================================
alter table public.students
  add column if not exists next_package_preference_id uuid references public.program_packages (id);

-- Narrow write path for ortu: only this one column, only for their own
-- child, only to a package that's active and matches the child's own
-- program. No broad RLS UPDATE policy is granted on students for ortu,
-- since that would let a crafted request change any column (e.g. name).
create or replace function public.set_next_package_preference(
  p_student_id uuid,
  p_package_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_program_id uuid;
  v_package_program_id uuid;
begin
  if not exists (
    select 1 from public.students
    where id = p_student_id and parent_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if p_package_id is not null then
    select program_id into v_student_program_id
      from public.students where id = p_student_id;

    select program_id into v_package_program_id
      from public.program_packages
      where id = p_package_id and active = true;

    if v_package_program_id is null or v_package_program_id <> v_student_program_id then
      raise exception 'invalid package for this student''s program';
    end if;
  end if;

  update public.students
    set next_package_preference_id = p_package_id
    where id = p_student_id;
end;
$$;

grant execute on function public.set_next_package_preference(uuid, uuid) to authenticated;
