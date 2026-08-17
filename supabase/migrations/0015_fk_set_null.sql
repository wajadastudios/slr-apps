-- Phase 18: allow deleting program_packages without being blocked by
-- historical references that already snapshot the data they need.
-- Safe to re-run.

alter table public.invoices
  drop constraint if exists invoices_program_package_id_fkey;

alter table public.invoices
  add constraint invoices_program_package_id_fkey
  foreign key (program_package_id) references public.program_packages (id)
  on delete set null;

alter table public.students
  drop constraint if exists students_next_package_preference_id_fkey;

alter table public.students
  add constraint students_next_package_preference_id_fkey
  foreign key (next_package_preference_id) references public.program_packages (id)
  on delete set null;
