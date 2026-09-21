import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessInput } from "./readiness";

type ProgramRow = {
  id: string;
  name: string;
  active: boolean;
  audience: string | null;
  assessment_type: string | null;
  records_mode: string | null;
  registration_open: boolean | null;
};

const COLUMNS = "id, name, active, audience, assessment_type, records_mode, registration_open";

async function countRows(supabase: SupabaseClient, table: string, programId: string, active = false): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("program_id", programId);
  if (active) query = query.eq("active", true);
  const { count } = await query;
  return count ?? 0;
}

// What each program has today, for the setup checklist. Every count is scoped
// to the program: an Aquanatal or Adaptive Swim template is never judged by
// another program's indicators.
export async function loadReadiness(supabase: SupabaseClient, program: ProgramRow): Promise<ReadinessInput> {
  const [indicatorGroups, indicators, milestones, packages, { data: slots }, poolLocations] = await Promise.all([
    countRows(supabase, "indicator_groups", program.id, true),
    countRows(supabase, "indicators", program.id, true),
    countRows(supabase, "milestones", program.id, true),
    countRows(supabase, "program_packages", program.id, true),
    supabase.from("class_slots").select("id, pelatih_id, location").eq("program_id", program.id),
    supabase.from("pool_locations").select("id", { count: "exact", head: true }).then((r) => r.count ?? 0),
  ]);

  return {
    program: {
      id: program.id,
      name: program.name,
      active: program.active,
      audience: program.audience,
      assessment_type: program.assessment_type ?? "score_5",
      records_mode: program.records_mode ?? "none",
      registration_open: program.registration_open === true,
    },
    indicatorGroups,
    indicators,
    milestones,
    packages,
    slots: slots?.length ?? 0,
    pelatihWithSlots: new Set((slots ?? []).map((s) => s.pelatih_id)).size,
    locations: new Set((slots ?? []).map((s) => (s.location ?? "").trim()).filter(Boolean)).size,
    poolLocations,
  };
}

export { COLUMNS as PROGRAM_SETUP_COLUMNS };
export type { ProgramRow as SetupProgramRow };
