-- Phase 13: identity & profile fields -- nickname (for parent-facing
-- greetings), pelatih honorific/title, and self-service profile editing
-- for ortu (own account + own children's basic info). No broad UPDATE
-- RLS policy is granted on users/students for ortu, since that would let
-- a crafted request change any column (role, parent_id, etc). Instead,
-- two narrow security-definer RPCs mirror the existing
-- set_next_package_preference() pattern from 0006.
-- Safe to re-run.

alter table public.students
  add column if not exists nickname text;

alter table public.students
  add column if not exists avatar_url text;

alter table public.users
  add column if not exists title text;

alter table public.users
  add column if not exists phone text;

alter table public.users
  add column if not exists address text;

alter table public.users
  add column if not exists avatar_url text;

-- Caller updates only their own users row's safe columns -- never role
-- or email.
create or replace function public.update_own_profile(
  p_full_name text,
  p_phone text,
  p_address text,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
    set full_name = coalesce(p_full_name, full_name),
        phone = p_phone,
        address = p_address,
        avatar_url = p_avatar_url
    where id = auth.uid();
end;
$$;

grant execute on function public.update_own_profile(text, text, text, text) to authenticated;

-- Caller updates only full_name/nickname/avatar_url on a child they own
-- -- never parent_id, program_id, or active.
create or replace function public.update_own_child_profile(
  p_student_id uuid,
  p_full_name text,
  p_nickname text,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.students
    where id = p_student_id and parent_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update public.students
    set full_name = coalesce(p_full_name, full_name),
        nickname = p_nickname,
        avatar_url = p_avatar_url
    where id = p_student_id;
end;
$$;

grant execute on function public.update_own_child_profile(uuid, text, text, text) to authenticated;
