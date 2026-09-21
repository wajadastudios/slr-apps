// "Atur Program": what a program needs before it may accept registrations.

export type ReadinessInput = {
  program: {
    id: string;
    name: string;
    active: boolean;
    audience: string | null;
    assessment_type: string;
    records_mode: string;
    registration_open: boolean;
  };
  indicatorGroups: number; // active groups of this program
  indicators: number; // active indicators of this program
  milestones: number; // active milestones of this program
  packages: number; // active packages
  slots: number; // slots of this program
  pelatihWithSlots: number; // distinct coaches teaching it
  locations: number; // distinct locations used by its slots
  poolLocations: number; // pool locations known to the admin
};

export type ChecklistStep = {
  key: "info" | "assessment" | "milestones" | "packages" | "pelatih" | "locations" | "slots";
  label: string;
  done: boolean;
  // steps that are not needed for this kind of program
  optional?: boolean;
  detail: string;
  href: string;
};

const AUDIENCE_LABEL: Record<string, string> = { adult: "Dewasa", all: "Semua usia", child: "Anak" };

export function programChecklist(i: ReadinessInput): ChecklistStep[] {
  const p = i.program;
  const needsMilestones = p.records_mode === "medals";
  const assessmentDone =
    p.assessment_type === "score_5" ? i.indicators > 0 : i.indicatorGroups > 0 && i.indicators > 0;

  return [
    {
      key: "info",
      label: "Informasi program",
      done: p.name.trim().length > 0 && !!p.audience,
      detail: `${p.name} · ${AUDIENCE_LABEL[p.audience ?? ""] ?? "Kategori belum dipilih"}`,
      href: "/admin/program",
    },
    {
      key: "assessment",
      label: "Jenis penilaian dan indikator",
      done: assessmentDone,
      detail: assessmentDone
        ? `${i.indicatorGroups} kelompok · ${i.indicators} indikator`
        : "Belum ada indikator khusus untuk program ini",
      href: `/admin/penilaian?program=${p.id}`,
    },
    {
      key: "milestones",
      label: "Rekor / milestone",
      done: !needsMilestones || i.milestones > 0,
      optional: !needsMilestones,
      detail: needsMilestones
        ? i.milestones > 0
          ? `${i.milestones} milestone aktif`
          : "Program ini memberi medali tetapi belum punya milestone"
        : "Tidak diperlukan untuk program ini",
      href: `/admin/milestone?program=${p.id}`,
    },
    {
      key: "packages",
      label: "Paket harga",
      done: i.packages > 0,
      detail: i.packages > 0 ? `${i.packages} paket aktif` : "Belum ada paket aktif",
      href: "/admin/paket-harga",
    },
    {
      key: "pelatih",
      label: "Pengajar yang dapat mengajar",
      done: i.pelatihWithSlots > 0,
      detail: i.pelatihWithSlots > 0 ? `${i.pelatihWithSlots} pengajar` : "Belum ada pengajar yang memegang slot",
      href: "/admin/slot-jadwal",
    },
    {
      key: "locations",
      label: "Lokasi",
      done: i.locations > 0 || i.poolLocations > 0,
      detail:
        i.locations > 0
          ? `${i.locations} lokasi dipakai slot`
          : i.poolLocations > 0
            ? `${i.poolLocations} lokasi kolam tersedia`
            : "Belum ada lokasi kolam",
      href: "/admin/lokasi-kolam",
    },
    {
      key: "slots",
      label: "Slot jadwal",
      done: i.slots > 0,
      detail: i.slots > 0 ? `${i.slots} slot` : "Belum ada slot",
      href: "/admin/slot-jadwal",
    },
  ];
}

// The minimum for "ready to accept registrations": name and category, an
// active package, an active slot, a coach and a matching assessment template.
export function readyBlockers(i: ReadinessInput): string[] {
  const steps = programChecklist(i);
  const need = (key: ChecklistStep["key"]) => steps.find((s) => s.key === key)!;
  const out: string[] = [];
  if (!need("info").done) out.push("Nama dan kategori program belum lengkap.");
  if (!need("packages").done) out.push("Belum ada paket aktif.");
  if (!need("slots").done) out.push("Belum ada slot aktif.");
  if (!need("pelatih").done) out.push("Belum ada pengajar.");
  if (!need("assessment").done) out.push("Template penilaian yang sesuai belum ada.");
  if (!need("milestones").done) out.push("Milestone untuk program berperingkat medali belum ada.");
  return out;
}
