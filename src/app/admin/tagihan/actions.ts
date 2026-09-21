"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getSiteOrigin } from "@/lib/site-url";

// where to go after an action: the page it was started from, when that is an
// admin page (never an arbitrary URL)
function backTo(formData: FormData, fallback = "/admin/tagihan"): string {
  const to = String(formData.get("return") ?? "");
  return to.startsWith("/admin/") ? to : fallback;
}

function withError(to: string, message: string): string {
  return `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

type Db = Awaited<ReturnType<typeof createClient>>;

// One draft invoice for a participant and a package. The invoice is tied to the
// participant's enrollment in the package's program (and so to that
// enrollment's one billing account by the database). A second open invoice for
// the same enrollment is refused: it would bill the same sessions twice.
async function createDraftInvoice(
  supabase: Db,
  student_id: string,
  program_package_id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: pkg } = await supabase
    .from("program_packages")
    .select("name, sessions_count, price, program_id")
    .eq("id", program_package_id)
    .single();
  if (!pkg) return { ok: false, error: "Paket tidak ditemukan." };

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", student_id)
    .eq("program_id", pkg.program_id)
    .not("status", "in", "(cancelled,rejected)")
    .maybeSingle();
  if (enrollment) {
    const { count: open } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollment.id)
      .in("status", ["draft", "approved", "sent", "processing"]);
    if ((open ?? 0) > 0) {
      return { ok: false, error: "Sudah ada tagihan yang belum lunas untuk pendaftaran ini. Selesaikan atau hapus tagihan itu dulu." };
    }
  }

  // The referral discount only ever applies to a student's very first
  // invoice (their first month) -- every invoice after that is full price,
  // so this checks for zero prior invoices rather than any student flag.
  const { data: student } = await supabase
    .from("students")
    .select("referral_discount_type, referral_discount_value")
    .eq("id", student_id)
    .single();

  let amount = pkg.price;
  if (student?.referral_discount_type) {
    const { count: priorInvoiceCount } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("student_id", student_id);

    if ((priorInvoiceCount ?? 0) === 0) {
      const discount =
        student.referral_discount_type === "percent"
          ? (pkg.price * Number(student.referral_discount_value)) / 100
          : Number(student.referral_discount_value);
      amount = Math.max(0, pkg.price - discount);
    }
  }

  const { error } = await supabase.from("invoices").insert({
    student_id,
    program_package_id,
    enrollment_id: enrollment?.id ?? null,
    package_name: pkg.name,
    sessions_count: pkg.sessions_count,
    amount,
    status: "draft",
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("billing account not ready")
        ? "Peserta ini membayar dari akunnya sendiri, tetapi akunnya belum aktif. Minta peserta membuka undangan, atau ubah penanggung jawab pembayaran di halaman pendaftar."
        : "Tagihan belum dapat dibuat. Periksa data lalu coba lagi.",
    };
  }

  // Clear the parent's renewal preference now that it's been acted on.
  await supabase.from("students").update({ next_package_preference_id: null }).eq("id", student_id);
  return { ok: true };
}

async function createInvoiceForStudentActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);

  const student_id = String(formData.get("student_id") ?? "");
  const program_package_id = String(formData.get("program_package_id") ?? "");
  if (!student_id || !program_package_id) {
    redirect(withError(returnTo, "Siswa dan paket wajib dipilih."));
  }

  const result = await createDraftInvoice(await createClient(), student_id, program_package_id);
  if (!result.ok) redirect(withError(returnTo, result.error));

  revalidatePath("/admin/tagihan");
  redirect(returnTo);
}

// Draft invoices for several participants at once: one package per selected
// enrollment. Each is created (or refused) on its own; nothing is sent.
async function bulkCreateInvoicesActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);
  const picked = formData.getAll("ids").map(String).filter(Boolean);
  if (picked.length === 0) redirect(withError(returnTo, "Pilih peserta yang akan dibuatkan tagihan."));

  const supabase = await createClient();
  const { data: enrollments } = await supabase.from("enrollments").select("id, student_id").in("id", picked);

  let made = 0;
  const problems: string[] = [];
  for (const e of enrollments ?? []) {
    const pkg = String(formData.get(`package_${e.id}`) ?? "");
    if (!pkg) {
      problems.push("Ada peserta tanpa paket terpilih.");
      continue;
    }
    const r = await createDraftInvoice(supabase, e.student_id, pkg);
    if (r.ok) made += 1;
    else problems.push(r.error);
  }

  revalidatePath("/admin/tagihan");
  if (made === 0) redirect(withError(returnTo, problems[0] ?? "Tidak ada tagihan yang dibuat."));
  if (problems.length > 0) {
    redirect(withError(returnTo, `${made} draft dibuat, ${problems.length} dilewati: ${[...new Set(problems)].join(" ")}`));
  }
  redirect(returnTo);
}

// Billing thresholds (site settings).
async function saveBillingSettingsActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);
  const threshold = Number(formData.get("ambang_penagihan"));
  const days = Number(formData.get("jatuh_tempo_hari"));
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 20) {
    redirect(withError(returnTo, "Ambang penagihan harus angka 0 sampai 20 sesi."));
  }
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    redirect(withError(returnTo, "Batas jatuh tempo harus 1 sampai 90 hari."));
  }
  const supabase = await createClient();
  const { error } = await supabase.from("site_settings").upsert(
    [
      { key: "ambang_penagihan", value: String(threshold) },
      { key: "jatuh_tempo_hari", value: String(days) },
    ],
    { onConflict: "key" }
  );
  if (error) redirect(withError(returnTo, "Pengaturan belum dapat disimpan."));
  revalidatePath("/admin/tagihan");
  revalidatePath("/admin");
  redirect(returnTo);
}

async function getInvoiceNotifyInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoice_id: string
) {
  const { data } = await supabase
    .from("invoices")
    .select(
      "package_name, student:student_id(full_name), billing:billing_account_id(phone)"
    )
    .eq("id", invoice_id)
    .single();

  const student = data?.student as unknown as { full_name: string } | null;
  // the invoice goes to its ONE billing account, never to whoever else manages
  // the participant
  const billing = data?.billing as unknown as { phone: string | null } | null;

  return {
    studentName: student?.full_name ?? "-",
    parentPhone: billing?.phone ?? null,
    packageName: data?.package_name ?? "-",
  };
}

async function sendInvoiceActionImpl(formData: FormData) {
  const session = await requireAdmin();

  const invoice_id = String(formData.get("invoice_id") ?? "");
  const amount = Number(formData.get("amount") ?? "0");

  if (!invoice_id || !amount || amount <= 0) {
    redirect(
      `/admin/tagihan?error=${encodeURIComponent("Nominal tagihan harus lebih dari 0.")}`
    );
  }

  const supabase = await createClient();

  const { data: invoiceNumber } = await supabase.rpc("next_invoice_number");

  const { error } = await supabase
    .from("invoices")
    .update({
      amount,
      status: "sent",
      approved_by: session.user.id,
      sent_at: new Date().toISOString(),
      invoice_number: invoiceNumber,
    })
    .eq("id", invoice_id);

  if (error) {
    redirect(`/admin/tagihan?error=${encodeURIComponent(error.message)}`);
  }

  const { studentName, parentPhone } = await getInvoiceNotifyInfo(
    supabase,
    invoice_id
  );
  const origin = await getSiteOrigin();
  await sendWhatsApp(
    parentPhone,
    `Invoice les renang untuk ${studentName}: ${origin}/invoice/${invoice_id}`
  );

  revalidatePath("/admin/tagihan");
  revalidatePath("/ortu/tagihan");
  redirect(backTo(formData));
}

async function markPaidActionImpl(formData: FormData) {
  await requireAdmin();

  const invoice_id = String(formData.get("invoice_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", invoice_id);

  if (error) {
    redirect(`/admin/tagihan?error=${encodeURIComponent(error.message)}`);
  }

  // A paid package must add sessions to somebody's enrollment: link an invoice
  // that was never linked to the participant's running enrollment now.
  const { data: paid } = await supabase
    .from("invoices")
    .select("student_id, enrollment_id, program_package_id")
    .eq("id", invoice_id)
    .maybeSingle();
  if (paid && !paid.enrollment_id) {
    const { data: pkg } = paid.program_package_id
      ? await supabase.from("program_packages").select("program_id").eq("id", paid.program_package_id).maybeSingle()
      : { data: null };
    if (pkg) {
      const { data: enr } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", paid.student_id)
        .eq("program_id", pkg.program_id)
        .not("status", "in", "(cancelled,rejected)")
        .maybeSingle();
      if (enr) await supabase.from("invoices").update({ enrollment_id: enr.id }).eq("id", invoice_id);
    }
  }

  const { studentName, parentPhone, packageName } = await getInvoiceNotifyInfo(
    supabase,
    invoice_id
  );
  await sendWhatsApp(
    parentPhone,
    `Tagihan les renang untuk ${studentName} (${packageName}) sudah dikonfirmasi LUNAS. Terima kasih!`
  );

  revalidatePath("/admin/tagihan");
  revalidatePath("/ortu/tagihan");
  redirect(backTo(formData));
}

// Sends the payment link again to the invoice's billing account. Uses the real
// WhatsApp integration (Fonnte); a failed delivery is logged by sendWhatsApp
// and never reported as sent.
async function resendInvoiceActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);
  const invoice_id = String(formData.get("invoice_id") ?? "");
  const supabase = await createClient();

  const { data: inv } = await supabase.from("invoices").select("status").eq("id", invoice_id).maybeSingle();
  if (!inv || !["sent", "processing"].includes(inv.status)) {
    redirect(withError(returnTo, "Hanya tagihan yang menunggu pembayaran yang dapat dikirim ulang."));
  }

  const { studentName, parentPhone } = await getInvoiceNotifyInfo(supabase, invoice_id);
  if (!parentPhone) {
    redirect(withError(returnTo, "Akun penagih belum punya nomor WhatsApp. Lengkapi nomornya di data akun."));
  }
  const origin = await getSiteOrigin();
  const sent = await sendWhatsApp(
    parentPhone,
    `Pengingat: invoice les renang untuk ${studentName}: ${origin}/invoice/${invoice_id}`
  );
  if (sent === false) {
    redirect(withError(returnTo, "Pesan WhatsApp belum terkirim. Periksa koneksi Fonnte, lalu coba lagi."));
  }

  await supabase.from("activity_log").insert({
    entity_type: "reminder",
    entity_id: invoice_id,
    invoice_id,
    action: "note",
    note: `Pengingat pembayaran dikirim ke ${parentPhone}`,
    actor_id: (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  redirect(returnTo);
}

export const resendInvoiceAction = safeAction(resendInvoiceActionImpl, "Link pembayaran dikirim ulang");
export const bulkCreateInvoicesAction = safeAction(bulkCreateInvoicesActionImpl, "Draft tagihan dibuat");
export const saveBillingSettingsAction = safeAction(saveBillingSettingsActionImpl, "Pengaturan penagihan disimpan");
export const createInvoiceForStudentAction = safeAction(createInvoiceForStudentActionImpl, "Tagihan berhasil dibuat");
export const sendInvoiceAction = safeAction(sendInvoiceActionImpl, "Tagihan berhasil dikirim");
export const markPaidAction = safeAction(markPaidActionImpl, "Pembayaran berhasil dikonfirmasi");
