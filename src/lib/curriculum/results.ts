import type { LevelEvent, CurriculumSkill, TestResult, TestTarget, TestType } from "./types";
import { levelLabel } from "./types";

// Technical score, latest test result, personal record and standard-target
// achievement are four different things and are never merged into one
// number. Personal records and achievements are DERIVED from valid results on
// every read, never stored: editing or deleting a report (its results go with
// it) therefore always leaves the records consistent.

export type TargetCheck = { met: boolean; reasons: string[] };

export function formatMeasure(r: Pick<TestResult, "distanceM" | "durationS" | "stepsPassed">, type: Pick<TestType, "measure">): string {
  if (type.measure === "distance_m" && r.distanceM !== null) return `${trim(r.distanceM)} m`;
  if (type.measure === "duration_s" && r.durationS !== null) return `${trim(r.durationS)} detik`;
  if (type.measure === "checklist" && r.stepsPassed) {
    const ok = r.stepsPassed.filter(Boolean).length;
    return `${ok}/${r.stepsPassed.length} langkah`;
  }
  return "-";
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

// A result may set a record or open a target only when the pengajar validated
// it and the conditions are comparable with earlier results.
export function isValidResult(r: Pick<TestResult, "validation" | "conditionsComparable">): boolean {
  return r.validation === "divalidasi" && r.conditionsComparable;
}

export function targetOf(r: Pick<TestResult, "targetId">, targets: TestTarget[]): TestTarget | null {
  return r.targetId ? (targets.find((t) => t.id === r.targetId) ?? null) : null;
}

// Does this result meet the (frozen) target it was measured against?
// Technique, assistance and validation requirements all have to hold: 15 m
// never opens a 25 m target, an assisted swim never opens an unassisted
// target, and a result the pengajar has not validated opens nothing.
export function checkTarget(r: TestResult, type: Pick<TestType, "measure">, target: TestTarget | null): TargetCheck {
  if (!target) return { met: false, reasons: ["Belum ada target untuk tes ini"] };

  const reasons: string[] = [];
  if (type.measure === "distance_m") {
    if ((r.distanceM ?? 0) < target.value) {
      reasons.push(`Hasil ${r.distanceM === null ? "-" : `${trim(r.distanceM)} m`} belum mencapai target ${trim(target.value)} m`);
    }
  } else if (type.measure === "duration_s") {
    if ((r.durationS ?? 0) < target.value) {
      reasons.push(`Durasi ${r.durationS === null ? "-" : `${trim(r.durationS)} detik`} belum mencapai target ${trim(target.value)} detik`);
    }
  } else if (!r.stepsPassed || r.stepsPassed.length === 0 || !r.stepsPassed.every(Boolean)) {
    reasons.push("Belum semua langkah rangkaian terpenuhi");
  }
  if (target.requiresUnassisted && r.assisted) {
    reasons.push("Dilakukan dengan bantuan/alat; target ini mensyaratkan tanpa bantuan");
  }
  if (target.requiresTechnique && !r.techniqueMet) {
    reasons.push("Syarat teknik belum terpenuhi");
  }
  if (r.validation !== "divalidasi") reasons.push("Belum divalidasi pengajar");
  if (!r.conditionsComparable) reasons.push("Kondisi pelaksanaan tidak sebanding");
  return { met: reasons.length === 0, reasons };
}

// ---------- personal records ----------
export type RecordKind = "jarak" | "durasi" | "waktu";

export type PersonalRecord = {
  key: string;
  testTypeId: string;
  kind: RecordKind;
  assisted: boolean;
  // for "waktu" records: the distance the time was swum over
  distanceM: number | null;
  value: number;
  resultId: string;
  date: string;
};

type Candidate = { key: string; kind: RecordKind; value: number; distanceM: number | null };

// A distance test can yield a distance record and (when a time was entered) a
// time record over that exact distance. With-help and without-help results
// never compete: they sit under different keys.
function candidatesOf(r: TestResult, type: TestType): Candidate[] {
  const a = r.assisted ? "a" : "u";
  const out: Candidate[] = [];
  if (type.measure === "distance_m" && r.distanceM !== null) {
    out.push({ key: `${type.id}|jarak|${a}`, kind: "jarak", value: r.distanceM, distanceM: null });
    if (r.timeS !== null) {
      out.push({ key: `${type.id}|waktu|${r.distanceM}|${a}`, kind: "waktu", value: r.timeS, distanceM: r.distanceM });
    }
  } else if (type.measure === "duration_s" && r.durationS !== null) {
    out.push({ key: `${type.id}|durasi|${a}`, kind: "durasi", value: r.durationS, distanceM: null });
  }
  return out;
}

const better = (kind: RecordKind, next: number, best: number) => (kind === "waktu" ? next < best : next > best);

function byDateAsc(a: TestResult, b: TestResult) {
  return a.sessionDate.localeCompare(b.sessionDate) || a.id.localeCompare(b.id);
}

export function personalRecords(results: TestResult[], types: TestType[]): PersonalRecord[] {
  const typeById = new Map(types.map((t) => [t.id, t]));
  const best = new Map<string, PersonalRecord>();
  for (const r of [...results].filter(isValidResult).sort(byDateAsc)) {
    const type = typeById.get(r.testTypeId);
    if (!type) continue;
    for (const c of candidatesOf(r, type)) {
      const cur = best.get(c.key);
      if (!cur || better(c.kind, c.value, cur.value)) {
        best.set(c.key, {
          key: c.key,
          testTypeId: type.id,
          kind: c.kind,
          assisted: r.assisted,
          distanceM: c.distanceM,
          value: c.value,
          resultId: r.id,
          date: r.sessionDate,
        });
      }
    }
  }
  return [...best.values()];
}

// What saving this result would do, for the form's preview. `history` must NOT
// include the report being saved (so editing a report previews correctly).
export function previewResult(
  history: TestResult[],
  candidate: TestResult,
  type: TestType,
  target: TestTarget | null
): { newPersonalRecord: boolean; previousBest: number | null; target: TargetCheck | null } {
  let previousBest: number | null = null;
  let newPersonalRecord = false;

  if (isValidResult(candidate)) {
    const cs = candidatesOf(candidate, type).find((c) => c.kind !== "waktu");
    if (cs) {
      const prior = history
        .filter((h) => h.testTypeId === type.id && isValidResult(h))
        .flatMap((h) => candidatesOf(h, type).filter((c) => c.key === cs.key).map((c) => c.value));
      previousBest = prior.length ? Math.max(...prior) : null;
      newPersonalRecord = previousBest === null || cs.value > previousBest;
    }
  }
  return {
    newPersonalRecord,
    previousBest,
    target: type.measure === "checklist" || target ? checkTarget(candidate, type, target) : null,
  };
}

// ---------- achievement timeline ----------
export type Achievement = {
  date: string;
  kind: "rekor_pribadi" | "target" | "level";
  title: string;
};

export function achievementTimeline(args: {
  results: TestResult[];
  testTypes: TestType[];
  targets: TestTarget[];
  skills: CurriculumSkill[];
  levelEvents: LevelEvent[];
}): Achievement[] {
  const { results, testTypes, targets, skills, levelEvents } = args;
  const typeById = new Map(testTypes.map((t) => [t.id, t]));
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const events: (Achievement & { sort: string })[] = [];

  const best = new Map<string, number>();
  const targetOpened = new Set<string>();
  for (const r of [...results].filter(isValidResult).sort(byDateAsc)) {
    const type = typeById.get(r.testTypeId);
    if (!type) continue;
    const skillName = skillById.get(type.skillId)?.name ?? type.label;
    const help = r.assisted ? " (dengan bantuan)" : "";

    for (const c of candidatesOf(r, type)) {
      const cur = best.get(c.key);
      if (cur === undefined || better(c.kind, c.value, cur)) {
        best.set(c.key, c.value);
        if (c.kind === "jarak") {
          events.push({ date: r.sessionDate, kind: "rekor_pribadi", title: `Rekor pribadi ${skillName} ${trim(c.value)} m${help}`, sort: `${r.sessionDate}|1|${r.id}` });
        } else if (c.kind === "durasi") {
          events.push({ date: r.sessionDate, kind: "rekor_pribadi", title: `Rekor pribadi ${type.label.replace(/^Tes /, "")} ${trim(c.value)} detik${help}`, sort: `${r.sessionDate}|1|${r.id}` });
        } else {
          events.push({ date: r.sessionDate, kind: "rekor_pribadi", title: `Rekor waktu ${skillName} ${trim(c.distanceM ?? 0)} m: ${trim(c.value)} detik${help}`, sort: `${r.sessionDate}|1|${r.id}` });
        }
      }
    }

    const target = targetOf(r, targets);
    if (target && checkTarget(r, type, target).met) {
      const k = `${type.id}|${target.level ?? 0}`;
      if (!targetOpened.has(k)) {
        targetOpened.add(k);
        const lvl = target.level ? ` ${levelLabel(target.level)}` : "";
        events.push({
          date: r.sessionDate,
          kind: "target",
          title: `Target${lvl} ${skillName} tercapai (${type.measure === "distance_m" ? `${trim(target.value)} m` : `${trim(target.value)} detik`})`,
          sort: `${r.sessionDate}|2|${r.id}`,
        });
      }
    }
  }

  for (const e of levelEvents) {
    const skillName = skillById.get(e.skillId)?.name ?? "";
    events.push({
      date: e.effectiveOn,
      kind: "level",
      title: e.kind === "placement" ? `Penempatan awal ${skillName}: ${levelLabel(e.level)}` : `Naik ke ${levelLabel(e.level)} ${skillName}`,
      sort: `${e.effectiveOn}|3|${e.createdAt}`,
    });
  }

  return events
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .map(({ sort: _sort, ...rest }) => {
      void _sort;
      return rest;
    });
}
