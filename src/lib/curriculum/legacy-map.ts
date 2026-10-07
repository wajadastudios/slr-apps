import type { Level } from "./types";

// Mapping of OLD indicators (scored before the level curriculum) to NEW
// curriculum indicators. Pure and conservative: it only ever proposes. A
// proposal becomes a mapping when it is stored in legacy_indicator_map, and an
// automatic one is stored only when it is unambiguous. Nothing here (or
// anywhere in the mapping flow) touches a stored report.

// What the old reports say about one old indicator key.
export type LegacyKeyInfo = {
  key: string;
  label: string;
  group: string | null;
  // number of stored scores, and how many of them are 0 (a 0 in an old report
  // cannot be told apart from "not assessed": the old form posted every
  // indicator with a default of 0)
  scores: number;
  zeros: number;
};

export type MapTarget = {
  id: string;
  key: string;
  label: string;
  skillId: string;
  skillName: string;
  level: Level | null;
  hasLevels: boolean;
  active: boolean;
};

export type MapMethod = "kunci_sama" | "nama_sama" | "sinonim" | "level_awal";

// Decision of the school (7 Okt 2026): when the level curriculum started, every
// student was still at Level 1, so an old gaya indicator (which had no level)
// is shown as the same aspect at Level 1. Changing it per indicator stays
// possible in the admin tool.
export const LEGACY_STROKE_LEVEL: Level = 1;

export type Proposal = {
  legacy: LegacyKeyInfo;
  // auto: safe to store as is. review: an admin has to decide.
  status: "auto" | "review";
  method: MapMethod | null;
  target: MapTarget | null;
  // the new indicators this old one could mean (levels of the same aspect, or
  // every indicator of the matching skill when nothing matches by name)
  candidates: MapTarget[];
  skillId: string | null;
  needsLevel: boolean;
  reason: string;
};

// ---------- names ----------
const STOP = new Set(["dan", "di", "ke", "yang", "untuk", "dengan"]);

// Phrases that mean the same ability. Applied on normalised text, longest first.
const SYNONYMS: [string, string][] = [
  ["pernapasaran", "napas"],
  ["pernapasan bubbling", "bubbling"],
  ["wajah masuk air bubbling", "bubbling"],
  ["bubble", "bubbling"],
  ["bubbling", "bubbling"],
  ["water trappen", "treading"],
  ["water tredding", "treading"],
  ["treading water", "treading"],
  ["water treading", "treading"],
  ["tredding", "treading"],
  ["pernapasan", "napas"],
  ["breathing", "napas"],
  ["napas", "napas"],
  ["gerakan kaki", "kaki"],
  ["tendangan kaki", "kaki"],
  ["tendangan", "kaki"],
  ["kick", "kaki"],
  ["gerakan tangan", "tangan"],
  ["kayuhan tangan", "tangan"],
  ["gerakan lengan", "tangan"],
  ["posisi tubuh", "posisi"],
  ["posisi badan", "posisi"],
  ["body position", "posisi"],
  ["gerakan tubuh", "tubuh"],
  ["koordinasi gerakan", "koordinasi"],
  ["koordinasi", "koordinasi"],
  ["meluncur", "meluncur"],
  ["luncur", "meluncur"],
  ["gliding", "meluncur"],
  ["glide", "meluncur"],
  ["menyelam", "menyelam"],
  ["selam", "menyelam"],
  ["diving", "menyelam"],
  ["mengapung", "mengapung"],
  ["floating", "floating"],
  ["adaptasi air", "adaptasi"],
  ["adaptasi", "adaptasi"],
  ["sikap keberanian", "sikap"],
  ["keberanian", "sikap"],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];

export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t))
    .join(" ");
}

// A name reduced to its meaning, so "Water Trappen" and "Water Trappen /
// Treading Water" (or a typo such as "Pernapasaran") meet at the same value.
export function canonicalName(s: string | null | undefined): string {
  let t = ` ${normalizeName(s)} `;
  for (const [from, to] of SYNONYMS) t = t.split(` ${from} `).join(` ${to} `);
  const seen: string[] = [];
  for (const tok of t.split(" ").filter(Boolean)) if (seen[seen.length - 1] !== tok) seen.push(tok);
  return seen.join(" ");
}

function sameSkill(group: string | null, skillName: string): boolean {
  if (!group) return false;
  return normalizeName(group) === normalizeName(skillName);
}

// ---------- proposals ----------
export function proposeMapping(legacy: LegacyKeyInfo, targets: MapTarget[]): Proposal {
  const base = { legacy, candidates: [] as MapTarget[], skillId: null as string | null, needsLevel: false };

  // 1) the old key IS a curriculum indicator (Dasar keeps its keys): same thing
  const sameKey = targets.find((t) => t.key === legacy.key);
  if (sameKey) {
    return { ...base, status: "auto", method: "kunci_sama", target: sameKey, skillId: sameKey.skillId, reason: "Kunci indikator sama dengan indikator kurikulum baru." };
  }

  // 2) which skill does the old group belong to
  const skillTargets = targets.filter((t) => sameSkill(legacy.group, t.skillName));
  const skillId = skillTargets[0]?.skillId ?? null;
  if (!skillId) {
    const wide = targets.filter((t) => !t.hasLevels && canonicalName(t.label) === canonicalName(legacy.label));
    return { ...base, status: "review", method: null, target: null, candidates: wide, reason: "Kelompok lama tidak cocok dengan skill mana pun di kurikulum baru." };
  }

  const wanted = canonicalName(legacy.label);
  const matches = skillTargets.filter((t) => canonicalName(t.label) === wanted);
  const hasLevels = skillTargets[0].hasLevels;

  // 3) gaya: the aspect exists at three levels. Old scores belong to the level
  //    every student was at when the curriculum started (Level 1); with no such
  //    unique indicator the admin has to choose.
  if (hasLevels) {
    const atStart = matches.filter((t) => t.level === LEGACY_STROKE_LEVEL);
    if (atStart.length === 1) {
      return {
        ...base,
        status: "auto",
        method: "level_awal",
        target: atStart[0],
        candidates: matches,
        skillId,
        needsLevel: false,
        reason: `Semua siswa saat pembaruan masih Level ${LEGACY_STROKE_LEVEL}, jadi nilai lama ditampilkan sebagai indikator yang sama di Level ${LEGACY_STROKE_LEVEL}.`,
      };
    }
    return {
      ...base,
      status: "review",
      method: null,
      target: null,
      candidates: matches,
      skillId,
      needsLevel: true,
      reason:
        matches.length > 0
          ? "Indikator gaya ada di tiga level. Pilih level yang sesuai dengan kemampuan anak saat itu."
          : "Tidak ada indikator dengan arti yang sama di skill ini.",
    };
  }

  // 4) skills without levels: exactly one equivalent -> automatic
  if (matches.length === 1) {
    const exact = normalizeName(matches[0].label) === normalizeName(legacy.label);
    return { ...base, status: "auto", method: exact ? "nama_sama" : "sinonim", target: matches[0], skillId, reason: exact ? "Nama indikator sama." : "Nama berbeda tetapi artinya sama (sinonim)." };
  }
  if (matches.length > 1) {
    return { ...base, status: "review", method: null, target: null, candidates: matches, skillId, reason: "Lebih dari satu indikator baru yang cocok." };
  }
  return { ...base, status: "review", method: null, target: null, candidates: skillTargets, skillId, reason: "Belum ada indikator baru dengan arti yang sama." };
}

export type DryRun = {
  proposals: Proposal[];
  keys: number;
  auto: number;
  review: number;
  // stored scores (all, and only the non-zero ones that can be drawn)
  scoresAuto: number;
  scoresReview: number;
  nonZeroAuto: number;
  nonZeroReview: number;
};

export function dryRun(legacy: LegacyKeyInfo[], targets: MapTarget[]): DryRun {
  const proposals = legacy.map((l) => proposeMapping(l, targets));
  const sum = (status: "auto" | "review", f: (l: LegacyKeyInfo) => number) =>
    proposals.filter((p) => p.status === status).reduce((n, p) => n + f(p.legacy), 0);
  return {
    proposals,
    keys: proposals.length,
    auto: proposals.filter((p) => p.status === "auto").length,
    review: proposals.filter((p) => p.status === "review").length,
    scoresAuto: sum("auto", (l) => l.scores),
    scoresReview: sum("review", (l) => l.scores),
    nonZeroAuto: sum("auto", (l) => l.scores - l.zeros),
    nonZeroReview: sum("review", (l) => l.scores - l.zeros),
  };
}

// ---------- reading the old reports ----------
export type LegacyScoreRow = {
  id: string;
  attendance: string | null;
  scores: unknown;
  indicator_snapshot: unknown;
};

// One entry per old indicator key found in the stored scores, labelled with the
// label/group each report snapshotted (the latest report wins).
export function aggregateLegacyKeys(reports: LegacyScoreRow[], dates?: Record<string, string>): LegacyKeyInfo[] {
  const ordered = [...reports].sort((a, b) => (dates?.[a.id] ?? "").localeCompare(dates?.[b.id] ?? ""));
  const keys = new Map<string, LegacyKeyInfo>();
  for (const r of ordered) {
    const scores = r.scores && typeof r.scores === "object" && !Array.isArray(r.scores) ? (r.scores as Record<string, unknown>) : {};
    const snap = r.indicator_snapshot && typeof r.indicator_snapshot === "object" ? (r.indicator_snapshot as Record<string, { label?: string; group?: string }>) : {};
    for (const [key, raw] of Object.entries(scores)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const cur = keys.get(key) ?? { key, label: snap[key]?.label ?? key, group: snap[key]?.group ?? null, scores: 0, zeros: 0 };
      cur.scores += 1;
      if (value === 0) cur.zeros += 1;
      if (snap[key]?.label) cur.label = snap[key].label!;
      if (snap[key]?.group) cur.group = snap[key].group!;
      keys.set(key, cur);
    }
  }
  return [...keys.values()].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label));
}
