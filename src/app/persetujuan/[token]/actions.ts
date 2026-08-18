"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUserWithRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// How long an approved substitute keeps access after the session. Long
// enough to write the report late, short enough that covering one session
// does not become standing access to that student.
const ACCESS_DAYS = 7;

function accessUntil(sessionDate: string): string {
  const [y, m, d] = sessionDate.split("-").map(Number);
  // Date.UTC handles month/year rollover; staying in UTC throughout keeps
  // this free of local-timezone drift.
  return new Date(Date.UTC(y, m - 1, d + ACCESS_DAYS))
    .toISOString()
    .slice(0, 10);
}

async function decide(token: string, approve: boolean) {
  const session = await getUserWithRole();
  if (!session) redirect(`/login?next=/persetujuan/${token}`);

  const supabase = await createClient();

  // RLS already limits reads to the requester and the slot owner (admin has
  // full access), so an unauthorised viewer simply gets nothing back.
  const { data: request } = await supabase
    .from("substitution_requests")
    .select(
      "id, status, session_date, requester_id, token_expires_at, slot:slot_id(pelatih_id)"
    )
    .eq("approval_token", token)
    .maybeSingle();

  if (!request) {
    redirect(`/persetujuan/${token}?error=notfound`);
  }

  const slot = request.slot as unknown as { pelatih_id: string } | null;
  const isSlotOwner = slot?.pelatih_id === session.user.id;
  const isAdmin = session.role === "admin";

  // A requester must never approve their own request, even though RLS lets
  // them read it so they can see its status.
  if (!isAdmin && !isSlotOwner) {
    redirect(`/persetujuan/${token}?error=forbidden`);
  }

  if (request.status !== "pending") {
    redirect(`/persetujuan/${token}?error=decided`);
  }

  if (new Date(request.token_expires_at).getTime() < Date.now()) {
    redirect(`/persetujuan/${token}?error=expired`);
  }

  const { error } = await supabase
    .from("substitution_requests")
    .update({
      status: approve ? "approved" : "rejected",
      approved_by: session.user.id,
      decided_at: new Date().toISOString(),
      access_until: approve ? accessUntil(request.session_date) : null,
    })
    .eq("id", request.id);

  if (error) {
    redirect(`/persetujuan/${token}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/persetujuan/${token}`);
  revalidatePath("/pelatih/pengganti");
  redirect(`/persetujuan/${token}?selesai=1`);
}

export async function approveSubstitutionAction(formData: FormData) {
  await decide(String(formData.get("token") ?? ""), true);
}

export async function rejectSubstitutionAction(formData: FormData) {
  await decide(String(formData.get("token") ?? ""), false);
}
