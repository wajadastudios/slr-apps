-- Phase 9 follow-up: the public "Jadwal Tersedia" section needs pelatih
-- names, but `users` stays role-restricted (it holds everyone's name +
-- email, not just pelatih). This narrow RPC exposes only pelatih id +
-- full_name -- nothing else, no other role, no email.
-- Safe to re-run.

create or replace function public.get_public_pelatih_names()
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = public
as $$
  select id, full_name from public.users where role = 'pelatih';
$$;

grant execute on function public.get_public_pelatih_names() to anon, authenticated;
