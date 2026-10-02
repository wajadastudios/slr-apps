-- Minimal liveness probe for the scheduled keep-alive (see README, "Health-check
-- Supabase"). Returns a constant: it reads no table, so there is nothing
-- sensitive it could ever expose, and it is deliberately NOT security definer
-- (it needs no elevated rights). The grant is narrowed to the anon role the
-- server-side health route calls with -- logged-in users have no reason to use
-- it, and it is not a general SQL entry point.
create or replace function public.health_check()
returns text
language sql
stable
set search_path = ''
as $$
  select 'ok'::text;
$$;

revoke all on function public.health_check() from public, anon, authenticated;
grant execute on function public.health_check() to anon, service_role;
