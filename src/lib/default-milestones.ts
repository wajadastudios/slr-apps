import type { Milestone } from "@/lib/milestones";
import type { MetricType } from "@/lib/performance";

// Used ONLY when the milestones table does not exist yet (migration 0031
// not applied). Once the table exists the database is the sole source of
// truth; the same starting set is seeded by migration 0032.
const m = (
  key: string,
  order: number,
  level: string,
  label: string,
  metric_type: MetricType,
  stroke: string | null,
  distance_m: number | null,
  [bronze, silver, gold]: [number, number, number]
): Milestone => ({
  id: `seed:${key}`,
  label,
  level,
  metric_type,
  stroke,
  distance_m,
  bronze,
  silver,
  gold,
  sort_order: order,
  active: true,
});

export const DEFAULT_MILESTONES: Milestone[] = [
  m("tahan-nafas", 1, "Dasar", "Tahan Nafas Terkontrol", "tahan_nafas", null, null, [3, 5, 8]),
  m("mengapung-telentang", 2, "Dasar", "Mengapung Telentang Mandiri", "mengapung_telentang", null, null, [5, 10, 20]),
  m("jarak-meluncur", 3, "Dasar", "Jarak Meluncur", "jarak_tempuh", "Meluncur", null, [3, 5, 8]),
  m("tendangan-bebas", 4, "Dasar", "Tendangan Gaya Bebas", "jarak_tempuh", "Tendangan Bebas", null, [5, 10, 15]),
  m("bebas-tanpa-berhenti", 5, "Dasar", "Gaya Bebas Tanpa Berhenti", "jarak_tempuh", "Bebas", null, [10, 15, 25]),
  m("waktu-25m-bebas", 6, "Menengah", "Waktu 25 m Gaya Bebas", "waktu_tempuh", "Bebas", 25, [60, 50, 40]),
  m("bebas-napas-samping", 7, "Menengah", "Gaya Bebas dengan Pernapasan Samping", "jarak_tempuh", "Bebas Napas Samping", null, [15, 25, 50]),
  m("dada-tanpa-berhenti", 8, "Menengah", "Gaya Dada Tanpa Berhenti", "jarak_tempuh", "Dada", null, [10, 15, 25]),
  m("punggung-tanpa-berhenti", 9, "Menengah", "Gaya Punggung Tanpa Berhenti", "jarak_tempuh", "Punggung", null, [10, 15, 25]),
  m("treading-water", 10, "Mahir", "Treading Water", "treading_water", null, null, [15, 30, 60]),
  m("waktu-25m-punggung", 11, "Mahir", "Waktu 25 m Gaya Punggung", "waktu_tempuh", "Punggung", 25, [65, 55, 45]),
  m("waktu-25m-dada", 12, "Mahir", "Waktu 25 m Gaya Dada", "waktu_tempuh", "Dada", 25, [70, 60, 50]),
  m("waktu-25m-kupu", 13, "Mahir", "Waktu 25 m Gaya Kupu-kupu", "waktu_tempuh", "Kupu-kupu", 25, [80, 70, 60]),
  m("medley-4x25", 14, "Mahir", "Medley 4 × 25 m", "waktu_tempuh", "Medley", 100, [300, 260, 230]),
];
