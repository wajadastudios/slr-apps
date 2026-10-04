// Gives every non-draft invoice without a public_token its own link token,
// the same way sending an invoice does (32 random bytes, hex). The Excel
// migration created paid invoices without one, so their page/PDF/WhatsApp/
// email links did not work. Touches only the public_token column.
//
//   node scripts/billing-migration/backfill-public-token.mjs            (dry-run)
//   node scripts/billing-migration/backfill-public-token.mjs --execute
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const execute = process.argv.includes("--execute");

const { data, error } = await db.from("invoices").select("id, invoice_number").is("public_token", null).neq("status", "draft");
if (error) throw error;
console.log(`Invoice non-draft tanpa link: ${data.length}`);
if (!execute) {
  console.log("Dry-run. Jalankan dengan --execute untuk mengisi link.");
} else {
  let done = 0;
  for (const inv of data) {
    const { error: e } = await db.from("invoices").update({ public_token: randomBytes(32).toString("hex") }).eq("id", inv.id).is("public_token", null);
    if (e) console.error(`${inv.invoice_number}: ${e.message}`);
    else done++;
  }
  const { count } = await db.from("invoices").select("*", { count: "exact", head: true }).is("public_token", null).neq("status", "draft");
  console.log(`Diisi: ${done}. Sisa tanpa link: ${count}.`);
}
