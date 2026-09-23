"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getSiteOrigin } from "@/lib/site-url";
import { lockEnrollmentPriceIfMissing, resolveInvoicePrice } from "@/lib/pricing";

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
  program_package_id: string,
  actorId: string | null
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

  // Kebijakan F: harga peserta yang terkunci untuk paket ini dulu, baru
  // harga paket aktif terbaru untuk pendaftar/paket yang belum pernah
  // ditagih. Never program_packages.price read directly here.
  const resolved = enrollment
    ? await resolveInvoicePrice(supabase, enrollment.id, program_package_id)
    : { price: Number(pkg.price), currency: "IDR", source: "package" as const, packagePriceVersionId: null, enrollmentPriceLockId: null, effectiveFrom: null };
  const basePrice = resolved.price;

  // The referral discount only ever applies to a student's very first
  // invoice (their first month) -- every invoice after that is full price,
  // so this checks for zero prior invoices rather than any student flag.
  const { data: student } = await supabase
    .from("students")
    .select("referral_discount_type, referral_discount_value")
    .eq("id", student_id)
    .single();

  let amount = basePrice;
  let discountAmount = 0;
  let discountType: "percent" | "fixed" | null = null;
  if (student?.referral_discount_type) {
    const { count: priorInvoiceCount } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("student_id", student_id);

    if ((priorInvoiceCount ?? 0) === 0) {
      discountType = student.referral_discount_type as "percent" | "fixed";
      discountAmount =
        student.referral_discount_type === "percent"
          ? (basePrice * Number(student.referral_discount_value)) / 100
          : Number(student.referral_discount_value);
      amount = Math.max(0, basePrice - discountAmount);
    }
  }

  const { error } = await supabase.from("invoices").insert({
    student_id,
    program_package_id,
    enrollment_id: enrollment?.id ?? null,
    package_name: pkg.name,
    sessions_count: pkg.sessions_count,
    amount,
    base_price: basePrice,
    discount_amount: discountAmount,
    discount_type: discountType,
    currency: resolved.currency,
    price_source: resolved.source,
    package_price_version_id: resolved.packagePriceVersionId,
    enrollment_price_lock_id: resolved.enrollmentPriceLockId,
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

  // First time this enrollment is billed for this package: lock the price in
  // now, so its *next* invoice for the same package reuses it even if the
  // package's price changes later (Kebijakan B).
  if (enrollment) {
    await lockEnrollmentPriceIfMissing(supabase, enrollment.id, program_package_id, resolved, actorId);
  }

  // Clear the parent's renewal preference now that it's been acted on.
  await supabase.from("students").update({ next_package_preference_id: null }).eq("id", student_id);
  return { ok: true };
}

async function createInvoiceForStudentActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);

  const student_id = String(formData.get("student_id") ?? "");
  const program_package_id = String(formData.get("program_package_id") ?? "");
  if (!student_id || !program_package_id) {
    redirect(withError(returnTo, "Siswa dan paket wajib dipilih."));
  }

  const result = await createDraftInvoice(await createClient(), student_id, program_package_id, session.user.id);
  if (!result.ok) redirect(withError(returnTo, result.error));

  revalidatePath("/admin/tagihan");
  redirect(returnTo);
}

// Draft invoices for several participants at once: one package per selected
// enrollment. Each is created (or refused) on its own; nothing is sent.
async function bulkCreateInvoicesActionImpl(formData: FormData) {
  const session = await requireAdmin();
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
    const r = await createDraftInvoice(supabase, e.student_id, pkg, session.user.id);
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

// Sends a draft/approved invoice exactly as it already stands -- editing the
// amount is updateDraftInvoiceAction's job (Kebijakan E: draft is editable,
// send is a separate, deliberate step, not a place to sneak in a last-second
// number with no record of why).
async function sendInvoiceActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);

  const invoice_id = String(formData.get("invoice_id") ?? "");
  if (!invoice_id) redirect(withError(returnTo, "Tagihan tidak ditemukan."));

  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("invoices")
    .select("status, amount")
    .eq("id", invoice_id)
    .maybeSingle();
  if (!draft || !["draft", "approved"].includes(draft.status)) {
    redirect(withError(returnTo, "Hanya draft tagihan yang dapat dikirim."));
  }
  if (!draft.amount || Number(draft.amount) <= 0) {
    redirect(withError(returnTo, "Isi nominal tagihan (edit draft) sebelum mengirim."));
  }

  const { data: invoiceNumber } = await supabase.rpc("next_invoice_number");

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "sent",
      approved_by: session.user.id,
      sent_at: new Date().toISOString(),
      invoice_number: invoiceNumber,
    })
    .eq("id", invoice_id);

  if (error) {
    redirect(withError(returnTo, error.message));
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

// Kebijakan E: a draft may be edited freely (amount, discount, sessions,
// note); if the resulting amount no longer matches what was resolved from
// the package/enrollment lock, the price source flips to "override" and a
// short reason is required -- never a silent number change with nothing to
// explain it later.
async function updateDraftInvoiceActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);

  const invoice_id = String(formData.get("invoice_id") ?? "");
  const amount = Number(formData.get("amount") ?? "0");
  const sessions_count = Number(formData.get("sessions_count") ?? "0");
  const override_reason = String(formData.get("override_reason") ?? "").trim();
  const internal_note = String(formData.get("internal_note") ?? "").trim();

  if (!invoice_id || !amount || amount <= 0 || !sessions_count || sessions_count < 1) {
    redirect(withError(returnTo, "Nominal dan jumlah sesi harus lebih dari 0."));
  }

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("status, base_price, discount_amount, price_source")
    .eq("id", invoice_id)
    .maybeSingle();
  if (!inv || !["draft", "approved"].includes(inv.status)) {
    redirect(withError(returnTo, "Hanya draft tagihan yang dapat diedit."));
  }

  const expected = Math.max(0, Number(inv.base_price ?? amount) - Number(inv.discount_amount ?? 0));
  const isOverride = Math.abs(expected - amount) > 0.5; // cent-level float noise only
  if (isOverride && !override_reason) {
    redirect(withError(returnTo, `Nominal (Rp${amount.toLocaleString("id-ID")}) berbeda dari harga peserta/paket (Rp${expected.toLocaleString("id-ID")}). Isi alasan override untuk menyimpan.`));
  }

  const { error } = await supabase
    .from("invoices")
    .update({
      amount,
      sessions_count,
      internal_note: internal_note || null,
      price_source: isOverride ? "override" : inv.price_source,
      override_reason: isOverride ? override_reason : null,
    })
    .eq("id", invoice_id);

  if (error) redirect(withError(returnTo, error.message));

  revalidatePath("/admin/tagihan");
  redirect(returnTo);
}

// Kebijakan E: a "sent" invoice's nominal is never changed in place. This
// closes it out as `superseded` and creates a brand new draft with the
// corrected numbers, linked both ways, so the old (already-shared) link
// keeps showing exactly what it always showed plus a clear "revised" notice
// -- see the superseded branch in /invoice/[id]/page.tsx.
async function reviseInvoiceActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);

  const invoice_id = String(formData.get("invoice_id") ?? "");
  const amount = Number(formData.get("amount") ?? "0");
  const sessions_count = Number(formData.get("sessions_count") ?? "0");
  const revision_reason = String(formData.get("revision_reason") ?? "").trim();

  if (!invoice_id || !amount || amount <= 0 || !sessions_count || sessions_count < 1 || !revision_reason) {
    redirect(withError(returnTo, "Nominal, jumlah sesi, dan alasan revisi wajib diisi."));
  }

  const supabase = await createClient();
  const { data: old } = await supabase
    .from("invoices")
    .select(
      "id, status, student_id, enrollment_id, program_package_id, package_name, base_price, discount_amount, discount_type, currency, package_price_version_id, enrollment_price_lock_id"
    )
    .eq("id", invoice_id)
    .maybeSingle();
  if (!old || !["sent", "processing"].includes(old.status)) {
    redirect(withError(returnTo, "Hanya tagihan yang sudah terkirim dan belum lunas yang dapat direvisi."));
  }

  const { data: created, error: insertError } = await supabase
    .from("invoices")
    .insert({
      student_id: old!.student_id,
      enrollment_id: old!.enrollment_id,
      program_package_id: old!.program_package_id,
      package_name: old!.package_name,
      sessions_count,
      amount,
      base_price: old!.base_price,
      discount_amount: old!.discount_amount,
      discount_type: old!.discount_type,
      currency: old!.currency,
      price_source: "override",
      override_reason: revision_reason,
      revision_reason,
      supersedes_invoice_id: old!.id,
      package_price_version_id: old!.package_price_version_id,
      enrollment_price_lock_id: old!.enrollment_price_lock_id,
      status: "draft",
    })
    .select("id")
    .single();
  if (insertError || !created) {
    redirect(withError(returnTo, "Revisi belum dapat dibuat. Periksa data lalu coba lagi."));
  }

  const { error: updateError } = await supabase
    .from("invoices")
    .update({ status: "superseded", superseded_by_invoice_id: created!.id })
    .eq("id", invoice_id);
  if (updateError) {
    redirect(withError(returnTo, updateError.message));
  }

  revalidatePath("/admin/tagihan");
  revalidatePath("/ortu/tagihan");
  redirect(returnTo);
}

// Kebijakan D: raising a participant's locked price is a deliberate admin
// action, never automatic. Writes a NEW enrollment_price_locks row (never
// updates an old one) so the price history stays intact; only affects this
// enrollment's *next* invoice for this package -- invoices already created
// keep their own already-stored amount untouched.
async function updateEnrollmentPriceActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);

  const enrollment_id = String(formData.get("enrollment_id") ?? "");
  const program_package_id = String(formData.get("program_package_id") ?? "");
  const price = Number(formData.get("price") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const effective_from = String(formData.get("effective_from") ?? "").trim();

  if (!enrollment_id || !program_package_id || Number.isNaN(price) || price < 0) {
    redirect(withError(returnTo, "Pendaftaran, paket, dan harga wajib diisi dengan benar."));
  }

  const supabase = await createClient();

  const { data: currentVersion } = await supabase
    .from("package_price_versions")
    .select("id")
    .eq("program_package_id", program_package_id)
    .eq("price", price)
    .is("effective_until", null)
    .maybeSingle();

  const { error } = await supabase.from("enrollment_price_locks").insert({
    enrollment_id,
    program_package_id,
    package_price_version_id: currentVersion?.id ?? null,
    price,
    reason,
    effective_from: effective_from ? new Date(effective_from).toISOString() : new Date().toISOString(),
    created_by: session.user.id,
  });
  if (error) redirect(withError(returnTo, error.message));

  revalidatePath("/admin/tagihan");
  revalidatePath("/admin/paket-harga");
  redirect(returnTo);
}

// Same as above, for several enrollments under one package at once (e.g.
// "everyone still on the old Kids Grup 4 Sesi price moves to the new one").
// Never the default path -- the single-enrollment form above is -- but
// available from /admin/paket-harga for exactly this kind of price-list bump.
async function bulkUpdateEnrollmentPriceActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);

  const program_package_id = String(formData.get("program_package_id") ?? "");
  const price = Number(formData.get("price") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const picked = formData.getAll("enrollment_ids").map(String).filter(Boolean);

  if (!program_package_id || Number.isNaN(price) || price < 0 || picked.length === 0) {
    redirect(withError(returnTo, "Pilih paket, isi harga baru, dan pilih minimal satu peserta."));
  }

  const supabase = await createClient();
  const { data: currentVersion } = await supabase
    .from("package_price_versions")
    .select("id")
    .eq("program_package_id", program_package_id)
    .eq("price", price)
    .is("effective_until", null)
    .maybeSingle();

  const rows = picked.map((enrollment_id) => ({
    enrollment_id,
    program_package_id,
    package_price_version_id: currentVersion?.id ?? null,
    price,
    reason,
    created_by: session.user.id,
  }));
  const { error } = await supabase.from("enrollment_price_locks").insert(rows);
  if (error) redirect(withError(returnTo, error.message));

  revalidatePath("/admin/tagihan");
  revalidatePath("/admin/paket-harga");
  redirect(returnTo);
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
export const updateDraftInvoiceAction = safeAction(updateDraftInvoiceActionImpl, "Draft tagihan disimpan");
export const reviseInvoiceAction = safeAction(reviseInvoiceActionImpl, "Tagihan lama ditandai direvisi, draft baru dibuat");
export const updateEnrollmentPriceAction = safeAction(updateEnrollmentPriceActionImpl, "Harga peserta diperbarui untuk tagihan berikutnya");
export const bulkUpdateEnrollmentPriceAction = safeAction(bulkUpdateEnrollmentPriceActionImpl, "Harga peserta terpilih diperbarui untuk tagihan berikutnya");
export const markPaidAction = safeAction(markPaidActionImpl, "Pembayaran berhasil dikonfirmasi");
