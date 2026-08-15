-- Optional: run after 0001_init.sql to seed the 3 SLR programs with their
-- skill checklist templates (spec section 4). Safe to re-run (idempotent).

insert into public.programs (name, description, skill_template)
select 'Baby Swim', 'Program renang untuk anak-anak', '[
  "water confidence",
  "floating",
  "kicking",
  "breath control",
  "koordinasi gerak"
]'::jsonb
where not exists (select 1 from public.programs where name = 'Baby Swim');

insert into public.programs (name, description, skill_template)
select 'Aquanatal', 'Program renang untuk ibu hamil', '[
  "kenyamanan di air",
  "teknik relaksasi/napas",
  "partisipasi latihan",
  "keluhan fisik"
]'::jsonb
where not exists (select 1 from public.programs where name = 'Aquanatal');

insert into public.programs (name, description, skill_template)
select 'Hydrotherapy', 'Program terapi air', '[
  "tujuan terapi (ROM/mobilitas/dsb)",
  "tingkat nyeri sebelum-sesudah",
  "progres fungsional"
]'::jsonb
where not exists (select 1 from public.programs where name = 'Hydrotherapy');
