// Regenerates supabase/migrations/0049_curriculum_levels_seed.sql from
// src/lib/curriculum/definition.ts. Run: npx tsx scripts/gen-curriculum-seed.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildSeedSql } from "../src/lib/curriculum/seed-sql";

const target = path.resolve(__dirname, "../supabase/migrations/0049_curriculum_levels_seed.sql");
writeFileSync(target, buildSeedSql(), "utf8");
console.log("wrote", target);
