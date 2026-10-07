import type { SupabaseClient } from "@supabase/supabase-js";
import type { Level, LegacyMapStatus } from "./types";
import { isLevel } from "./types";
import { aggregateLegacyKeys, proposeMapping, type LegacyKeyInfo, type MapMethod, type MapTarget, type Proposal } from "./legacy-map";

// Reads everything the mapping tool needs for ONE program. Read-only.

export type MapRow = {
  legacyKey: string;
  legacyLabel: string;
  legacyGroup: string | null;
  status: LegacyMapStatus;
  targetId: string | null;
  method: MapMethod | "manual" | null;
  note: string | null;
};

export type MappingState = {
  skills: { id: string; name: string; hasLevels: boolean }[];
  targets: MapTarget[];
  keys: LegacyKeyInfo[];
  rows: MapRow[];
  // false until migration 0050 has been run
  ready: boolean;
};

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadMappingState(supabase: SupabaseClient, programId: string): Promise<MappingState> {
  const [groupsRes, indRes, mapRes] = await Promise.all([
    supabase.from("indicator_groups").select("id, name, has_levels, sort_order").eq("program_id", programId).not("slug", "is", null).order("sort_order"),
    supabase.from("indicators").select("id, key, label, group_id, level, active").eq("program_id", programId).not("seed_key", "is", null),
    supabase.from("legacy_indicator_map").select("legacy_key, legacy_label, legacy_group, status, target_indicator_id, method, note").eq("program_id", programId),
  ]);

  const skills = (groupsRes.data ?? []).map((g) => ({ id: g.id as string, name: g.name as string, hasLevels: g.has_levels === true }));
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const targets: MapTarget[] = (indRes.data ?? [])
    .filter((i) => skillById.has(i.group_id as string))
    .map((i) => {
      const s = skillById.get(i.group_id as string)!;
      return {
        id: i.id as string,
        key: i.key as string,
        label: i.label as string,
        skillId: s.id,
        skillName: s.name,
        level: isLevel(Number(i.level)) ? (Number(i.level) as Level) : null,
        hasLevels: s.hasLevels,
        active: i.active === true,
      };
    });

  const reports = await pageAll<{ id: string; session_date: string; attendance: string | null; scores: unknown; indicator_snapshot: unknown }>((from, to) =>
    supabase
      .from("progress_reports")
      .select("id, session_date, attendance, scores, indicator_snapshot")
      .eq("program_id", programId)
      .is("curriculum_version", null)
      .eq("status", "final")
      .order("session_date")
      .range(from, to)
  );
  const keys = aggregateLegacyKeys(
    reports.filter((r) => r.attendance === "hadir"),
    Object.fromEntries(reports.map((r) => [r.id, r.session_date]))
  );

  const rows: MapRow[] = mapRes.error
    ? []
    : (mapRes.data ?? []).map((m) => ({
        legacyKey: m.legacy_key as string,
        legacyLabel: m.legacy_label as string,
        legacyGroup: (m.legacy_group as string | null) ?? null,
        status: m.status as LegacyMapStatus,
        targetId: (m.target_indicator_id as string | null) ?? null,
        method: (m.method as MapRow["method"]) ?? null,
        note: (m.note as string | null) ?? null,
      }));

  return { skills, targets, keys, rows, ready: !mapRes.error };
}

export type Row = { key: LegacyKeyInfo; proposal: Proposal; saved: MapRow | null };

// What to do with each old indicator right now: the stored decision if there is
// one, otherwise the proposal.
export function reviewRows(state: MappingState): Row[] {
  const saved = new Map(state.rows.map((r) => [r.legacyKey, r]));
  return state.keys.map((key) => ({ key, proposal: proposeMapping(key, state.targets), saved: saved.get(key.key) ?? null }));
}

export function summarize(rows: Row[]) {
  const status = (r: Row): LegacyMapStatus | "belum" => r.saved?.status ?? "belum";
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const sum = (f: (r: Row) => boolean, nonZero = false) => rows.filter(f).reduce((n, r) => n + r.key.scores - (nonZero ? r.key.zeros : 0), 0);
  const isDone = (r: Row) => status(r) === "auto" || status(r) === "manual";
  return {
    keys: rows.length,
    done: count(isDone),
    auto: count((r) => status(r) === "auto"),
    manual: count((r) => status(r) === "manual"),
    skipped: count((r) => status(r) === "skipped"),
    pendingAuto: count((r) => !isDone(r) && status(r) !== "skipped" && r.proposal.status === "auto"),
    needsReview: count((r) => !isDone(r) && status(r) !== "skipped" && r.proposal.status === "review"),
    scores: sum(() => true),
    scoresDone: sum(isDone),
    nonZeroDone: sum(isDone, true),
  };
}
