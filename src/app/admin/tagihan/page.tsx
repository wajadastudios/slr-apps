import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { ToastForm } from "@/components/ui/toast-form";
import { CopyButton } from "@/components/ui/copy-button";
import { InvoiceShareLinks } from "@/components/invoice-share-links";
import { Badge, EmptyState, FIELD_CLASS, FilterBar, PageHeader, TabLinks, type Tone } from "@/components/admin/ui";
import { SelectAll } from "@/components/admin/select-all";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { loadAdminData, selectAll } from "@/lib/admin/load";
import { enrollmentBilling } from "@/lib/admin/queue";
import { invoiceProblem, isOverdue, quotaLine, PROBLEM_TEXT, REASON_TEXT } from "@/lib/admin/quota";
import { formatDate, rupiah } from "@/lib/admin/format";
import { PRICE_SOURCE_LABEL, DISCOUNT_TYPE_LABEL, type PriceSource } from "@/lib/pricing";
import {
  bulkCreateInvoicesAction,
  markPaidAction,
  resendInvoiceAction,
  saveBillingSettingsAction,
  sendInvoiceAction,
  updateDraftInvoiceAction,
  reviseInvoiceAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const PAGE = 30;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  sent: "Menunggu pembayaran",
  processing: "Menunggu verifikasi",
  paid: "Lunas",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
  superseded: "Direvisi",
};
const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  approved: "neutral",
  sent: "warn",
  processing: "info",
  paid: "ok",
  cancelled: "neutral",
  expired: "danger",
  superseded: "neutral",
};

type InvoiceRow = {
  id: string;
  student_id: string;
  enrollment_id: string | null;
  package_name: string;
  sessions_count: number;
  amount: number;
  base_price: number | null;
  discount_amount: number;
  discount_type: string | null;
  price_source: string;
  override_reason: string | null;
  supersedes_invoice_id: string | null;
  superseded_by_invoice_id: string | null;
  status: string;
  payment_method: string | null;
  payment_proof_url: string | null;
  invoice_number: string | null;
  created_at: string;
  sent_at: string | null;
  student: { full_name: string } | null;
  billing: { full_name: string | null; email: string } | null;
};

type Params = { tab?: string; alasan?: string; q?: string; program?: string; limit?: string; error?: string };

export default async function TagihanPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const origin = await getSiteOrigin();

  const [data, invoices, { data: packages }, { data: students }, { data: programs }, { data: lockRows }] = await Promise.all([
    loadAdminData(supabase),
    selectAll<InvoiceRow>(
      supabase,
      "invoices",
      "id, student_id, enrollment_id, package_name, sessions_count, amount, base_price, discount_amount, discount_type, price_source, override_reason, supersedes_invoice_id, superseded_by_invoice_id, status, payment_method, payment_proof_url, invoice_number, created_at, sent_at, student:student_id(full_name), billing:billing_account_id(full_name, email)"
    ),
    supabase.from("program_packages").select("id, program_id, name, sessions_count, price").eq("active", true).order("sessions_count"),
    supabase.from("students").select("id, next_package_preference_id"),
    supabase.from("programs").select("id, name").order("name"),
    supabase.from("enrollment_price_locks").select("enrollment_id, program_package_id, price").order("effective_from", { ascending: false }),
  ]);

  const enrollmentById = new Map(data.enrollments.map((e) => [e.id, e]));
  const preference = new Map((students ?? []).map((s) => [s.id, s.next_package_preference_id as string | null]));
  // Latest lock per (enrollment, package) -- used only to preview which
  // price a draft would resolve to; createDraftInvoice re-resolves it for
  // real when the draft is actually created.
  const lockPriceByKey = new Map<string, number>();
  for (const l of lockRows ?? []) {
    const key = `${l.enrollment_id}:${l.program_package_id}`;
    if (!lockPriceByKey.has(key)) lockPriceByKey.set(key, Number(l.price));
  }
  const packagesByProgram = new Map<string, NonNullable<typeof packages>>();
  for (const p of packages ?? []) {
    const list = packagesByProgram.get(p.program_id) ?? [];
    list.push(p);
    packagesByProgram.set(p.program_id, list);
  }

  const billing = enrollmentBilling(data.enrollments, data.invoices, data.reports, data.threshold);
  const due = billing.filter((b) => b.reason !== null);
  const overdrawn = billing.filter((b) => b.quota.overdrawn > 0);

  const problems = invoices
    .map((inv) => ({ inv, problem: invoiceProblem(inv, inv.enrollment_id ? enrollmentById.get(inv.enrollment_id)?.status : null) }))
    .filter((x) => x.problem !== null);

  const overdue = invoices.filter((i) => isOverdue(i, data.overdueDays));
  const draft = invoices.filter((i) => i.status === "draft" || i.status === "approved");
  const waiting = invoices.filter((i) => i.status === "sent" || i.status === "processing");
  const paid = invoices.filter((i) => i.status === "paid");

  const tab = ["perlu-ditagih", "draft", "menunggu", "lunas", "jatuh-tempo", "bermasalah"].includes(sp.tab ?? "") ? (sp.tab as string) : "perlu-ditagih";
  const tabs = [
    { key: "perlu-ditagih", label: "Perlu ditagih", count: due.length, href: "/admin/tagihan?tab=perlu-ditagih" },
    { key: "draft", label: "Draft tagihan", count: draft.length, href: "/admin/tagihan?tab=draft" },
    { key: "menunggu", label: "Menunggu pembayaran", count: waiting.length, href: "/admin/tagihan?tab=menunggu" },
    { key: "lunas", label: "Lunas", count: paid.length, href: "/admin/tagihan?tab=lunas" },
    { key: "jatuh-tempo", label: "Jatuh tempo", count: overdue.length, href: "/admin/tagihan?tab=jatuh-tempo" },
    { key: "bermasalah", label: "Bermasalah", count: problems.length + overdrawn.length, href: "/admin/tagihan?tab=bermasalah" },
  ];

  const q = (sp.q ?? "").trim().toLowerCase();
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);
  const matchesInvoice = (i: InvoiceRow) => {
    const enr = i.enrollment_id ? enrollmentById.get(i.enrollment_id) : undefined;
    if (sp.program && enr?.program_id !== sp.program) return false;
    return !q || [i.student?.full_name, i.billing?.full_name, i.package_name, i.invoice_number].some((v) => (v ?? "").toLowerCase().includes(q));
  };

  const back = `/admin/tagihan?${new URLSearchParams(Object.entries({ tab, alasan: sp.alasan, q: sp.q, program: sp.program }).filter(([, v]) => v) as [string, string][]).toString()}`;

  function invoiceCard(inv: InvoiceRow) {
    const enr = inv.enrollment_id ? enrollmentById.get(inv.enrollment_id) : undefined;
    const info = inv.enrollment_id ? billing.find((b) => b.enrollment.id === inv.enrollment_id) : undefined;
    const problem = invoiceProblem(inv, enr?.status);
    const isDraft = inv.status === "draft" || inv.status === "approved";
    const isWaiting = inv.status === "sent" || inv.status === "processing";
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#17263D]">
              <Link href={`/admin/murid/${inv.student_id}?tab=tagihan`} className="hover:underline">
                {inv.student?.full_name ?? "Peserta"}
              </Link>{" "}
              &mdash; {inv.package_name} ({inv.sessions_count} sesi) · {rupiah(inv.amount)}
            </p>
            <p className="text-xs text-slate-500">
              {enr?.programName ?? "Tanpa pendaftaran"} · Penanggung bayar: {inv.billing?.full_name ?? "-"} · {inv.invoice_number ?? "Draft"} · {formatDate(inv.created_at)}
            </p>
            {(inv.base_price != null || inv.discount_amount > 0) && (
              <p className="text-xs text-slate-500">
                {PRICE_SOURCE_LABEL[(inv.price_source as PriceSource) ?? "package"]}
                {inv.base_price != null ? ` · Harga dasar ${rupiah(inv.base_price)}` : ""}
                {inv.discount_amount > 0 ? ` · Diskon ${DISCOUNT_TYPE_LABEL[inv.discount_type ?? ""] ?? rupiah(inv.discount_amount)}` : ""}
                {inv.override_reason ? ` · Alasan: ${inv.override_reason}` : ""}
              </p>
            )}
            {info && <p className="text-xs text-slate-600">{quotaLine(info.quota)}</p>}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[inv.status] ?? "neutral"}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge>
              {isOverdue(inv, data.overdueDays) && <Badge tone="danger">Jatuh tempo</Badge>}
              {problem && <Badge tone="danger">{PROBLEM_TEXT[problem]}</Badge>}
              {inv.status !== "paid" && <Badge tone="neutral">Belum menambah kuota</Badge>}
              {inv.supersedes_invoice_id && <Badge tone="info">Revisi dari tagihan lain</Badge>}
              {inv.superseded_by_invoice_id && (
                <Badge tone="neutral">
                  Digantikan{" "}
                  <Link href={`/admin/murid/${inv.student_id}?tab=tagihan`} className="underline">
                    tagihan baru
                  </Link>
                </Badge>
              )}
            </div>
            {inv.status === "processing" && inv.payment_proof_url && (
              <a href={inv.payment_proof_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-[#0B6470] underline">
                Lihat bukti transfer ({inv.payment_method === "qris" ? "QRIS" : "Transfer"})
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDraft && (
              <ToastForm action={sendInvoiceAction} pendingLabel="Memproses...">
                <input type="hidden" name="invoice_id" value={inv.id} />
                <input type="hidden" name="return" value={back} />
                <GlassButton type="submit" className={`${ADMIN_CTA} px-4 py-2 text-sm`}>
                  Setujui &amp; kirim
                </GlassButton>
              </ToastForm>
            )}
            {isWaiting && (
              <>
                <ToastForm action={markPaidAction} pendingLabel="Memproses...">
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <input type="hidden" name="return" value={back} />
                  <GlassButton type="submit" className={`${ADMIN_CTA} px-4 py-2 text-sm`}>
                    {inv.status === "processing" ? "Konfirmasi lunas" : "Tandai sudah bayar"}
                  </GlassButton>
                </ToastForm>
                <ToastForm action={resendInvoiceAction} pendingLabel="Mengirim...">
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <input type="hidden" name="return" value={back} />
                  <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-2 text-sm`}>
                    Kirim ulang WhatsApp
                  </GlassButton>
                </ToastForm>
              </>
            )}
            {["sent", "processing", "paid"].includes(inv.status) && (
              <>
                <CopyButton value={`${origin}/invoice/${inv.id}`} label="Salin link" className="px-3 py-1.5 text-xs" />
                <InvoiceShareLinks origin={origin} invoiceId={inv.id} studentName={inv.student?.full_name ?? ""} parentEmail={inv.billing?.email} />
              </>
            )}
          </div>
        </div>

        {isDraft && (
          <details className="rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none font-medium text-[#0B6470]">Edit draft (nominal, diskon, sesi, catatan)</summary>
            <ToastForm action={updateDraftInvoiceAction} pendingLabel="Menyimpan..." className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="invoice_id" value={inv.id} />
              <input type="hidden" name="return" value={back} />
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Nominal (Rp)
                <GlassInput name="amount" type="number" min={1} defaultValue={inv.amount > 0 ? inv.amount : undefined} className="w-36" required />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Jumlah sesi
                <GlassInput name="sessions_count" type="number" min={1} defaultValue={inv.sessions_count} className="w-24" required />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
                Alasan override (wajib jika nominal ≠ harga peserta/paket)
                <GlassInput name="override_reason" defaultValue={inv.override_reason ?? ""} placeholder="Contoh: diskon khusus event" />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
                Catatan internal (opsional)
                <GlassInput name="internal_note" placeholder="Catatan untuk admin lain" />
              </label>
              <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-4 py-2 text-sm`}>
                Simpan draft
              </GlassButton>
            </ToastForm>
          </details>
        )}

        {isWaiting && (
          <details className="rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none font-medium text-[#0B6470]">Revisi tagihan</summary>
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-slate-600">
                Tagihan ini sudah dikirim dan tidak diedit langsung. Merevisi akan menandai tagihan ini &ldquo;Direvisi&rdquo;
                (link pembayaran lamanya otomatis tidak bisa dipakai membayar lagi -- sistem belum terhubung ke payment
                gateway pihak ketiga, jadi ini ditangani di level status aplikasi) dan membuat draft baru dengan nominal
                terbaru untuk Anda tinjau dan kirim.
              </p>
              <ToastForm action={reviseInvoiceAction} pendingLabel="Merevisi..." className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="invoice_id" value={inv.id} />
                <input type="hidden" name="return" value={back} />
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Nominal baru (Rp)
                  <GlassInput name="amount" type="number" min={1} defaultValue={inv.amount} className="w-36" required />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Jumlah sesi
                  <GlassInput name="sessions_count" type="number" min={1} defaultValue={inv.sessions_count} className="w-24" required />
                </label>
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
                  Alasan revisi (wajib)
                  <GlassInput name="revision_reason" placeholder="Contoh: salah input jumlah sesi" required />
                </label>
                <GlassButton type="submit" className={`${ADMIN_CTA} px-4 py-2 text-sm`}>
                  Buat revisi
                </GlassButton>
              </ToastForm>
            </div>
          </details>
        )}
      </div>
    );
  }

  const filters = (
    <FilterBar action="/admin/tagihan">
      <input type="hidden" name="tab" value={tab} />
      {sp.alasan && <input type="hidden" name="alasan" value={sp.alasan} />}
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
        Cari
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Peserta, penanggung bayar, atau nomor invoice" className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Program
        <select name="program" defaultValue={sp.program ?? ""} className={FIELD_CLASS}>
          <option value="">Semua program</option>
          {(programs ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
        Terapkan
      </GlassButton>
      {(sp.q || sp.program) && (
        <Link href={`/admin/tagihan?tab=${tab}`} className="min-h-10 self-center text-sm font-semibold text-[#0B6470] hover:underline">
          Reset
        </Link>
      )}
    </FilterBar>
  );

  function invoiceList(list: InvoiceRow[], empty: string, hint: string) {
    const rows = list.filter(matchesInvoice).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (rows.length === 0) return <EmptyState title={sp.q || sp.program ? "Tidak ada tagihan yang cocok." : empty} hint={hint} />;
    return (
      <div className="flex flex-col gap-2">
        {rows.slice(0, limit).map((inv) => (
          <div key={inv.id}>{invoiceCard(inv)}</div>
        ))}
        {rows.length > limit && (
          <Link
            href={`${back}&limit=${limit + PAGE}`}
            className={`inline-flex min-h-11 w-fit items-center rounded-2xl border px-5 text-sm font-semibold ${SECONDARY_BUTTON}`}
          >
            Tampilkan lebih banyak ({rows.length - limit} lagi)
          </Link>
        )}
      </div>
    );
  }

  // ------------- Perlu ditagih -------------
  const dueRows = due
    .filter((b) => (sp.alasan === "belum-lunas" ? b.reason === "no_package" : sp.alasan === "kuota-menipis" ? b.reason === "low_quota" : true))
    .filter((b) => !sp.program || b.enrollment.program_id === sp.program)
    .filter((b) => !q || [b.enrollment.studentName, b.enrollment.programName].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => a.quota.remaining - b.quota.remaining || a.enrollment.studentName.localeCompare(b.enrollment.studentName));

  // the participant's own choice first; otherwise the smallest package
  function defaultPackage(programId: string, studentId: string): string {
    const options = packagesByProgram.get(programId) ?? [];
    const asked = preference.get(studentId);
    return options.find((o) => o.id === asked)?.id ?? options[0]?.id ?? "";
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tagihan"
        subtitle="Paket dibayar dulu: hanya tagihan Lunas yang menambah kuota, dan setiap kehadiran mengurangi sisa sesi."
      />
      <TabLinks tabs={tabs} active={tab} label="Kategori tagihan" />

      {sp.error && (
        <p role="alert" className="rounded-xl bg-[#FFF0F3] px-4 py-3 text-sm text-[#7A1B36]">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      {tab === "perlu-ditagih" && (
        <>
          <GlassCard className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className={HEADING}>Pengaturan penagihan</h2>
                <p className="text-sm text-slate-600">
                  Peserta masuk antrean saat sisa kuota sama dengan atau di bawah ambang, atau belum punya paket lunas.
                </p>
              </div>
              <ToastForm action={saveBillingSettingsAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="return" value={back} />
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Ambang sisa sesi
                  <input name="ambang_penagihan" type="number" min={0} max={20} defaultValue={data.threshold} className={`${FIELD_CLASS} w-28`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Jatuh tempo (hari)
                  <input name="jatuh_tempo_hari" type="number" min={1} max={90} defaultValue={data.overdueDays} className={`${FIELD_CLASS} w-28`} />
                </label>
                <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-4 py-2 text-sm`}>
                  Simpan
                </GlassButton>
              </ToastForm>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["", "Semua"],
                ["belum-lunas", "Belum punya paket lunas"],
                ["kuota-menipis", "Kuota hampir habis"],
              ].map(([key, label]) => (
                <Link
                  key={key}
                  href={`/admin/tagihan?tab=perlu-ditagih${key ? `&alasan=${key}` : ""}`}
                  className={`inline-flex min-h-9 items-center rounded-xl px-3 text-sm font-semibold ${(sp.alasan ?? "") === key ? "bg-[#0E7C89] text-white" : "border border-white/60 bg-white/60 text-slate-700"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </GlassCard>

          {filters}

          {dueRows.length === 0 ? (
            <EmptyState
              title={sp.q || sp.program || sp.alasan ? "Tidak ada peserta yang cocok." : "Tidak ada peserta yang perlu ditagih."}
              hint="Peserta muncul di sini saat kuotanya hampir habis atau belum punya paket lunas. Tagihan yang sudah dibuat tampil di tab Draft atau Menunggu pembayaran."
            />
          ) : (
            <GlassCard className="flex flex-col gap-3">
              <ToastForm action={bulkCreateInvoicesAction} className="flex flex-col gap-3" pendingLabel="Membuat draft...">
                <input type="hidden" name="return" value="/admin/tagihan?tab=draft" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SelectAll name="ids" />
                  <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
                    Buat draft tagihan untuk yang dipilih
                  </GlassButton>
                </div>
                <div className="flex flex-col gap-2">
                  {dueRows.slice(0, limit).map((b) => {
                    const options = packagesByProgram.get(b.enrollment.program_id) ?? [];
                    const preferred = preference.get(b.enrollment.student_id);
                    return (
                      <div key={b.enrollment.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
                        <input type="checkbox" name="ids" value={b.enrollment.id} disabled={options.length === 0} aria-label={`Pilih ${b.enrollment.studentName}`} className="mt-1 h-4 w-4" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#17263D]">
                            <Link href={`/admin/murid/${b.enrollment.student_id}?tab=tagihan`} className="hover:underline">
                              {b.enrollment.studentName}
                            </Link>{" "}
                            · {b.enrollment.programName}
                          </p>
                          <p className="text-sm text-slate-700">{quotaLine(b.quota)}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge tone={b.reason === "no_package" ? "danger" : "warn"}>{REASON_TEXT[b.reason!]}</Badge>
                            {b.quota.overdrawn > 0 && <Badge tone="danger">Kehadiran melebihi kuota</Badge>}
                            {preferred && <Badge tone="info">Ada pilihan paket dari orang tua</Badge>}
                          </div>
                        </div>
                        <div className="col-span-2 lg:col-span-1">
                          <GlassSelect name={`package_${b.enrollment.id}`} defaultValue={defaultPackage(b.enrollment.program_id, b.enrollment.student_id)} glassChevron className="min-w-56 text-sm">
                            {options.length === 0 && <option value="">Belum ada paket aktif</option>}
                            {options.map((p) => {
                              const locked = lockPriceByKey.get(`${b.enrollment.id}:${p.id}`);
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.name} · {p.sessions_count} sesi · {rupiah(locked ?? p.price)}
                                  {locked != null ? " (harga terkunci)" : ""}
                                  {p.id === preferred ? " (pilihan orang tua)" : ""}
                                </option>
                              );
                            })}
                          </GlassSelect>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ToastForm>
              {dueRows.length > limit && (
                <Link href={`${back}&limit=${limit + PAGE}`} className={`inline-flex min-h-11 w-fit items-center rounded-2xl border px-5 text-sm font-semibold ${SECONDARY_BUTTON}`}>
                  Tampilkan lebih banyak ({dueRows.length - limit} lagi)
                </Link>
              )}
            </GlassCard>
          )}
        </>
      )}

      {tab === "draft" && (
        <>
          {filters}
          {invoiceList(draft, "Belum ada draft tagihan.", "Buat draft dari tab Perlu ditagih, lalu setujui dan kirim ke penanggung bayar.")}
        </>
      )}
      {tab === "menunggu" && (
        <>
          {filters}
          {invoiceList(waiting, "Tidak ada tagihan yang menunggu pembayaran.", "Tagihan yang sudah dikirim dan belum lunas tampil di sini sampai dikonfirmasi.")}
        </>
      )}
      {tab === "lunas" && (
        <>
          {filters}
          {invoiceList(paid, "Belum ada tagihan lunas.", "Tagihan yang dikonfirmasi lunas menambah kuota sesi peserta.")}
        </>
      )}
      {tab === "jatuh-tempo" && (
        <>
          {filters}
          {invoiceList(overdue, `Tidak ada tagihan yang lewat ${data.overdueDays} hari.`, "Tagihan terkirim yang belum dibayar lebih dari batas jatuh tempo muncul di sini. Kirim ulang pengingat WhatsApp dari daftar.")}
        </>
      )}

      {tab === "bermasalah" && (
        <>
          {filters}
          {invoiceList(problems.map((p) => p.inv), "Tidak ada pembayaran bermasalah.", "Lunas tetapi tidak menambah sesi, atau belum terhubung ke pendaftaran kelas, akan muncul di sini.")}
          {overdrawn.length > 0 && (
            <GlassCard className="flex flex-col gap-2">
              <h2 className={HEADING}>Peringatan administrasi: kehadiran melebihi kuota</h2>
              <p className="text-sm text-slate-600">Data lama tidak diubah. Buat tagihan agar kuota sesuai dengan kehadiran.</p>
              {overdrawn.map((b) => (
                <div key={b.enrollment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/60 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-[#17263D]">
                      {b.enrollment.studentName} · {b.enrollment.programName}
                    </p>
                    <p className="text-xs text-slate-600">
                      {quotaLine(b.quota)} · kelebihan {b.quota.overdrawn} sesi
                    </p>
                  </div>
                  <Link href={`/admin/murid/${b.enrollment.student_id}?tab=tagihan`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}>
                    Buat tagihan
                  </Link>
                </div>
              ))}
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}

