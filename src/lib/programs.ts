// How each program is assessed. The database is the source of truth
// (programs.assessment_type / records_mode); this file holds the fixed scales
// and the wording that goes with them.

export type AssessmentType = "score_5" | "support_level" | "observation";
export type RecordsMode = "medals" | "personal_goals" | "none";

export type ProgramMeta = {
  id: string;
  name: string;
  assessment_type: AssessmentType;
  records_mode: RecordsMode;
  requires_acknowledgement: boolean;
  self_registration: boolean;
  template_version: number;
};

export const PROGRAM_SELECT =
  "id, name, assessment_type, records_mode, requires_acknowledgement, self_registration, template_version";

const ASSESSMENT_TYPES: AssessmentType[] = ["score_5", "support_level", "observation"];
const RECORDS_MODES: RecordsMode[] = ["medals", "personal_goals", "none"];

export function normalizeProgram(row: Partial<Record<keyof ProgramMeta, unknown>> & { id: string; name: string }): ProgramMeta {
  const at = row.assessment_type as AssessmentType;
  const rm = row.records_mode as RecordsMode;
  return {
    id: row.id,
    name: row.name,
    assessment_type: ASSESSMENT_TYPES.includes(at) ? at : "score_5",
    records_mode: RECORDS_MODES.includes(rm) ? rm : "medals",
    requires_acknowledgement: row.requires_acknowledgement === true,
    self_registration: row.self_registration === true,
    template_version: typeof row.template_version === "number" ? row.template_version : 1,
  };
}

// ---------- scales for the non-star assessments ----------
export type Level = { value: number; label: string };

// Adaptive Swim: how much support the participant needed. Deliberately not a
// "skill score" -- a higher number means more independence, nothing else.
export const SUPPORT_LEVELS: Level[] = [
  { value: 0, label: "Belum diamati" },
  { value: 1, label: "Dengan bantuan penuh" },
  { value: 2, label: "Dengan bantuan sebagian" },
  { value: 3, label: "Dengan isyarat minimal" },
  { value: 4, label: "Mandiri" },
];

// Aquanatal: what was observed in the session. No ranking, no ability claim.
export const OBSERVATION_LEVELS: Level[] = [
  { value: 0, label: "Belum diamati" },
  { value: 1, label: "Dilakukan nyaman" },
  { value: 2, label: "Perlu penyesuaian" },
  { value: 3, label: "Tidak dilakukan pada sesi ini" },
];

export function levelsFor(type: AssessmentType): Level[] | null {
  if (type === "support_level") return SUPPORT_LEVELS;
  if (type === "observation") return OBSERVATION_LEVELS;
  return null;
}

export function levelLabel(type: AssessmentType, value: number): string {
  const levels = levelsFor(type);
  return levels?.find((l) => l.value === value)?.label ?? String(value);
}

// The highest value a scale accepts (used to validate what a form posts).
export function maxScoreFor(type: AssessmentType): number {
  if (type === "support_level") return 4;
  if (type === "observation") return 3;
  return 5;
}

export function allowsHalfPoints(type: AssessmentType): boolean {
  return type === "score_5";
}

export function reportTitle(type: AssessmentType): string {
  return type === "observation" ? "Catatan Sesi Aquanatal" : "Laporan Sesi";
}

export const ASSESSMENT_LABEL: Record<AssessmentType, string> = {
  score_5: "Skor bintang 0–5",
  support_level: "Tingkat dukungan & kemandirian",
  observation: "Catatan observasi sesi",
};

export const RECORDS_LABEL: Record<RecordsMode, string> = {
  medals: "Medali perunggu, perak, emas",
  personal_goals: "Target pribadi",
  none: "Tanpa rekor",
};

// ---------- what a participant sees ----------
export type ChildTab = "laporan" | "perkembangan" | "record" | "target" | "catatan" | "perjalanan";

export function tabsFor(program: Pick<ProgramMeta, "assessment_type" | "records_mode">): { id: ChildTab; label: string }[] {
  if (program.assessment_type === "observation") {
    return [
      { id: "catatan", label: "Catatan Sesi" },
      { id: "perjalanan", label: "Perjalanan Kelas" },
    ];
  }
  const tabs: { id: ChildTab; label: string }[] = [
    { id: "laporan", label: "Laporan" },
    { id: "perkembangan", label: "Perkembangan" },
  ];
  if (program.records_mode === "medals") tabs.push({ id: "record", label: "Record" });
  if (program.records_mode === "personal_goals") tabs.push({ id: "target", label: "Target Pribadi" });
  return tabs;
}

export function parseTab(raw: string | string[] | undefined, tabs: { id: ChildTab }[]): ChildTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (tabs.find((t) => t.id === value)?.id ?? tabs[0].id) as ChildTab;
}

// Programs whose report is not a skill score: no stars, no percentages.
export function usesStars(type: AssessmentType): boolean {
  return type === "score_5";
}

export type CardLinks = {
  latestLabel: string;
  emptyTitle: string;
  emptyBody: string;
  primaryLabel: string;
  primaryTab: ChildTab;
  primaryHash: string;
  secondary: { label: string; tab: ChildTab; hash?: string }[];
};

// Where the buttons on a participant's summary card point, per program type.
export function cardLinks(program: Pick<ProgramMeta, "assessment_type">): CardLinks {
  if (program.assessment_type === "observation") {
    return {
      latestLabel: "Catatan sesi terakhir",
      emptyTitle: "Belum ada catatan sesi",
      emptyBody: "Catatan sesi akan muncul di sini setelah sesi pertama.",
      primaryLabel: "Lihat catatan terakhir",
      primaryTab: "catatan",
      primaryHash: "catatan-terbaru",
      secondary: [
        { label: "Semua catatan", tab: "catatan", hash: "riwayat-catatan" },
        { label: "Perjalanan kelas", tab: "perjalanan" },
      ],
    };
  }
  return {
    latestLabel: "Laporan terakhir",
    emptyTitle: "Belum ada laporan latihan",
    emptyBody: "Laporan akan muncul di sini setelah sesi latihan pertama.",
    primaryLabel: "Lihat laporan terakhir",
    primaryTab: "laporan",
    primaryHash: "laporan-terbaru",
    secondary: [
      { label: "Semua laporan", tab: "laporan", hash: "riwayat-laporan" },
      { label: "Perkembangan anak", tab: "perkembangan" },
    ],
  };
}
