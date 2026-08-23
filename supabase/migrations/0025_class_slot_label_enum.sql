alter table public.class_slots
  add constraint class_slots_label_check
  check (label is null or label in ('Grup', 'Private'));
