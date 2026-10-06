import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSeedSql } from "../src/lib/curriculum/seed-sql";

// The seed migration is generated from src/lib/curriculum/definition.ts. This
// fails when someone edits one without regenerating the other.
test("0049 seed migration is in sync with the curriculum definition", () => {
  const file = readFileSync(path.resolve(__dirname, "../supabase/migrations/0049_curriculum_levels_seed.sql"), "utf8");
  assert.equal(file.replace(/\r\n/g, "\n"), buildSeedSql(), "run: npx tsx scripts/gen-curriculum-seed.ts");
});
