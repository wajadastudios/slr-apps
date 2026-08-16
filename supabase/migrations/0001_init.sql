-- Sari Les Renang — Phase 1 schema: roles, core tables, RLS policies.
-- Run this once in the Supabase SQL editor for your project.
-- Safe to re-run: tables/functions use IF NOT EXISTS / OR REPLACE, and
-- policies are dropped before being recreated.

-- ============================================================
-- 1. TABLES (created first, in dependency order, no policies yet)
-- ============================================================

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('admin', 'pelatih', 'ortu')),
  created_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  skill_template jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.users (id) on delete cascade,
  program_id uuid references public.programs (id),
  full_name text not null,
  birth_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  pelatih_id uuid not null references public.users (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  program_id uuid references public.programs (id),
  day_of_week smallint check (day_of_week between 0 and 6),
  start_time time,
  created_at timestamptz not null default now()
);

create table if not exists public.progress_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  pelatih_id uuid not null references public.users (id) on delete cascade,
  session_date date not null,
  session_number integer,
  attendance text check (attendance in ('hadir', 'izin', 'sakit')),
  scores jsonb not null default '{}'::jsonb,
  notes text,
  media_urls text[] default '{}',
  next_focus text,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null,
  amount numeric(12, 2) not null,
  status text not null default 'draft' check (
    status in ('draft', 'approved', 'sent', 'paid')
  ),
  approved_by uuid references public.users (id),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  content text not null,
  photo_url text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  child_name text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  program_id uuid references public.programs (id),
  preferred_schedule text,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. FUNCTIONS & TRIGGER
-- ============================================================

-- Helper used inside RLS policies to read the caller's role without
-- triggering recursive RLS checks on public.users.
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- Helpers for the students <-> schedules cross-checks. Both tables have a
-- policy that queries the other, so a direct EXISTS subquery would trigger
-- infinite RLS recursion. SECURITY DEFINER bypasses RLS inside the function
-- body, breaking the cycle.
create or replace function public.pelatih_teaches_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.schedules s
    where s.student_id = p_student_id and s.pelatih_id = auth.uid()
  );
$$;

create or replace function public.parent_owns_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.students st
    where st.id = p_student_id and st.parent_id = auth.uid()
  );
$$;

-- Auto-create a public.users row whenever a new auth user is created.
-- Role/full_name can be passed via the auth user's metadata at creation time;
-- defaults to 'ortu' if not provided.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'ortu')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.programs enable row level security;
alter table public.students enable row level security;
alter table public.schedules enable row level security;
alter table public.progress_reports enable row level security;
alter table public.invoices enable row level security;
alter table public.testimonials enable row level security;
alter table public.registrations enable row level security;

-- users
drop policy if exists "users can read own profile" on public.users;
create policy "users can read own profile"
  on public.users for select
  using (auth.uid() = id);

drop policy if exists "admin full access to users" on public.users;
create policy "admin full access to users"
  on public.users for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- programs
drop policy if exists "authenticated can read programs" on public.programs;
create policy "authenticated can read programs"
  on public.programs for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin full access to programs" on public.programs;
create policy "admin full access to programs"
  on public.programs for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- students
drop policy if exists "ortu can read own children" on public.students;
create policy "ortu can read own children"
  on public.students for select
  using (parent_id = auth.uid());

drop policy if exists "pelatih can read assigned students" on public.students;
create policy "pelatih can read assigned students"
  on public.students for select
  using (public.pelatih_teaches_student(students.id));

drop policy if exists "admin full access to students" on public.students;
create policy "admin full access to students"
  on public.students for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- schedules
drop policy if exists "pelatih can read own schedules" on public.schedules;
create policy "pelatih can read own schedules"
  on public.schedules for select
  using (pelatih_id = auth.uid());

drop policy if exists "ortu can read schedules for own children" on public.schedules;
create policy "ortu can read schedules for own children"
  on public.schedules for select
  using (public.parent_owns_student(schedules.student_id));

drop policy if exists "admin full access to schedules" on public.schedules;
create policy "admin full access to schedules"
  on public.schedules for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- progress_reports
drop policy if exists "pelatih can read own reports" on public.progress_reports;
create policy "pelatih can read own reports"
  on public.progress_reports for select
  using (pelatih_id = auth.uid());

drop policy if exists "pelatih can insert own reports" on public.progress_reports;
create policy "pelatih can insert own reports"
  on public.progress_reports for insert
  with check (pelatih_id = auth.uid());

drop policy if exists "pelatih can update own reports" on public.progress_reports;
create policy "pelatih can update own reports"
  on public.progress_reports for update
  using (pelatih_id = auth.uid())
  with check (pelatih_id = auth.uid());

drop policy if exists "ortu can read reports for own children" on public.progress_reports;
create policy "ortu can read reports for own children"
  on public.progress_reports for select
  using (
    exists (
      select 1 from public.students st
      where st.id = progress_reports.student_id
        and st.parent_id = auth.uid()
    )
  );

drop policy if exists "admin full access to progress_reports" on public.progress_reports;
create policy "admin full access to progress_reports"
  on public.progress_reports for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- invoices (pelatih has NO access per spec)
drop policy if exists "ortu can read own invoices" on public.invoices;
create policy "ortu can read own invoices"
  on public.invoices for select
  using (
    exists (
      select 1 from public.students st
      where st.id = invoices.student_id
        and st.parent_id = auth.uid()
    )
    and status in ('sent', 'paid')
  );

drop policy if exists "admin full access to invoices" on public.invoices;
create policy "admin full access to invoices"
  on public.invoices for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- testimonials
drop policy if exists "anyone can read published testimonials" on public.testimonials;
create policy "anyone can read published testimonials"
  on public.testimonials for select
  using (published = true);

drop policy if exists "admin full access to testimonials" on public.testimonials;
create policy "admin full access to testimonials"
  on public.testimonials for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- registrations
drop policy if exists "anyone can submit a registration" on public.registrations;
create policy "anyone can submit a registration"
  on public.registrations for insert
  with check (true);

drop policy if exists "admin full access to registrations" on public.registrations;
create policy "admin full access to registrations"
  on public.registrations for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');
