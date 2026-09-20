import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWeek,
  daySummary,
  formatSessionTime,
  namesPreview,
  reportHref,
  sessionStatus,
  type Enrollment,
  type ReportLite,
} from "../src/lib/teaching-schedule";
import {
  computeAwards,
  computeMilestoneStatuses,
  latestTopMedal,
  tierForValue,
  tierReached,
} from "../src/lib/milestones";
import { DEFAULT_MILESTONES } from "../src/lib/default-milestones";
import type { PerformanceRecordRow } from "../src/lib/performance";

// Week Minggu 20 Sep .. Sabtu 26 Sep 2026; "today" is Senin 21 Sep.
const SUNDAY = new Date(2026, 8, 20);
const TODAY = "2026-09-21"; // Senin

const slot = (id: string, day: number, time: string, label: string, over: Partial<Enrollment["slot"]> = {}) => ({
  id,
  label,
  location: null,
  day_of_week: day,
  start_time: time,
  program_id: "p-kids",
  program: "Kids Swim",
  ...over,
});
const student = (id: string, name: string) => ({ id, full_name: name });

const enrollments: Enrollment[] = [
  { student: student("rara", "Rara Putri"), slot: slot("s1", 1, "15:00:00", "Private") },
  { student: student("ica", "Ica Sari"), slot: slot("s2", 1, "16:00:00", "Private") },
  // group class on Selasa, 5 students, same slot
  ...["Sheza A", "Sabhira B", "Umar C", "Dina D", "Eko E"].map((n, i) => ({
    student: student(`g${i}`, n),
    slot: slot("s3", 2, "15:00:00", "Grup", { location: "Kolam CDR" }),
  })),
];

const reports: ReportLite[] = [
  { student_id: "rara", program_id: "p-kids", session_date: "2026-09-14", attendance: "hadir", next_focus: "Meluncur" },
  { student_id: "ica", program_id: "p-kids", session_date: "2026-09-21", attendance: "sakit", next_focus: null },
];

test("time reads 15.00, not 15:00:00", () => {
  assert.equal(formatSessionTime("15:00:00"), "15.00");
  assert.equal(formatSessionTime("07:30"), "07.30");
});

test("private sessions stay separate; group class students merge into one item", () => {
  const week = buildWeek(enrollments, reports, SUNDAY, TODAY);
  const senin = week[1];
  assert.equal(senin.items.length, 2);
  assert.ok(senin.items.every((i) => !i.isGroup));
  const selasa = week[2];
  assert.equal(selasa.items.length, 1);
  assert.equal(selasa.items[0].isGroup, true);
  assert.equal(selasa.items[0].students.length, 5);
  assert.equal(selasa.items[0].location, "Kolam CDR");
  assert.equal(namesPreview(selasa.items[0].students.map((s) => s.name)), "Dina, Eko, Sabhira +2");
});

test("status: belum, tersimpan, izin, sakit, and no obligation for future sessions", () => {
  assert.equal(sessionStatus(undefined, "2026-09-21", TODAY), "belum");
  assert.equal(sessionStatus({ attendance: "hadir" }, "2026-09-21", TODAY), "tersimpan");
  assert.equal(sessionStatus({ attendance: "izin" }, "2026-09-21", TODAY), "izin");
  assert.equal(sessionStatus({ attendance: "sakit" }, "2026-09-21", TODAY), "sakit");
  assert.equal(sessionStatus(undefined, "2026-09-22", TODAY), "mendatang");
  assert.equal(sessionStatus(undefined, "2026-09-20", TODAY), "belum"); // earlier this week
});

test("today: statuses, counts and summary use the report for that exact date", () => {
  const week = buildWeek(enrollments, reports, SUNDAY, TODAY);
  const senin = week[1];
  assert.equal(senin.isToday, true);
  const [rara, ica] = senin.items.map((i) => i.students[0]);
  assert.equal(rara.status, "belum"); // her only report is a week earlier
  assert.equal(ica.status, "sakit"); // report dated today, sakit
  assert.equal(senin.pending, 1);
  assert.equal(daySummary(senin), "2 sesi · 1 laporan perlu diisi");
});

test("upcoming days show only the session count", () => {
  const selasa = buildWeek(enrollments, reports, SUNDAY, TODAY)[2];
  assert.equal(selasa.pending, 0);
  assert.equal(daySummary(selasa), "1 sesi");
  assert.ok(selasa.items[0].students.every((s) => s.status === "mendatang"));
});

test("focus line data: latest next_focus or 'has report' flag, nothing otherwise", () => {
  const senin = buildWeek(enrollments, reports, SUNDAY, TODAY)[1];
  const rara = senin.items[0].students[0];
  assert.equal(rara.focus, "Meluncur");
  const ica = senin.items[1].students[0];
  assert.equal(ica.focus, null);
  assert.equal(ica.hasReport, true);
  const fresh = buildWeek(
    [{ student: student("new", "Baru"), slot: slot("s9", 1, "10:00:00", "Private") }],
    [],
    SUNDAY,
    TODAY
  )[1].items[0].students[0];
  assert.equal(fresh.focus, null);
  assert.equal(fresh.hasReport, false);
});

test("group progress counts written reports, including izin/sakit", () => {
  const groupReports: ReportLite[] = [
    { student_id: "g0", program_id: "p-kids", session_date: "2026-09-21", attendance: "hadir", next_focus: null },
    { student_id: "g1", program_id: "p-kids", session_date: "2026-09-21", attendance: "izin", next_focus: null },
  ];
  const group = buildWeek(
    enrollments.map((e) => (e.slot.id === "s3" ? { ...e, slot: { ...e.slot, day_of_week: 1 } } : e)),
    groupReports,
    SUNDAY,
    TODAY
  )[1].items.find((i) => i.isGroup)!;
  const filled = group.students.filter((s) => s.status !== "belum" && s.status !== "mendatang").length;
  assert.equal(filled, 2);
  assert.equal(group.students.length, 5);
});

test("only an unwritten report links with the session date", () => {
  assert.equal(reportHref("rara", "belum", "2026-09-21", "p-kids"), "/pelatih/murid/rara?program=p-kids&tanggal=2026-09-21");
  assert.equal(reportHref("rara", "tersimpan", "2026-09-21", "p-kids"), "/pelatih/murid/rara?program=p-kids");
});

// ---------- medals ----------
const rec = (over: Partial<PerformanceRecordRow>): PerformanceRecordRow => {
  const r = {
    id: Math.random().toString(36).slice(2),
    metric_type: "tahan_nafas" as const,
    stroke: null,
    distance_m: null,
    duration_seconds: null,
    recorded_at: "2026-09-01",
    ...over,
  };
  return { ...r, awards: computeAwards(r, DEFAULT_MILESTONES) };
};
const tierOf = (records: PerformanceRecordRow[], id: string) =>
  computeMilestoneStatuses(records, DEFAULT_MILESTONES).find((s) => s.milestone.id === `seed:${id}`)!.tier;

test("medal tier is exact for duration, distance and time metrics", () => {
  // duration (higher is better): 3 / 5 / 8
  assert.equal(tierOf([], "tahan-nafas"), null);
  assert.equal(tierOf([rec({ duration_seconds: 2 })], "tahan-nafas"), null);
  assert.equal(tierOf([rec({ duration_seconds: 3 })], "tahan-nafas"), "bronze");
  assert.equal(tierOf([rec({ duration_seconds: 5 })], "tahan-nafas"), "silver");
  assert.equal(tierOf([rec({ duration_seconds: 8 })], "tahan-nafas"), "gold");
  // distance (higher is better): 3 / 5 / 8
  const glide = (d: number) => rec({ metric_type: "jarak_tempuh", stroke: "Meluncur", distance_m: d });
  assert.deepEqual([2, 3, 5, 9].map((d) => tierOf([glide(d)], "jarak-meluncur")), [null, "bronze", "silver", "gold"]);
  // time (lower is better): 60 / 50 / 40
  const bebas = (t: number) => rec({ metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: 25, duration_seconds: t });
  assert.deepEqual([61, 60, 50, 38].map((t) => tierOf([bebas(t)], "waktu-25m-bebas")), [null, "bronze", "silver", "gold"]);
  const m = DEFAULT_MILESTONES.find((x) => x.id === "seed:waktu-25m-bebas")!;
  assert.equal(tierForValue(m, 45), "silver"); // slower than gold, faster than bronze
});

test("a gold record shows gold, never a bronze fallback; best tier wins", () => {
  const records = [
    rec({ duration_seconds: 3, recorded_at: "2026-08-01" }),
    rec({ duration_seconds: 9, recorded_at: "2026-09-01" }),
  ];
  assert.equal(tierOf(records, "tahan-nafas"), "gold");
});

test("reached targets: everything up to the earned tier, nothing above", () => {
  assert.deepEqual((["bronze", "silver", "gold"] as const).map((t) => tierReached("silver", t)), [true, true, false]);
  assert.deepEqual((["bronze", "silver", "gold"] as const).map((t) => tierReached(null, t)), [false, false, false]);
  assert.deepEqual((["bronze", "silver", "gold"] as const).map((t) => tierReached("gold", t)), [true, true, true]);
});

test("top medal: highest tier, then most recently earned", () => {
  const statuses = computeMilestoneStatuses(
    [
      rec({ duration_seconds: 9, recorded_at: "2026-08-01" }), // tahan nafas gold (older)
      rec({ metric_type: "mengapung_telentang", duration_seconds: 25, recorded_at: "2026-09-10" }), // gold (newer)
      rec({ metric_type: "jarak_tempuh", stroke: "Meluncur", distance_m: 3, recorded_at: "2026-09-12" }), // bronze
    ],
    DEFAULT_MILESTONES
  );
  const top = latestTopMedal(statuses)!;
  assert.equal(top.tier, "gold");
  assert.equal(top.milestone.id, "seed:mengapung-telentang");
  assert.equal(latestTopMedal(computeMilestoneStatuses([], DEFAULT_MILESTONES)), null);
});
