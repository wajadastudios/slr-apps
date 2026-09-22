import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import { loadMilestones } from "@/lib/milestone-loader";
import { activeGroups, type IndicatorGroup } from "@/lib/indicators";
import { formatMilestoneTargets } from "@/lib/milestones";
import { normalizeProgram, usesStars, type ProgramMeta } from "@/lib/programs";

export type PublicMilestone = {
  id: string;
  label: string;
  level: string;
  sortOrder: number;
  // "3 / 5 / 8 detik" style -- bronze/silver/gold targets, public-safe
  // (no participant record ever contributes to this string).
  targets: string;
};

export type PublicProgramTemplate = {
  program: ProgramMeta;
  usesStars: boolean;
  // Active groups only, each already filtered to its own active indicators
  // (see activeGroups) -- exactly what a deactivated admin item excludes.
  groups: IndicatorGroup[];
  // Active milestones only, in admin display order.
  milestones: PublicMilestone[];
};

/**
 * Public-safe template snapshot for one program: real indicator groups,
 * real indicator labels, real milestone names/targets, all in the admin's
 * own display order -- nothing here is invented for the landing page.
 *
 * This is the SAME loader chain the admin/pengajar/orang tua pages use
 * (loadIndicatorConfig / loadMilestones / activeGroups), just filtered down
 * to active rows and public-safe fields. No second, landing-page-only data
 * source is ever created.
 */
export async function loadPublicProgramTemplate(
  supabase: SupabaseClient,
  programRow: { id: string; name: string } & Partial<Record<keyof ProgramMeta, unknown>>
): Promise<PublicProgramTemplate> {
  const program = normalizeProgram(programRow);

  const [config, milestonesRaw] = await Promise.all([
    loadIndicatorConfig(supabase, program.id),
    loadMilestones(supabase, program.id),
  ]);

  const milestones: PublicMilestone[] = milestonesRaw
    .filter((m) => m.active && m.program_id === program.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      id: m.id,
      label: m.label,
      level: m.level,
      sortOrder: m.sort_order,
      targets: formatMilestoneTargets(m),
    }));

  return {
    program,
    usesStars: usesStars(program.assessment_type),
    groups: activeGroups(config),
    milestones,
  };
}

/**
 * Finds the real program row for a persona by matching admin-entered name
 * keywords -- the same "match real DB content by keyword" pattern already
 * used for pool-location photos on this landing page (see
 * `getLocationPhoto` in src/app/page.tsx). Never assumes a fixed program
 * id (ids differ per environment) and never fabricates a program that
 * doesn't exist in the DB.
 */
export function findProgramByKeywords<T extends { name: string }>(
  programs: T[],
  keywords: string[]
): T | undefined {
  return programs.find((p) => {
    const lower = p.name.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  });
}
