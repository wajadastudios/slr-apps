// Regenerates the curriculum seed migrations from their definitions:
//   0049 (Kids Swim)       <- src/lib/curriculum/definition.ts
//   0054 (Teen & Adult)    <- src/lib/curriculum/definition-adult.ts
// Run: npx tsx scripts/gen-curriculum-seed.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ADULT_SPEC, KIDS_SPEC, buildSeedSql } from "../src/lib/curriculum/seed-sql";

for (const [file, spec] of [
  ["0049_curriculum_levels_seed.sql", KIDS_SPEC],
  ["0054_curriculum_adult_seed.sql", ADULT_SPEC],
] as const) {
  const target = path.resolve(__dirname, "../supabase/migrations", file);
  writeFileSync(target, buildSeedSql(spec), "utf8");
  console.log("wrote", target);
}
