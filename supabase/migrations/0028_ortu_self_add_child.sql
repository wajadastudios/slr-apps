-- Let an ortu account add their own child and enroll it into an existing
-- class slot in one step, without admin having to create the student row
-- first. Follows the same narrow security-definer convention as
-- self_register_as_participant (0017): students/schedules RLS still only
-- grants admin write access, this just opens one specific, capacity-checked
-- door through it. Safe to re-run.

create or replace function public.ortu_add_child_and_register(
  p_full_name text,
  p_birth_date date,
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_program_id uuid;
  v_capacity integer;
  v_filled integer;
begin
  select capacity, program_id into v_capacity, v_program_id
  from public.class_slots
  where id = p_slot_id;

  if v_capacity is null then
    raise exception 'slot not found';
  end if;

  insert into public.students (full_name, birth_date, parent_id, program_id, active)
  values (p_full_name, p_birth_date, auth.uid(), v_program_id, true)
  returning id into v_student_id;

  insert into public.schedules (student_id, slot_id)
  values (v_student_id, p_slot_id);

  -- Checked after insert (not before) so a last-seat race is caught by
  -- rolling back the whole transaction instead of a check-then-act gap.
  select count(*) into v_filled from public.schedules where slot_id = p_slot_id;
  if v_filled > v_capacity then
    raise exception 'slot is full';
  end if;

  return v_student_id;
end;
$$;

grant execute on function public.ortu_add_child_and_register(text, date, uuid) to authenticated;
