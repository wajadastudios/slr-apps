import { test } from "node:test";
import assert from "node:assert/strict";
import { indicators, key, makeData } from "./helpers/curriculum-fixture";
import { activeLevel, attendanceSummary, buildUnits, coverageText, currentFocus, indicatorHistory, orderUnits, overallProgress, statusOf } from "../src/lib/curriculum/progress";
import type { CurriculumData, CurriculumReport, LegacyMapEntry, LegacyReport } from "../src/lib/curriculum/types";

const idOf = (k: string) => indicators.find((i) => i.key === k)!.id;
const entry = (legacyKey: string, target: string): LegacyMapEntry => ({ legacyKey, legacyLabel: legacyKey, legacyGroup: null, status: "auto", targetId: idOf(target) });
const old = (id: string, date: string, scores: Record<string, number>, attendance = "hadir"): LegacyReport => ({ id, sessionDate: date, attendance, scores, labels: {} });
const fresh = (id: string, date: string, scores: Record<string, number>): CurriculumReport => ({ id, sessionDate: date, attendance: "hadir", scores, curriculumVersion: 1, context: {}, authorName: null, notes: null });

const D = (slug: string) => key("dasar", slug);
const W = (slug: string) => key("water_safety", slug);
const B1 = (slug: string) => key("bebas", `l1_${slug}`);
const unit = (data: CurriculumData, slug: string) => buildUnits(data).find((u) => u.skill.slug === slug)!;

test("Progress % is the latest stars over assessed x 5: Dasar 2,9/5 -> 58%, Water Safety 3/5 -> 60%, Bebas L1 1/5 -> 20%", () => {
  const data = makeData({
    reports: [
      fresh("r1", "2026-10-01", {
        [D("meluncur")]: 3, [D("menyelam")]: 3, [D("mengapung")]: 3, [D("adaptasi_di_air")]: 3, [D("sikap_keberanian")]: 2, [D("pernapasan")]: 3.5,
        [W("floating")]: 3,
        [B1("posisi_tubuh")]: 1,
      }),
    ],
  });
  // 3+3+3+3+2+3.5 = 17.5 over 6 indicators = 2.92 -> 58%
  assert.equal(unit(data, "dasar").percent, 58);
  assert.equal(unit(data, "water_safety").percent, 60);
  assert.equal(unit(data, "bebas").percent, 20);
});

test("only the LATEST star of each indicator counts, and an indicator never assessed is not a 0", () => {
  const data = makeData({
    reports: [fresh("r1", "2026-09-01", { [D("meluncur")]: 1, [D("menyelam")]: 5 }), fresh("r2", "2026-10-01", { [D("meluncur")]: 4 })],
  });
  const u = unit(data, "dasar");
  assert.equal(u.assessed, 2);
  assert.equal(u.total, 6);
  assert.equal(u.percent, 90); // (4 + 5) / 10
  assert.equal(coverageText(u), "2 dari 6 indikator sudah dinilai");
});

test("no assessment at all: 'Belum dimulai' with no number", () => {
  const u = unit(makeData(), "dasar");
  assert.equal(u.status, "belum_dimulai");
  assert.equal(u.percent, null);
});

test("a student with only Dasar and Water Safety gets two units and the strokes stay not started", () => {
  const data = makeData({ reports: [fresh("r1", "2026-10-01", { [D("meluncur")]: 3, [D("menyelam")]: 3, [D("mengapung")]: 3, [W("floating")]: 3 })] });
  const units = buildUnits(data);
  assert.deepEqual(units.filter((u) => u.status !== "belum_dimulai").map((u) => u.skill.slug), ["dasar", "water_safety"]);
  assert.ok(units.filter((u) => u.skill.hasLevels).every((u) => u.status === "belum_dimulai"));
});

test("a skill with one single assessment is 'Baru dimulai' and is not part of Overall", () => {
  const data = makeData({
    reports: [
      fresh("r1", "2026-08-01", { [D("meluncur")]: 3, [D("menyelam")]: 3, [D("mengapung")]: 3, [D("adaptasi_di_air")]: 3 }),
      fresh("r2", "2026-10-01", { [B1("posisi_tubuh")]: 2 }),
    ],
  });
  const bebas = unit(data, "bebas");
  assert.equal(bebas.status, "baru_dimulai");
  assert.equal(bebas.eligible, false);
  const overall = overallProgress(buildUnits(data));
  assert.equal(overall?.count, 1, "only Dasar (4 of 6 indicators) is measured enough");
  assert.equal(overall?.percent, 60);
});

test("three sessions, or half of the indicators, make a skill count towards Overall", () => {
  const threeSessions = makeData({
    reports: [fresh("a", "2026-09-01", { [B1("posisi_tubuh")]: 2 }), fresh("b", "2026-09-08", { [B1("posisi_tubuh")]: 3 }), fresh("c", "2026-09-15", { [B1("posisi_tubuh")]: 4 })],
  });
  assert.equal(unit(threeSessions, "bebas").eligible, true);
  assert.equal(unit(threeSessions, "bebas").status, "berkembang_baik", "20% of the indicators but 3 sessions; the one indicator is at 80%");
});

test("status thresholds: mastered needs everything assessed and 90%+", () => {
  assert.equal(statusOf({ assessed: 6, total: 6, percent: 93, sessions: 5 }).status, "sudah_dikuasai");
  assert.equal(statusOf({ assessed: 5, total: 6, percent: 95, sessions: 5 }).status, "berkembang_baik", "one indicator never assessed: not mastered");
  assert.equal(statusOf({ assessed: 3, total: 6, percent: 72, sessions: 1 }).status, "berkembang_baik", "half the indicators is enough");
  assert.equal(statusOf({ assessed: 3, total: 6, percent: 40, sessions: 1 }).status, "sedang_dilatih");
  assert.equal(statusOf({ assessed: 1, total: 6, percent: 60, sessions: 1 }).status, "baru_dimulai");
  assert.equal(statusOf({ assessed: 0, total: 6, percent: null, sessions: 0 }).status, "belum_dimulai");
});

test("old scores take part through the mapping, by their original dates, and a legacy 0 is skipped", () => {
  const data: CurriculumData = {
    ...makeData(),
    legacy: {
      reports: [old("L1", "2025-06-01", { "Dasar - Meluncur": 2, "Dasar - Menyelam": 0 }), old("L2", "2025-07-06", { "Dasar - Meluncur": 4, "Dasar - Menyelam": 3 }), old("L3", "2025-08-03", { "Dasar - Meluncur": 3 }, "izin")],
      map: [entry("Dasar - Meluncur", D("meluncur")), entry("Dasar - Menyelam", D("menyelam"))],
    },
  };
  const h = indicatorHistory(data);
  assert.deepEqual(h.get(D("meluncur")), [{ date: "2025-06-01", score: 2 }, { date: "2025-07-06", score: 4 }]);
  assert.deepEqual(h.get(D("menyelam")), [{ date: "2025-07-06", score: 3 }], "0 is not an assessment, and a missed session adds nothing");
  const u = unit(data, "dasar");
  assert.equal(u.percent, 70); // (4 + 3) / 10
  assert.deepEqual(u.series.map((p) => [p.date, p.percent]), [["2025-06-01", 40], ["2025-07-06", 70]]);
});

test("old and new assessments of the same indicator continue one line: the newest wins", () => {
  const data: CurriculumData = {
    ...makeData({ reports: [fresh("n1", "2026-10-01", { [D("meluncur")]: 5 })] }),
    legacy: { reports: [old("L1", "2025-06-01", { "Dasar - Meluncur": 2 })], map: [entry("Dasar - Meluncur", D("meluncur"))] },
  };
  const u = unit(data, "dasar");
  assert.equal(u.items[0].score, 5);
  assert.deepEqual(u.series.map((p) => p.percent), [40, 100]);
});

test("running the mapping data twice cannot duplicate points (one entry per old key)", () => {
  const map = [entry("Dasar - Meluncur", D("meluncur"))];
  const once: CurriculumData = { ...makeData(), legacy: { reports: [old("L1", "2025-06-01", { "Dasar - Meluncur": 3 })], map } };
  const twice: CurriculumData = { ...once, legacy: { ...once.legacy!, map: [...map, ...map].filter((m, i, a) => a.findIndex((x) => x.legacyKey === m.legacyKey) === i) } };
  assert.deepEqual(indicatorHistory(twice), indicatorHistory(once));
});

test("an unmapped old indicator does not take part anywhere", () => {
  const data: CurriculumData = {
    ...makeData(),
    legacy: { reports: [old("L1", "2025-06-01", { "Dasar - Meluncur": 5, "Water Safety - Floating": 5 })], map: [{ ...entry("Dasar - Meluncur", D("meluncur")) }, { legacyKey: "Water Safety - Floating", legacyLabel: "Floating", legacyGroup: null, status: "review", targetId: null }] },
  };
  assert.equal(unit(data, "water_safety").status, "belum_dimulai");
  assert.equal(overallProgress(buildUnits(data)), null);
});

test("a stroke whose history sits on Level 1 is a Level 1 child even before a level is recorded", () => {
  const data: CurriculumData = {
    ...makeData(),
    legacy: { reports: [old("L1", "2025-06-01", { "Gaya Bebas - Gerakan Kaki": 3 })], map: [entry("Gaya Bebas - Gerakan Kaki", B1("gerakan_kaki"))] },
  };
  const bebas = data.skills.find((s) => s.slug === "bebas")!;
  assert.equal(activeLevel(data, bebas), 1);
  assert.equal(unit(data, "bebas").assessed, 1);
});

test("Overall is the average of the measured units, or nothing", () => {
  assert.equal(overallProgress([]), null);
  const data = makeData({
    reports: [
      fresh("r1", "2026-09-01", { [D("meluncur")]: 4, [D("menyelam")]: 4, [D("mengapung")]: 4, [W("floating")]: 3, [W("treading_water")]: 3, [W("masuk_air")]: 3, [W("kembali_ke_permukaan")]: 3 }),
    ],
  });
  const o = overallProgress(buildUnits(data));
  assert.equal(o?.count, 2);
  assert.equal(o?.percent, 70); // Dasar 80%, Water Safety 60% -> 70
});

test("focus: the pengajar's recommendation wins, otherwise the lowest assessed indicator, otherwise nothing", () => {
  const data = makeData({ reports: [fresh("r1", "2026-10-01", { [D("meluncur")]: 4, [D("menyelam")]: 2, [D("mengapung")]: 5, [D("adaptasi_di_air")]: 4 })] });
  const units = buildUnits(data);
  assert.deepEqual(currentFocus(units, [{ session_date: "2026-10-01", attendance: "hadir", next_focus: "Latihan Menyelam lebih dalam" }]), { text: "Latihan Menyelam lebih dalam", skillId: "g_dasar" });
  assert.equal(currentFocus(units, [{ session_date: "2026-10-01", attendance: "hadir", next_focus: "  " }])?.text, "Menyelam");
  assert.equal(currentFocus(buildUnits(makeData()), []), null);
});

test("attendance counts present sessions over all sessions", () => {
  assert.deepEqual(attendanceSummary([{ attendance: "hadir" }, { attendance: "hadir" }, { attendance: "izin" }]), { present: 2, total: 3 });
});

test("cards: not-started skills never get a card, at most three show first, the focus skill leads", () => {
  const rep = (id: string, s: Record<string, number>) => fresh(id, "2026-10-01", s);
  const data = makeData({
    reports: [
      rep("a", { [D("meluncur")]: 3, [D("menyelam")]: 3, [D("mengapung")]: 3 }),
      rep("b", { [W("floating")]: 3, [W("treading_water")]: 3, [W("masuk_air")]: 3, [W("kembali_ke_permukaan")]: 3 }),
      rep("c", { [B1("posisi_tubuh")]: 3, [B1("gerakan_kaki")]: 3, [B1("gerakan_tangan")]: 3 }),
      rep("d", { [key("dada", "l1_posisi_tubuh")]: 2, [key("dada", "l1_timing")]: 2, [key("dada", "l1_gerakan_kaki")]: 2 }),
    ],
  });
  const units = buildUnits(data);
  const { main, more } = orderUnits(units, { text: "Dada", skillId: "g_dada" });
  assert.equal(main.length, 3);
  assert.equal(main[0].skill.slug, "dada", "the focus skill comes first");
  assert.equal(more.length, 1);
  assert.ok([...main, ...more].every((u) => u.status !== "belum_dimulai"));
  assert.ok(![...main, ...more].some((u) => u.skill.slug === "punggung" || u.skill.slug === "kupu"));
});
