-- Owner decision (audit final, S02): family registration must still go
-- through trial, same as a brand-new public registrant.
--
-- Problem: "Anak saya" on the ortu dashboard (submitChildRegistration ->
-- register_child_enrollment) booked a child straight into a real class
-- slot -- no admin review, no trial, nothing. It was the one registration
-- path in the whole app that skipped the trial-first process every other
-- new registrant goes through via /daftar. An adult family member added
-- from the very same dashboard already only ever gets a pending_review
-- enrollment (register_enrollment) that an admin must review and offer a
-- schedule for -- children just never got that same gate.
--
-- Fix: register_child_enrollment no longer inserts into schedules or takes
-- a seat at all. It creates a pending_review enrollment identical in shape
-- to an adult's, with the slot the parent picked recorded as
-- preferred_schedule/preferred_location text for admin to see. Admin
-- arranges the trial and offers a real schedule through the existing
-- offer/accept pipeline (schedule_offered -> respond_schedule_offer_for_me),
-- exactly like every other participant. Capacity is enforced there, not
-- here, since no seat is claimed until that point.
--
-- Signature changed (2 new params) -- old 4-arg overload is dropped so only
-- one version of this function exists.
drop function if exists public.register_child_enrollment(uuid, text, date, uuid);

create or replace function public.register_child_enrollment(
  p_student_id uuid,
  p_full_name text,
  p_birth_date date,
  p_slot_id uuid,
  p_preferred_schedule text,
  p_preferred_location text
)
returns table (out_enrollment_id uuid, out_student_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot record;
  v_program record;
  v_student uuid := p_student_id;
  v_enrollment uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id, program_id into v_slot from public.class_slots where id = p_slot_id;
  if not found then
    raise exception 'slot not found';
  end if;

  select id, active, audience, registration_open into v_program
  from public.programs where id = v_slot.program_id;
  if not found or not v_program.active or v_program.audience not in ('child', 'all')
     or v_program.registration_open is not true then
    raise exception 'program not open for registration';
  end if;

  if v_student is null then
    if nullif(trim(coalesce(p_full_name, '')), '') is null then
      raise exception 'child name required';
    end if;
    -- program_id is set AFTER the enrollment below, never here -- setting it
    -- on insert fires ensure_student_enrollment (0033) before this
    -- function's own pending_review row exists, pre-empting it with a wrong
    -- 'active' status (the exact bug already fixed once in this session's
    -- own test-seed script; see 0040's audit notes).
    insert into public.students (full_name, birth_date, parent_id, active, kind)
    values (trim(p_full_name), p_birth_date, auth.uid(), true, 'child')
    returning id into v_student;
  else
    if not exists (
      select 1 from public.students
      where id = v_student and parent_id = auth.uid() and kind = 'child'
    ) then
      raise exception 'not authorized';
    end if;
    if exists (
      select 1 from public.enrollments
      where student_id = v_student and program_id = v_slot.program_id
        and status not in ('cancelled', 'rejected')
    ) then
      raise exception 'already enrolled';
    end if;
  end if;

  insert into public.enrollments (
    student_id, program_id, status, source, preferred_schedule, preferred_location, requested_by_user_id
  )
  values (
    v_student, v_slot.program_id, 'pending_review', 'self_registered',
    nullif(trim(coalesce(p_preferred_schedule, '')), ''),
    nullif(trim(coalesce(p_preferred_location, '')), ''),
    auth.uid()
  )
  returning id into v_enrollment;

  update public.students set program_id = coalesce(program_id, v_slot.program_id) where id = v_student;

  return query select v_enrollment, v_student;
end;
$$;

grant execute on function public.register_child_enrollment(uuid, text, date, uuid, text, text) to authenticated;
