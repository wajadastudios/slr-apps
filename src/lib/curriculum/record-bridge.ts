import type { PerformanceRecordRow } from "@/lib/performance";
import type { CurriculumData } from "./types";
import { isValidResult } from "./results";

// The familiar "Record" view (medals per stroke and distance, record history)
// is driven by performance_records. On the level curriculum a pengajar records
// TESTS instead, so those test results are read here as records of the same
// shape and merged with the records that already exist. Derived on every read,
// never stored: editing or deleting a report changes the records with it, and
// the medals shown can never outlive the result that earned them.
//
// Only validated, comparable results done WITHOUT help count; a result with
// help or tools stays in the test history but is not a record.

const STROKE_BY_SLUG: Record<string, string> = { bebas: "Bebas", dada: "Dada", punggung: "Punggung", kupu: "Kupu-kupu" };
// a distance test is named after what it measures (Teen & Adult also records how far a push glides)
const STROKE_BY_CODE: Record<string, string> = {
  jarak_bebas: "Bebas",
  jarak_dada: "Dada",
  jarak_punggung: "Punggung",
  jarak_kupu: "Kupu-kupu",
  jarak_meluncur: "Meluncur",
};

export function recordsFromResults(data: CurriculumData): PerformanceRecordRow[] {
  const typeById = new Map(data.testTypes.map((t) => [t.id, t]));
  const skillById = new Map(data.skills.map((s) => [s.id, s]));
  const rows: PerformanceRecordRow[] = [];

  for (const r of data.results) {
    if (!isValidResult(r) || r.assisted) continue;
    const type = typeById.get(r.testTypeId);
    if (!type) continue;
    const stroke = STROKE_BY_CODE[type.code] ?? STROKE_BY_SLUG[skillById.get(type.skillId)?.slug ?? ""] ?? null;
    const base = { recorded_at: r.sessionDate, pelatih_id: null, awards: null };

    if (type.measure === "distance_m" && r.distanceM !== null && stroke) {
      rows.push({ ...base, id: `test-${r.id}-jarak`, metric_type: "jarak_tempuh", stroke, distance_m: r.distanceM, duration_seconds: null });
      if (r.timeS !== null && stroke !== "Meluncur") {
        rows.push({ ...base, id: `test-${r.id}-waktu`, metric_type: "waktu_tempuh", stroke, distance_m: r.distanceM, duration_seconds: r.timeS });
      }
    } else if (type.measure === "duration_s" && r.durationS !== null) {
      const metric = type.code === "floating" ? "mengapung_telentang" : type.code === "treading_water" ? "treading_water" : null;
      if (metric) rows.push({ ...base, id: `test-${r.id}`, metric_type: metric, stroke: null, distance_m: null, duration_seconds: r.durationS });
    }
  }
  return rows;
}

export function mergedRecords(existing: PerformanceRecordRow[], data: CurriculumData): PerformanceRecordRow[] {
  return [...existing, ...recordsFromResults(data)];
}
