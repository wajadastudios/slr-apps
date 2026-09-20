-- Starter milestone set (Dasar 5 / Menengah 4 / Mahir 5) + the record types it
-- needs. Additive and safe to re-run.
--
-- 1. performance_records / milestones: metric_type gains 'mengapung_telentang'
--    and stroke becomes a free label ("Gaya / Teknik": Meluncur, Tendangan
--    Bebas, Bebas Napas Samping, Medley, ...). The list of valid values is
--    enforced by the app, so the old CHECKs on stroke are dropped.
-- 2. Milestones: the 7 rows seeded by 0031 are renamed, re-levelled and
--    reordered, and the missing ones inserted (matched by seed_key). The
--    measurement definition and targets of an existing row are only rewritten
--    while NO record has earned it -- an achievement is never changed by a seed.

do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.performance_records'::regclass, 'public.milestones'::regclass)
      and (pg_get_constraintdef(oid) ilike '%metric_type%' or pg_get_constraintdef(oid) ilike '%stroke%')
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.performance_records
  add constraint performance_records_metric_type_check check (
    metric_type in ('waktu_tempuh', 'jarak_tempuh', 'tahan_nafas', 'treading_water', 'mengapung_telentang')
  );
alter table public.milestones
  add constraint milestones_metric_type_check check (
    metric_type in ('waktu_tempuh', 'jarak_tempuh', 'tahan_nafas', 'treading_water', 'mengapung_telentang')
  );

create temporary table _starter_milestones (
  seed_key text, sort_order int, level text, label text, metric_type text,
  stroke text, distance_m numeric, bronze numeric, silver numeric, gold numeric
) on commit drop;

insert into _starter_milestones values
  ('tahan-nafas',             1, 'Dasar',    'Tahan Nafas Terkontrol',               'tahan_nafas',         null,                  null, 3,   5,   8),
  ('mengapung-telentang',     2, 'Dasar',    'Mengapung Telentang Mandiri',          'mengapung_telentang', null,                  null, 5,   10,  20),
  ('jarak-meluncur',          3, 'Dasar',    'Jarak Meluncur',                       'jarak_tempuh',        'Meluncur',            null, 3,   5,   8),
  ('tendangan-bebas',         4, 'Dasar',    'Tendangan Gaya Bebas',                 'jarak_tempuh',        'Tendangan Bebas',     null, 5,   10,  15),
  ('bebas-tanpa-berhenti',    5, 'Dasar',    'Gaya Bebas Tanpa Berhenti',            'jarak_tempuh',        'Bebas',               null, 10,  15,  25),
  ('waktu-25m-bebas',         6, 'Menengah', 'Waktu 25 m Gaya Bebas',                'waktu_tempuh',        'Bebas',               25,   60,  50,  40),
  ('bebas-napas-samping',     7, 'Menengah', 'Gaya Bebas dengan Pernapasan Samping', 'jarak_tempuh',        'Bebas Napas Samping', null, 15,  25,  50),
  ('dada-tanpa-berhenti',     8, 'Menengah', 'Gaya Dada Tanpa Berhenti',             'jarak_tempuh',        'Dada',                null, 10,  15,  25),
  ('punggung-tanpa-berhenti', 9, 'Menengah', 'Gaya Punggung Tanpa Berhenti',         'jarak_tempuh',        'Punggung',            null, 10,  15,  25),
  ('treading-water',         10, 'Mahir',    'Treading Water',                       'treading_water',      null,                  null, 15,  30,  60),
  ('waktu-25m-punggung',     11, 'Mahir',    'Waktu 25 m Gaya Punggung',             'waktu_tempuh',        'Punggung',            25,   65,  55,  45),
  ('waktu-25m-dada',         12, 'Mahir',    'Waktu 25 m Gaya Dada',                 'waktu_tempuh',        'Dada',                25,   70,  60,  50),
  ('waktu-25m-kupu',         13, 'Mahir',    'Waktu 25 m Gaya Kupu-kupu',            'waktu_tempuh',        'Kupu-kupu',           25,   80,  70,  60),
  ('medley-4x25',            14, 'Mahir',    'Medley 4 × 25 m',                      'waktu_tempuh',        'Medley',              100,  300, 260, 230);

-- new milestones
insert into public.milestones
  (seed_key, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order)
select seed_key, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order
from _starter_milestones
on conflict (seed_key) do nothing;

-- existing seeded milestones: names, levels and order follow the starter set;
-- definition + targets only when nothing has been earned on them (frozen
-- awards, or legacy records that are not frozen yet).
update public.milestones m
set label = s.label, level = s.level, sort_order = s.sort_order
from _starter_milestones s
where m.seed_key = s.seed_key;

update public.milestones m
set metric_type = s.metric_type, stroke = s.stroke, distance_m = s.distance_m,
    bronze = s.bronze, silver = s.silver, gold = s.gold
from _starter_milestones s
where m.seed_key = s.seed_key
  and not exists (
    select 1 from public.performance_records r
    where r.awards is null or r.awards ? m.id::text
  );
