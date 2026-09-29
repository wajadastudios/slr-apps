import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cyclePositionsOf,
  countCycleReports,
  narrativeReminder,
  narrativeRequired,
  remainingUntilNarrative,
  NARRATIVE_CYCLE_START,
} from "../src/lib/narrative-cycle";

test("narrativeRequired: none never requires, every_1 always requires", () => {
  assert.equal(narrativeRequired("none", 1), false);
  assert.equal(narrativeRequired("none", 4), false);
  assert.equal(narrativeRequired("every_1", 1), true);
  assert.equal(narrativeRequired("every_1", 7), true);
});

test("narrativeRequired: every_4/every_2 only fire on multiples, position 0 never fires", () => {
  for (let p = 1; p <= 8; p++) {
    assert.equal(narrativeRequired("every_4", p), p === 4 || p === 8, `every_4 @ ${p}`);
    assert.equal(narrativeRequired("every_2", p), p % 2 === 0, `every_2 @ ${p}`);
  }
  assert.equal(narrativeRequired("every_4", 0), false);
});

test("countCycleReports: only final + hadir + on/after the cutoff counts", () => {
  const reports = [
    { status: "final", attendance: "hadir", session_date: "2026-09-30" }, // before cutoff
    { status: "final", attendance: "hadir", session_date: NARRATIVE_CYCLE_START },
    { status: "final", attendance: "izin", session_date: "2026-10-05" }, // not attended
    { status: "draft", attendance: "hadir", session_date: "2026-10-06" }, // not final
    { status: "final", attendance: "hadir", session_date: "2026-10-07" },
  ];
  assert.equal(countCycleReports(reports), 2);
});

test("narrativeReminder: every_4 matches the exact section-4 copy at each position in the cycle", () => {
  assert.equal(narrativeReminder("every_4", 1), "Rangkuman perkembangan wajib pada laporan ke-4");
  assert.equal(narrativeReminder("every_4", 2), "2 laporan lagi menuju rangkuman perkembangan");
  assert.equal(narrativeReminder("every_4", 3), "1 laporan lagi menuju rangkuman perkembangan");
  assert.equal(narrativeReminder("every_4", 4), "Rangkuman perkembangan wajib dilengkapi pada sesi ini");
  // cycle repeats identically for 5-8
  assert.equal(narrativeReminder("every_4", 5), "Rangkuman perkembangan wajib pada laporan ke-4");
  assert.equal(narrativeReminder("every_4", 8), "Rangkuman perkembangan wajib dilengkapi pada sesi ini");
});

test("narrativeReminder: none is always null, every_1 is always due", () => {
  assert.equal(narrativeReminder("none", 1), null);
  assert.equal(narrativeReminder("none", 4), null);
  assert.equal(narrativeReminder("every_1", 1), "Rangkuman perkembangan wajib dilengkapi pada sesi ini");
  assert.equal(narrativeReminder("every_1", 5), "Rangkuman perkembangan wajib dilengkapi pada sesi ini");
});

test("cyclePositionsOf: only flags the reports that actually landed on a required position", () => {
  const reports = [
    { id: "a", status: "final", attendance: "hadir", session_date: "2026-10-01" },
    { id: "b", status: "final", attendance: "hadir", session_date: "2026-10-02" },
    { id: "c", status: "final", attendance: "hadir", session_date: "2026-10-03" },
    { id: "d", status: "final", attendance: "hadir", session_date: "2026-10-04" },
    { id: "e", status: "draft", attendance: "hadir", session_date: "2026-10-05" },
  ];
  const positions = cyclePositionsOf(reports, "every_4");
  assert.deepEqual([...positions.entries()], [["d", 4]]);
});

test("remainingUntilNarrative: counts down to the next due position, null once due or for none/every_1", () => {
  assert.equal(remainingUntilNarrative("every_4", 1), 3);
  assert.equal(remainingUntilNarrative("every_4", 2), 2);
  assert.equal(remainingUntilNarrative("every_4", 3), 1);
  assert.equal(remainingUntilNarrative("every_4", 4), null);
  assert.equal(remainingUntilNarrative("every_4", 5), 3);
  assert.equal(remainingUntilNarrative("none", 1), null);
  assert.equal(remainingUntilNarrative("every_1", 1), null);
});

test("cyclePositionsOf: filled reports before the cutoff are excluded even if narratively present", () => {
  const reports = [
    { id: "old1", status: "final", attendance: "hadir", session_date: "2026-09-01" },
    { id: "old2", status: "final", attendance: "hadir", session_date: "2026-09-08" },
    { id: "old3", status: "final", attendance: "hadir", session_date: "2026-09-15" },
    { id: "old4", status: "final", attendance: "hadir", session_date: "2026-09-22" },
  ];
  assert.equal(cyclePositionsOf(reports, "every_4").size, 0);
});
