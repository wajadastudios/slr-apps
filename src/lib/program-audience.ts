// Which registration flow lists a program. One place, used by the admin setting,
// the registration forms and their server checks.
//
//   child  -> shown when a family account registers a child
//   adult  -> shown when a participant registers themselves (or a spouse /
//             family member, always with that participant's own data)
//   all    -> shown in both flows

export type Audience = "child" | "adult" | "all";

export const AUDIENCES: Audience[] = ["child", "adult", "all"];

export const AUDIENCE_OPTIONS: { value: Audience; label: string; description: string }[] = [
  {
    value: "child",
    label: "Anak — didaftarkan oleh orang tua",
    description: "Program hanya tampil saat akun keluarga mendaftarkan anak.",
  },
  {
    value: "adult",
    label: "Remaja & dewasa — daftar untuk diri sendiri",
    description: "Program tampil saat peserta mendaftarkan dirinya sendiri.",
  },
  {
    value: "all",
    label: "Semua usia — anak atau dewasa",
    description: "Program dapat dipilih pada pendaftaran anak maupun dewasa.",
  },
];

export const AUDIENCE_SHORT: Record<Audience, string> = {
  child: "Anak — didaftarkan orang tua",
  adult: "Remaja & dewasa — pendaftaran mandiri",
  all: "Semua usia",
};

export function isAudience(value: unknown): value is Audience {
  return value === "child" || value === "adult" || value === "all";
}

// The adult flow additionally needs self registration to be switched on; it
// follows the category so the two can never disagree.
export function selfRegistrationFor(audience: Audience): boolean {
  return audience !== "child";
}

export function flowsFor(program: { audience: string | null; self_registration: boolean }): {
  adults: boolean;
  children: boolean;
} {
  return {
    adults: program.self_registration === true && (program.audience === "adult" || program.audience === "all"),
    children: program.audience === "child" || program.audience === "all",
  };
}
