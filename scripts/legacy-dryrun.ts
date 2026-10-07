// DRY RUN of the old -> new indicator mapping, computed OFFLINE from the file
// written by legacy-audit.mjs. Reads nothing from the database and writes
// nothing anywhere except the report file you name.
//
//   npx tsx scripts/legacy-dryrun.ts <legacy-audit.json> [report.md]
import { readFileSync, writeFileSync } from "node:fs";
import { dryRun, type LegacyKeyInfo, type MapTarget } from "../src/lib/curriculum/legacy-map";

type Audit = {
  programs: {
    name: string;
    groups: { name: string; has_levels: boolean }[];
    old_keys: { key: string; label_in_reports: string[]; group_in_reports: string[]; current_row: { label: string; group: string | null } | null; scores: number; zero_scores: number; students: number; first: string; last: string }[];
    new_indicators: { key: string; label: string; skill: string; level: number | null; active: boolean }[];
  }[];
};

const audit = JSON.parse(readFileSync(process.argv[2], "utf8")) as Audit;
const lines: string[] = [];
const say = (s = "") => lines.push(s);

for (const p of audit.programs) {
  if (p.new_indicators.length === 0 || p.old_keys.length === 0) continue;
  const hasLevels = new Map(p.groups.map((g) => [g.name, g.has_levels]));
  const targets: MapTarget[] = p.new_indicators.map((i, n) => ({
    id: `t${n}`,
    key: i.key,
    label: i.label,
    skillId: i.skill,
    skillName: i.skill,
    level: (i.level as 1 | 2 | 3 | null) ?? null,
    hasLevels: hasLevels.get(i.skill) ?? false,
    active: i.active,
  }));
  const legacy: LegacyKeyInfo[] = p.old_keys.map((k) => ({
    key: k.key,
    label: k.label_in_reports[0] ?? k.current_row?.label ?? k.key,
    group: k.group_in_reports[0] ?? k.current_row?.group ?? null,
    scores: k.scores,
    zeros: k.zero_scores,
  }));
  const d = dryRun(legacy, targets);

  say(`# Dry-run pemetaan nilai lama: ${p.name}`);
  say();
  say(`- Indikator lama yang punya nilai: **${d.keys}**`);
  say(`- Dipetakan otomatis dengan aman: **${d.auto}** indikator (${d.scoresAuto} nilai tersimpan, ${d.nonZeroAuto} di antaranya bernilai di atas 0)`);
  say(`- Perlu ditinjau admin: **${d.review}** indikator (${d.scoresReview} nilai tersimpan, ${d.nonZeroReview} di atas 0)`);
  say(`- Gagal / kehilangan data: **0** (pemetaan tidak mengubah satu pun laporan atau nilai)`);
  say();
  say("## Otomatis");
  say();
  say("| Indikator lama | Kelompok lama | Dipetakan ke | Cara | Nilai (nol) |");
  say("|---|---|---|---|---|");
  for (const x of d.proposals.filter((x) => x.status === "auto")) {
    say(`| ${x.legacy.label} | ${x.legacy.group ?? "-"} | ${x.target!.skillName} / ${x.target!.label} | ${x.method} | ${x.legacy.scores} (${x.legacy.zeros}) |`);
  }
  say();
  say("## Perlu ditinjau admin");
  say();
  say("| Indikator lama | Kelompok lama | Alasan | Pilihan padanan | Nilai (nol) |");
  say("|---|---|---|---|---|");
  for (const x of d.proposals.filter((x) => x.status === "review")) {
    const opts = x.needsLevel ? `${x.candidates.length} pilihan: Level 1/2/3 "${x.candidates[0]?.label ?? "-"}"` : x.candidates.length ? x.candidates.map((c) => c.label).join(", ") : "tidak ada";
    say(`| ${x.legacy.label} | ${x.legacy.group ?? "-"} | ${x.reason} | ${opts} | ${x.legacy.scores} (${x.legacy.zeros}) |`);
  }
  say();
}

const text = lines.join("\n");
console.log(text);
if (process.argv[3]) writeFileSync(process.argv[3], text);
