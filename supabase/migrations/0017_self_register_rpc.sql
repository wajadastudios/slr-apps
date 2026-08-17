-- Phase 23: let an existing ortu account enroll themselves (not a
-- child) into an active program, e.g. an adult swim class. students
-- RLS still only grants admin write access, so this follows the same
-- narrow security-definer convention as update_own_profile() and
-- update_own_child_profile() from 0012, rather than loosening RLS.
-- Safe to re-run.

create or replace function public.self_register_as_participant(
  p_full_name text,
  p_program_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.students (full_name, parent_id, program_id, active)
  values (p_full_name, auth.uid(), p_program_id, true)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.self_register_as_participant(text, uuid) to authenticated;
