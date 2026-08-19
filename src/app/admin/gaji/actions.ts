"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import { MONTH_NAMES } from "@/lib/payroll";

// Proof photo is uploaded client-side straight to Supabase Storage (same
// reason as media-ads: stays under the Vercel Server Action body cap),
// so this only ever receives the resulting small values -- called directly
// from the client, not as a <form action>, so it throws on error rather
// than redirecting.
export async function markPayrollPaidAction(input: {
  pelatih_id: string;
  period_year: number;
  period_month: number;
  hadir_count: number;
  izin_sakit_count: number;
  amount: number;
  proof_url: string | null;
}) {
  const session = await requireAdmin();

  const supabase = await createClient();

  const { error } = await supabase.from("payroll_payments").upsert(
    {
      pelatih_id: input.pelatih_id,
      period_year: input.period_year,
      period_month: input.period_month,
      hadir_count: input.hadir_count,
      izin_sakit_count: input.izin_sakit_count,
      amount: input.amount,
      proof_url: input.proof_url,
      paid_at: new Date().toISOString(),
      paid_by: session.user.id,
    },
    { onConflict: "pelatih_id,period_year,period_month" }
  );

  if (error) throw new Error(error.message);

  const { data: pelatih } = await supabase
    .from("users")
    .select("full_name, phone")
    .eq("id", input.pelatih_id)
    .maybeSingle();

  if (pelatih?.phone) {
    const monthName = MONTH_NAMES[input.period_month - 1] ?? String(input.period_month);
    await sendWhatsApp(
      pelatih.phone,
      `Halo ${pelatih.full_name}, gaji periode ${monthName} ${input.period_year} sebesar Rp${input.amount.toLocaleString(
        "id-ID"
      )} sudah kami transfer. Terima kasih atas kerja kerasnya di Sari Les Renang!`
    );
  }

  revalidatePath("/admin/gaji");
}
