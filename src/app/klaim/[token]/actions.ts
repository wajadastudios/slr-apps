"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAccountInput } from "@/lib/registration-input";

function back(token: string, message: string): never {
  redirect(`/klaim/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`);
}

const CLAIM_MESSAGE: Record<string, string> = {
  invalid: "Undangan ini sudah dipakai atau kedaluwarsa. Hubungi orang yang mendaftarkan Anda atau admin.",
  same_account: "Undangan ini untuk peserta yang didaftarkan akun Anda. Peserta perlu membukanya dengan akunnya sendiri.",
  not_authenticated: "Silakan masuk terlebih dahulu.",
};

// A signed-in account links itself to the participant that was registered
// for them.
export async function claimParticipantAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) back(token, CLAIM_MESSAGE.not_authenticated);

  const { data: outcome, error } = await supabase.rpc("claim_participant", { p_token: token });
  if (error || outcome !== "claimed") {
    back(token, CLAIM_MESSAGE[String(outcome)] ?? "Undangan belum dapat dipakai. Coba lagi.");
  }
  redirect("/ortu?terhubung=1");
}

// A new account for the participant: their own login, then the claim. The
// WhatsApp number given at registration stays the participant's number.
export async function createAccountAndClaimAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/");

  const account = parseAccountInput({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    website: formData.get("website"),
  });
  if (!account.ok) back(token, account.error);

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("students")
    .select("id, phone, user_id, claim_expires_at")
    .eq("claim_token", token)
    .maybeSingle();
  if (
    !target ||
    target.user_id ||
    (target.claim_expires_at && new Date(target.claim_expires_at) <= new Date())
  ) {
    back(token, CLAIM_MESSAGE.invalid);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: account.value.email,
    password: account.value.password,
    email_confirm: true,
    user_metadata: { full_name: account.value.full_name, role: "ortu" },
  });
  if (createError || !created?.user) {
    back(
      token,
      /already|registered|exists/i.test(createError?.message ?? "")
        ? "Email ini sudah terdaftar. Masuk dengan email tersebut, lalu buka kembali link undangan ini."
        : "Akun belum dapat dibuat. Periksa data Anda lalu coba lagi."
    );
  }

  await admin
    .from("users")
    .update({ phone: target.phone ?? account.value.phone })
    .eq("id", created.user.id);

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: account.value.email,
    password: account.value.password,
  });
  if (signInError) redirect("/login?dibuat=1");

  const { data: outcome } = await supabase.rpc("claim_participant", { p_token: token });
  if (outcome !== "claimed") {
    redirect(`/ortu?error=${encodeURIComponent("Akun sudah dibuat, tetapi undangan belum dapat dihubungkan. Hubungi admin.")}`);
  }
  redirect("/ortu?terhubung=1");
}
