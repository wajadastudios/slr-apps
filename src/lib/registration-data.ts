import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DAYS } from "@/lib/days";

export type RegistrationSlot = { id: string; text: string; location: string | null };
export type RegistrationPackage = { id: string; name: string; sessions_count: number; price: number };

export type RegistrationProgram = {
  id: string;
  name: string;
  description: string | null;
  requires_acknowledgement: boolean;
  // which registration flow lists it: adults (self / spouse / family) and/or children
  open_for_adults: boolean;
  open_for_children: boolean;
  // who the program is meant for (Aquanatal: female / pregnant participants)
  intended_gender: "male" | "female" | null;
  slots: RegistrationSlot[];
  packages: RegistrationPackage[];
};

// Everything the "Daftar Kelas Baru" form needs, straight from what the admin
// configured: active programs, each with its own packages and the slots that
// still have room. The form lists a program for adults when it is open for
// self registration, and for children when it is meant for children. Read with the service
// client (this also has to work for a visitor without an account) and only the
// public-facing fields are passed on. `error` lets the form say "could not
// load" instead of showing an empty list that looks like "no programs".
export async function loadRegistrationPrograms(): Promise<{
  programs: RegistrationProgram[];
  error: boolean;
}> {
  try {
    const admin = createAdminClient();

    const programsQuery = () =>
      admin
        .from("programs")
        .select("id, name, description, requires_acknowledgement, intended_gender, self_registration, audience")
        .eq("active", true)
        .order("name");

    const [openPrograms, slotsRes, packagesRes, availabilityRes] = await Promise.all([
      // only programs the admin marked "ready to accept registrations"
      programsQuery().eq("registration_open", true),
      admin
        .from("class_slots")
        .select("id, program_id, label, location, day_of_week, start_time, capacity")
        .order("day_of_week")
        .order("start_time"),
      admin
        .from("program_packages")
        .select("id, program_id, name, sessions_count, price")
        .eq("active", true)
        .order("sessions_count"),
      admin.rpc("get_slot_availability"),
    ]);

    // before the admin migration exists there is no such switch: every active
    // program stays open, exactly as before
    const programsRes = openPrograms.error ? await programsQuery() : openPrograms;
    if (programsRes.error) return { programs: [], error: true };

    const filled = new Map<string, number>();
    for (const row of (availabilityRes.data ?? []) as { slot_id: string; filled: number }[]) {
      filled.set(row.slot_id, Number(row.filled));
    }

    const programs: RegistrationProgram[] = (programsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      requires_acknowledgement: p.requires_acknowledgement === true,
      open_for_adults: p.self_registration === true && (p.audience === "adult" || p.audience === "all"),
      open_for_children: p.audience === "child" || p.audience === "all",
      intended_gender: p.intended_gender === "male" || p.intended_gender === "female" ? p.intended_gender : null,
      slots: (slotsRes.data ?? [])
        .filter((s) => s.program_id === p.id && s.capacity - (filled.get(s.id) ?? 0) > 0)
        .map((s) => ({
          id: s.id,
          location: s.location ?? null,
          text: `${DAYS[s.day_of_week]} · ${s.start_time.slice(0, 5).replace(":", ".")} WIB${
            s.label ? ` · ${s.label}` : ""
          }${s.location ? ` · ${s.location}` : ""}`,
        })),
      packages: (packagesRes.data ?? [])
        .filter((k) => k.program_id === p.id)
        .map((k) => ({ id: k.id, name: k.name, sessions_count: k.sessions_count, price: Number(k.price) })),
    }));

    return { programs, error: false };
  } catch {
    return { programs: [], error: true };
  }
}
