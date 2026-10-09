import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBenefits } from "../src/lib/benefits";

test("a typed asterisk or bullet is removed so the list does not show two bullets", () => {
  assert.deepEqual(cleanBenefits(["*belum termasuk tiket masuk kolam", "• Didampingi orang tua", "- Hemat", "– Gratis handuk"]), [
    "Belum termasuk tiket masuk kolam",
    "Didampingi orang tua",
    "Hemat",
    "Gratis handuk",
  ]);
});

test("the four Baby Swim lines come out exactly as written", () => {
  const lines = [
    "1 sesi pengenalan air bersama coach",
    "Didampingi orang tua atau pendamping di area kolam",
    "Observasi kesiapan air dan rekomendasi latihan dari coach",
    "Belum termasuk tiket masuk kolam",
  ];
  assert.deepEqual(cleanBenefits(lines), lines);
});

test("empty, blank and non-text lines are dropped; spaces are tidied; digits stay as typed", () => {
  assert.deepEqual(cleanBenefits(["", "   ", null, 5, "  1 bulan   4 sesi,  1-2 anak "]), ["1 bulan 4 sesi, 1-2 anak"]);
  assert.deepEqual(cleanBenefits(undefined), []);
  assert.deepEqual(cleanBenefits(null), []);
});
