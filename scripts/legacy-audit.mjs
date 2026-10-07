// READ-ONLY audit of old vs new indicator data. Only SELECT queries are made;
// nothing is written. Output is aggregate (no student or parent names).
//
//   node scripts/legacy-audit.mjs <path-to-.env.local> [out.json]
//
// Reads the Supabase URL + service-role key from the env file you point it at,
// so no secret is ever typed on a command line or printed.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = process.argv[2];
const outPath = process.argv[3];
if (!envPath) {
  console.error("usage: node scripts/legacy-audit.mjs <path-to-.env.local> [out.json]");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function all(table, columns, apply = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const programs = await all("programs", "id, name, assessment_type, curriculum_mode, template_version");
const groups = await all("indicator_groups", "id, program_id, name, slug, active, has_levels, sort_order");
const indicators = await all("indicators", "id, program_id, group_id, key, label, level, seed_key, active, legacy_active, sort_order");
const reports = await all("progress_reports", "id, program_id, enrollment_id, student_id, session_date, attendance, status, scores, indicator_snapshot, curriculum_version, template_version");

const groupById = new Map(groups.map((g) => [g.id, g]));
const indByKey = new Map(indicators.map((i) => [`${i.program_id}|${i.key}`, i]));

const out = { generated_at: new Date().toISOString(), programs: [] };
for (const p of programs) {
  const pg = groups.filter((g) => g.program_id === p.id);
  const pi = indicators.filter((i) => i.program_id === p.id);
  const pr = reports.filter((r) => r.program_id === p.id);
  const legacyReports = pr.filter((r) => r.curriculum_version === null || r.curriculum_version === undefined);
  const newReports = pr.filter((r) => r.curriculum_version !== null && r.curriculum_version !== undefined);

  // every key ever scored in an old report, with the label/group it had then
  const keys = new Map();
  for (const r of legacyReports) {
    const scores = r.scores && typeof r.scores === "object" ? r.scores : {};
    const snap = r.indicator_snapshot && typeof r.indicator_snapshot === "object" ? r.indicator_snapshot : {};
    for (const [key, value] of Object.entries(scores)) {
      const k = keys.get(key) ?? { key, scores: 0, zeros: 0, sum: 0, first: null, last: null, labels: new Set(), groups: new Set(), reports: new Set(), students: new Set(), enrollments: new Set() };
      k.scores++;
      if (Number(value) === 0) k.zeros++;
      k.sum += Number(value) || 0;
      if (!k.first || r.session_date < k.first) k.first = r.session_date;
      if (!k.last || r.session_date > k.last) k.last = r.session_date;
      const s = snap[key];
      if (s?.label) k.labels.add(s.label);
      if (s?.group) k.groups.add(s.group);
      k.reports.add(r.id);
      k.students.add(r.student_id);
      k.enrollments.add(r.enrollment_id);
      keys.set(key, k);
    }
  }

  out.programs.push({
    id: p.id,
    name: p.name,
    assessment_type: p.assessment_type,
    curriculum_mode: p.curriculum_mode,
    groups: pg
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({
        name: g.name,
        slug: g.slug,
        active: g.active,
        has_levels: g.has_levels,
        indicators_total: pi.filter((i) => i.group_id === g.id).length,
        indicators_seeded: pi.filter((i) => i.group_id === g.id && i.seed_key).length,
        indicators_legacy: pi.filter((i) => i.group_id === g.id && !i.seed_key).length,
      })),
    reports: {
      total: pr.length,
      old_model: legacyReports.length,
      level_model: newReports.length,
      old_attended: legacyReports.filter((r) => r.attendance === "hadir").length,
      old_status: Object.fromEntries(["final", "draft", "cancelled"].map((s) => [s, legacyReports.filter((r) => (r.status ?? "final") === s).length])),
      students_with_old_reports: new Set(legacyReports.map((r) => r.student_id)).size,
      first: legacyReports.map((r) => r.session_date).sort()[0] ?? null,
      last: legacyReports.map((r) => r.session_date).sort().at(-1) ?? null,
    },
    old_keys: [...keys.values()]
      .map((k) => {
        const ind = indByKey.get(`${p.id}|${k.key}`);
        return {
          key: k.key,
          label_in_reports: [...k.labels],
          group_in_reports: [...k.groups],
          current_row: ind
            ? { label: ind.label, group: groupById.get(ind.group_id)?.name ?? null, level: ind.level, in_new_curriculum: !!ind.seed_key, active_now: ind.active }
            : null,
          scores: k.scores,
          zero_scores: k.zeros,
          avg: Math.round((k.sum / k.scores) * 100) / 100,
          reports: k.reports.size,
          students: k.students.size,
          first: k.first,
          last: k.last,
        };
      })
      .sort((a, b) => b.scores - a.scores),
    new_indicators: pi
      .filter((i) => i.seed_key)
      .map((i) => ({ key: i.key, label: i.label, skill: groupById.get(i.group_id)?.name, level: i.level, active: i.active })),
  });
}

if (outPath) writeFileSync(outPath, JSON.stringify(out, null, 2));
for (const p of out.programs) {
  console.log(`\n=== ${p.name} [${p.assessment_type}, mode ${p.curriculum_mode}] ===`);
  console.log(`laporan: total ${p.reports.total}, model lama ${p.reports.old_model} (hadir ${p.reports.old_attended}), model level ${p.reports.level_model}, murid dgn laporan lama ${p.reports.students_with_old_reports}, ${p.reports.first} s/d ${p.reports.last}`);
  console.log("kelompok:", p.groups.map((g) => `${g.name}(${g.indicators_legacy} lama/${g.indicators_seeded} baru)`).join("; "));
  console.log(`kunci indikator pada laporan lama: ${p.old_keys.length}`);
  for (const k of p.old_keys) {
    console.log(
      `  ${k.key} | "${(k.label_in_reports[0] ?? k.current_row?.label ?? "?")}" | grup: ${(k.group_in_reports[0] ?? k.current_row?.group ?? "?")} | nilai ${k.scores} (nol ${k.zero_scores}) | murid ${k.students} | ${k.first}..${k.last} | baris indikator: ${k.current_row ? (k.current_row.in_new_curriculum ? "ADA di kurikulum baru" : "hanya lama") : "TIDAK ADA"}`
    );
  }
}
