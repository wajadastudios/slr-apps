import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadProgramsAndLocations(
  supabase: SupabaseClient
): Promise<{ programs: { id: string; name: string }[]; locations: string[] }> {
  const [{ data: programs }, { data: slotRows }] = await Promise.all([
    supabase.from("programs").select("id, name").order("name"),
    supabase.from("class_slots").select("location").not("location", "is", null),
  ]);
  const locations = [...new Set((slotRows ?? []).map((s) => s.location as string).filter(Boolean))].sort();
  return { programs: programs ?? [], locations };
}
