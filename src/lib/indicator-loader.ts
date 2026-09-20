import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildIndicatorConfig,
  legacyIndicatorConfig,
  EMPTY_INDICATOR_CONFIG,
  type IndicatorConfig,
  type IndicatorGroupRow,
  type IndicatorRow,
} from "@/lib/indicators";

type GroupDb = IndicatorGroupRow & { program_id: string };
type IndicatorDb = IndicatorRow & { program_id: string };

// One config per program id. Programs without configured groups (or every
// program, if the migration hasn't run yet) fall back to the legacy flat
// skill_template so reporting keeps working during rollout.
export async function loadIndicatorConfigs(
  supabase: SupabaseClient,
  programIds: string[]
): Promise<Record<string, IndicatorConfig>> {
  const ids = [...new Set(programIds.filter(Boolean))];
  const result: Record<string, IndicatorConfig> = {};
  if (ids.length === 0) return result;

  const [groupsRes, indicatorsRes] = await Promise.all([
    supabase
      .from("indicator_groups")
      .select("id, program_id, name, sort_order, active")
      .in("program_id", ids),
    supabase
      .from("indicators")
      .select("id, program_id, group_id, key, label, sort_order, active")
      .in("program_id", ids),
  ]);

  const structured = !groupsRes.error && !indicatorsRes.error;
  const groups = (structured ? (groupsRes.data as GroupDb[]) : null) ?? [];
  const indicators = (structured ? (indicatorsRes.data as IndicatorDb[]) : null) ?? [];

  const needLegacy: string[] = [];
  for (const id of ids) {
    const g = groups.filter((x) => x.program_id === id);
    if (g.length === 0) {
      needLegacy.push(id);
      continue;
    }
    result[id] = buildIndicatorConfig(
      g,
      indicators.filter((i) => i.program_id === id)
    );
  }

  if (needLegacy.length > 0) {
    const { data } = await supabase
      .from("programs")
      .select("id, skill_template")
      .in("id", needLegacy);
    for (const id of needLegacy) {
      const row = data?.find((p) => p.id === id);
      const template = Array.isArray(row?.skill_template)
        ? (row!.skill_template as string[])
        : [];
      result[id] = template.length > 0 ? legacyIndicatorConfig(template) : EMPTY_INDICATOR_CONFIG;
    }
  }

  return result;
}

export async function loadIndicatorConfig(
  supabase: SupabaseClient,
  programId: string | null | undefined
): Promise<IndicatorConfig> {
  if (!programId) return EMPTY_INDICATOR_CONFIG;
  const configs = await loadIndicatorConfigs(supabase, [programId]);
  return configs[programId] ?? EMPTY_INDICATOR_CONFIG;
}
