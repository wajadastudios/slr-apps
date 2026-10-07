import { test } from "node:test";
import assert from "node:assert/strict";
import { indicators, key, makeData } from "./helpers/curriculum-fixture";
import { overallSeries } from "../src/lib/curriculum/overall";
import { trendInput } from "../src/lib/curriculum/trend-adapter";
import type { CurriculumData, CurriculumReport, LegacyMapEntry, LegacyReport, LevelEvent } from "../src/lib/curriculum/types";

const idOf = (k: string) => indicators.find((i) => i.key === k)!.id;
const entry = (legacyKey: string, target: string): LegacyMapEntry => ({ legacyKey, legacyLabel: legacyKey, legacyGroup: null, status: "auto", targetId: idOf(target) });
const legacy = (id: string, date: string, scores: Record<string, number>): LegacyReport => ({ id, sessionDate: date, attendance: "hadir", scores, labels: {} });
const fresh = (id: string, date: string, scores: Record<string, number>, attendance = "hadir"): CurriculumReport => ({
  id,
  sessionDate: date,
  attendance,
  scores,
  curriculumVersion: 1,
  context: {},
  authorName: null,
  notes: null,
});
const bebasL1: LevelEvent = { id: "e", skillId: "g_bebas", level: 1, kind: "placement", effectiveOn: "2026-09-01", createdAt: "1", note: null };

function data(over: Partial<CurriculumData> = {}): CurriculumData {
  return {
    ...makeData({ levelEvents: [bebasL1] }),
    legacy: {
      reports: [legacy("L1", "2025-06-01", { "Dasar - Meluncur": 2, "Dasar - Menyelam": 0 }), legacy("L2", "2025-06-15", { "Dasar - Meluncur": 4, "Dasar - Menyelam": 3 })],
      map: [entry("Dasar - Meluncur", key("dasar", "meluncur")), entry("Dasar - Menyelam", key("dasar", "menyelam"))],
    },
    ...over,
  };
}

test("overall: old sessions form their own first segment, then the level curriculum's", () => {
  const d = data({
    reports: [fresh("n1", "2026-10-01", { [key("dasar", "meluncur")]: 4, [key("bebas", "l1_posisi_tubuh")]: 3 })],
  });
  const [oldSeg, newSeg] = overallSeries(d);
  assert.equal(oldSeg.legacy, true);
  assert.deepEqual(oldSeg.points.map((p) => [p.date, p.percent]), [["2025-06-01", 40], ["2025-06-15", 70]]);
  assert.equal(newSeg.legacy, undefined);
  assert.deepEqual(newSeg.points.map((p) => [p.date, p.percent, p.assessed]), [["2026-10-01", 70, 2]]);
});

test("overall: a session only counts what was assessed, absences add no point, and an unmapped old score is not drawn", () => {
  const d = data({
    reports: [fresh("n1", "2026-10-01", { [key("dasar", "meluncur")]: 5 }), fresh("n2", "2026-10-08", {}, "izin")],
    legacy: { reports: [legacy("L1", "2025-06-01", { "Dasar - Meluncur": 3 })], map: [] },
  });
  const segs = overallSeries(d);
  assert.equal(segs.length, 1, "no mapping -> no old segment");
  assert.deepEqual(segs[0].points.map((p) => p.percent), [100]);
});

test("overall: nothing at all gives no chart", () => {
  assert.deepEqual(overallSeries({ ...makeData(), legacy: { reports: [], map: [] } }), []);
});

test("trend adapter: old mapped scores sit under the new indicator key with their original date", () => {
  const raw = [
    { session_date: "2025-06-01", session_number: 1, attendance: "hadir", scores: { "Dasar - Meluncur": 2, "Dasar - Menyelam": 0 }, curriculum_version: null },
    { session_date: "2025-06-08", session_number: 2, attendance: "izin", scores: {}, curriculum_version: null },
    { session_date: "2026-10-01", session_number: 30, attendance: "hadir", scores: { [key("dasar", "meluncur")]: 5, bogus: 3 }, curriculum_version: 1 },
  ];
  const { config, reports } = trendInput(data(), raw);
  assert.deepEqual(reports[0].scores, { [key("dasar", "meluncur")]: 2 }, "legacy 0 is dropped, not drawn as 0");
  assert.equal(reports[0].session_date, "2025-06-01");
  assert.equal(reports[1].scores, null, "an absence stays an absence");
  assert.deepEqual(reports[2].scores, { [key("dasar", "meluncur")]: 5 }, "keys outside the curriculum are ignored");
  assert.ok(config.byKey[key("dasar", "meluncur")]);
});

test("trend adapter: the same aspect at different levels is labelled with its level", () => {
  const raw = [{ session_date: "2026-10-01", session_number: 1, attendance: "hadir", scores: { [key("bebas", "l1_gerakan_kaki")]: 3 }, curriculum_version: 1 }];
  const { config } = trendInput(data(), raw);
  assert.equal(config.byKey[key("bebas", "l1_gerakan_kaki")].label, "Gerakan Kaki · Level 1");
  // the child's current level (1) is listed even before it is scored; other levels are not
  assert.ok(config.byKey[key("bebas", "l1_posisi_tubuh")]);
  assert.equal(config.byKey[key("bebas", "l2_posisi_tubuh")], undefined);
});
