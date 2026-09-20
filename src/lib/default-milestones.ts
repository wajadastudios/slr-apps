import type { Milestone } from "@/lib/milestones";

// Used ONLY when the milestones table does not exist yet (migration 0031 not
// applied). Once the table exists the database is the sole source of truth.
export const DEFAULT_MILESTONES: Milestone[] = [
  { id: "seed:tahan-nafas", label: "Tahan Nafas", level: "Dasar 1", metric_type: "tahan_nafas", stroke: null, distance_m: null, bronze: 3, silver: 5, gold: 8, sort_order: 1, active: true },
  { id: "seed:jarak-meluncur", label: "Jarak Meluncur", level: "Dasar 2", metric_type: "jarak_tempuh", stroke: null, distance_m: null, bronze: 5, silver: 8, gold: 10, sort_order: 2, active: true },
  { id: "seed:waktu-25m-bebas", label: "Waktu 25m Gaya Bebas", level: "Menengah", metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: 25, bronze: 60, silver: 50, gold: 40, sort_order: 3, active: true },
  { id: "seed:treading-water", label: "Treading Water", level: "Mahir", metric_type: "treading_water", stroke: null, distance_m: null, bronze: 15, silver: 22, gold: 30, sort_order: 4, active: true },
  { id: "seed:waktu-25m-punggung", label: "25m Gaya Punggung", level: "Mahir", metric_type: "waktu_tempuh", stroke: "Punggung", distance_m: 25, bronze: 65, silver: 50, gold: 35, sort_order: 5, active: true },
  { id: "seed:waktu-25m-dada", label: "25m Gaya Dada", level: "Mahir", metric_type: "waktu_tempuh", stroke: "Dada", distance_m: 25, bronze: 70, silver: 55, gold: 40, sort_order: 6, active: true },
  { id: "seed:waktu-25m-kupu", label: "25m Gaya Kupu-kupu", level: "Mahir", metric_type: "waktu_tempuh", stroke: "Kupu-kupu", distance_m: 25, bronze: 80, silver: 60, gold: 45, sort_order: 7, active: true },
];
