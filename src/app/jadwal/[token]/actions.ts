"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOfferOutcome } from "@/lib/enrollment-server";

// Public, token-based answer to a schedule offer. The token is the only
// credential: it is single-use (cleared once answered) and expires.
export async function answerOfferAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const accept = String(formData.get("decision") ?? "") === "accept";
  if (!token) redirect("/");

  // Resolved with the service client so the notification also works for a
  // signed-out visitor (the token is validated by the RPC below).
  const { data: enrollmentId } = await createAdminClient()
    .from("enrollments")
    .select("id")
    .eq("offer_token", token)
    .maybeSingle();

  const supabase = await createClient();
  const { data: outcome, error } = await supabase.rpc("respond_schedule_offer_by_token", {
    p_token: token,
    p_accept: accept,
  });
  if (error || typeof outcome !== "string") {
    redirect(`/jadwal/${token}?hasil=error`);
  }

  if (enrollmentId?.id) await notifyOfferOutcome(outcome, enrollmentId.id);

  redirect(`/jadwal/${token}?hasil=${outcome}`);
}
