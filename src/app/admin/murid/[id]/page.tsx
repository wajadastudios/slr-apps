import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassSelect } from "@/components/ui/glass-select";
import { ToastForm } from "@/components/ui/toast-form";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge, EmptyState, PageHeader, StatTile, TabLinks, type Tone } from "@/components/admin/ui";
import { ImpactConfirm } from "@/components/admin/impact-confirm";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { STATUS_LABEL, type EnrollmentStatus } from "@/lib/enrollment";
import { formatAge, formatMetricLabel, formatMetricValue, type PerformanceRecordRow } from "@/lib/performance";
import { genderLabel } from "@/lib/registration-input";
import { loadMilestones } from "@/lib/milestone-loader";
import { computeQuota, invoiceProblem, isOverdue, paidSessionsOf, quotaLine, PROBLEM_TEXT } from "@/lib/admin/quota";
import { describeActivity, type ActivityRow } from "@/lib/admin/activity";
import { coachName, dayName, formatClock, formatDate, formatDateTime, formatRange, rupiah } from "@/lib/admin/format";
import { createInvoiceForStudentAction, resendInvoiceAction } from "../../tagihan/actions";
import { setEnrollmentStatusAction } from "../../pendaftar/kelas/actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const TABS = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "jadwal", label: "Jadwal & Enrollment" },
  { key: "tagihan", label: "Tagihan & Kuota" },
  { key: "laporan", label: "Laporan" },
  { key: "rekor", label: "Rekor/Milestone" },
  { key: "riwayat", label: "Riwayat Aktivitas" },
];

const STATUS_TONE: Record<string, Tone> = {
  pending_review: "warn",
  waiting_schedule: "info",
  schedule_offered: "info",
  scheduled: "ok",
  active: "ok",
  cancelled: "neutral",
  rejected: "danger",
};

const INVOICE_TONE: Record<string, Tone> = { draft: "neutral", approved: "neutral", sent: "warn", processing: "info", paid: "ok" };
const INVOICE_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  sent: "Menunggu pembayaran",
  processing: "Menunggu verifikasi",
  paid: "Lunas",
};
const ATTENDANCE_TONE: Record<string, Tone> = { hadir: "ok", izin: "warn", sakit: "warn", alpha: "danger" };

type SlotRow = {
  id: string;
  label: string | null;
  location: string | null;
  day_of_week: number;
  start_time: string;
  duration_minutes: number | null;
  program_id: string;
  pelatih: { full_name: string; title: string | null } | null;
};

export default async function MuridDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; program?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "ringkasan";
  const supabase = await createClient();
  const origin = await getSiteOrigin();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, nickname, birth_date, gender, phone, kind, relationship, parent_id, user_id, is_self, active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!student) notFound();

  const [
    { data: parent },
    { data: ownUser },
    { data: enrollmentRows },
    { data: scheduleRows },
    { data: invoiceRows },
    { data: reportRows },
    { data: recordRows },
    { data: activityRows },
    { data: packages },
    { data: overdueSetting },
  ] = await Promise.all([
    supabase.from("users").select("id, full_name, email, phone").eq("id", student.parent_id).maybeSingle(),
    student.user_id
      ? supabase.from("users").select("id, full_name, email").eq("id", student.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("enrollments")
      .select(
        "id, status, slot_id, offered_slot_id, billing_mode, billing_contact_user_id, preferred_schedule, preferred_location, created_at, program:program_id(id, name, assessment_type, records_mode)"
      )
      .eq("student_id", id)
      .order("created_at"),
    supabase
      .from("schedules")
      .select("id, slot_id, slot:slot_id(id, label, location, day_of_week, start_time, duration_minutes, program_id, pelatih:pelatih_id(full_name, title))")
      .eq("student_id", id),
    supabase
      .from("invoices")
      .select("id, enrollment_id, status, sessions_count, amount, package_name, created_at, sent_at, invoice_number, billing:billing_account_id(full_name, email)")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("progress_reports")
      .select("id, enrollment_id, program_id, session_date, attendance, session_number, notes, next_focus, pelatih:pelatih_id(full_name, title)")
      .eq("student_id", id)
      .order("session_date", { ascending: false }),
    supabase
      .from("performance_records")
      .select("id, enrollment_id, program_id, metric_type, stroke, distance_m, duration_seconds, recorded_at, awards")
      .eq("student_id", id)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("id, created_at, actor_name, entity_type, action, changes, note")
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("program_packages").select("id, program_id, name, sessions_count, price").eq("active", true).order("sessions_count"),
    supabase.from("site_settings").select("value").eq("key", "jatuh_tempo_hari").maybeSingle(),
  ]);
  const overdueDays = Number(overdueSetting?.value) > 0 ? Number(overdueSetting?.value) : 7;

  type Enr = {
    id: string;
    status: EnrollmentStatus;
    slot_id: string | null;
    offered_slot_id: string | null;
    billing_mode: string;
    billing_contact_user_id: string | null;
    preferred_schedule: string | null;
    preferred_location: string | null;
    created_at: string;
    program: { id: string; name: string; assessment_type: string; records_mode: string } | null;
  };
  const enrollments = (enrollmentRows ?? []) as unknown as Enr[];
  const slots = (scheduleRows ?? [])
    .map((s) => s.slot as unknown as SlotRow | null)
    .filter((s): s is SlotRow => !!s);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const invoices = invoiceRows ?? [];
  const reports = reportRows ?? [];

  const live = enrollments.filter((e) => e.status !== "cancelled" && e.status !== "rejected");
  const slotOfEnrollment = (e: Enr) => slots.find((s) => s.program_id === e.program?.id);

  const quotaOf = (e: Enr) =>
    computeQuota(
      paidSessionsOf(invoices.filter((i) => i.enrollment_id === e.id)),
      reports.filter((r) => r.enrollment_id === e.id && r.attendance === "hadir").length
    );

  const activeProgramFilter = sp.program ?? "";
  const back = `/admin/murid/${id}?tab=${tab}`;
  const displayName = student.nickname ? `${student.full_name} (${student.nickname})` : student.full_name;
  const age = formatAge(student.birth_date);

  const tabs = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    href: `/admin/murid/${id}?tab=${t.key}`,
    count: t.key === "laporan" ? reports.length : t.key === "tagihan" ? invoices.length : undefined,
  }));

  const lookup = (kind: "user" | "slot", refId: string) => {
    if (kind === "slot") {
      const s = slotById.get(refId);
      return s ? `${dayName(s.day_of_week)} ${formatClock(s.start_time)}` : undefined;
    }
    return refId === parent?.id ? parent?.full_name : undefined;
  };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/murid" className="w-fit text-sm font-semibold text-[#0B6470] hover:underline">
        &lsaquo; Semua siswa
      </Link>
      <PageHeader
        title={displayName}
        subtitle={[
          student.kind === "child" ? "Anak" : student.kind === "self" ? "Peserta dewasa" : "Anggota keluarga",
          age,
          student.active ? null : "Nonaktif",
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <TabLinks tabs={tabs} active={tab} label="Bagian data peserta" />
      {sp.error && (
        <p role="alert" className="text-sm text-red-700">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      {/* ---------------- Ringkasan ---------------- */}
      {tab === "ringkasan" && (
        <div className="flex flex-col gap-4">
          <GlassCard>
            <h2 className={`mb-3 ${HEADING}`}>Identitas</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Nama lengkap</dt>
                <dd className="font-medium text-[#17263D]">{student.full_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tanggal lahir</dt>
                <dd className="font-medium text-[#17263D]">{student.birth_date ? `${formatDate(student.birth_date)}${age ? ` (${age})` : ""}` : "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Jenis kelamin</dt>
                <dd className="font-medium text-[#17263D]">{genderLabel(student.gender)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">WhatsApp peserta</dt>
                <dd className="font-medium text-[#17263D]">{student.phone ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Akun pemilik / penagih</dt>
                <dd className="font-medium text-[#17263D]">
                  {parent?.full_name ?? "-"}
                  <span className="block text-xs font-normal text-slate-500">
                    {parent?.email ?? ""}
                    {parent?.phone ? ` · ${parent.phone}` : ""}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Akun peserta sendiri</dt>
                <dd className="font-medium text-[#17263D]">
                  {student.user_id ? (ownUser?.full_name ?? "Ada") : student.kind === "adult_family" ? "Belum dibuat" : "Memakai akun keluarga"}
                </dd>
              </div>
              {student.relationship && (
                <div>
                  <dt className="text-xs text-slate-500">Hubungan dengan pemilik akun</dt>
                  <dd className="font-medium text-[#17263D]">{student.relationship}</dd>
                </div>
              )}
            </dl>
          </GlassCard>

          {live.length === 0 ? (
            <EmptyState
              title="Peserta ini belum punya pendaftaran kelas yang berjalan."
              hint="Daftarkan lewat akun keluarganya, atau lihat riwayat pendaftaran di tab Jadwal & Enrollment."
            />
          ) : (
            live.map((e) => {
              const slot = slotOfEnrollment(e);
              const q = quotaOf(e);
              const lastInvoice = invoices.find((i) => i.enrollment_id === e.id);
              const lastReport = reports.find((r) => r.enrollment_id === e.id);
              const problem = lastInvoice ? invoiceProblem({ ...lastInvoice, enrollment_id: lastInvoice.enrollment_id }, e.status) : null;
              return (
                <GlassCard key={e.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className={HEADING}>{e.program?.name}</h2>
                    <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <StatTile
                      label="Jadwal aktif"
                      value={slot ? `${dayName(slot.day_of_week)} ${formatClock(slot.start_time)}` : "Belum ada"}
                      hint={slot ? (slot.location ?? undefined) : undefined}
                    />
                    <StatTile label="Pengajar" value={slot ? coachName(slot.pelatih) : "-"} />
                    <StatTile label="Sisa kuota" value={`${q.remaining} sesi`} hint={`dari ${q.bought} sesi lunas`} />
                    <StatTile
                      label="Tagihan terakhir"
                      value={lastInvoice ? INVOICE_LABEL[lastInvoice.status] : "Belum ada"}
                      hint={lastInvoice ? `${lastInvoice.package_name} · ${rupiah(lastInvoice.amount ?? 0)}` : undefined}
                    />
                  </div>
                  <p className="text-sm text-slate-700">
                    Laporan terakhir:{" "}
                    {lastReport ? `${formatDate(lastReport.session_date)} · ${lastReport.attendance ?? "-"}` : "belum ada laporan"}
                  </p>
                  {q.overdrawn > 0 && (
                    <p role="status" className="rounded-xl bg-[#FFF1CC] px-3 py-2 text-sm text-[#7A5400]">
                      Peringatan administrasi: kehadiran ({q.attended}) melebihi kuota lunas ({q.bought}). Data lama tidak diubah.
                    </p>
                  )}
                  {problem && <p className="rounded-xl bg-[#FFE3EA] px-3 py-2 text-sm text-[#A3183C]">{PROBLEM_TEXT[problem]}</p>}

                  {/* quick actions in context */}
                  <div className="flex flex-wrap items-center gap-2">
                    {slot ? (
                      <Link href={`/admin/jadwal/${slot.id}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
                        Pindahkan jadwal
                      </Link>
                    ) : (
                      <Link href={`/admin/pendaftar/kelas/${e.id}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}>
                        Atur jadwal
                      </Link>
                    )}
                    <Link href={`/admin/murid/${id}?tab=tagihan`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${q.remaining <= 2 ? ADMIN_CTA : SECONDARY_BUTTON}`}>
                      Buat tagihan
                    </Link>
                    <Link href={`/admin/murid/${id}?tab=laporan&program=${e.program?.id}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
                      Lihat laporan
                    </Link>
                    <Link href={`/admin/pendaftar/kelas/${e.id}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
                      Detail pendaftaran
                    </Link>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* ---------------- Jadwal & Enrollment ---------------- */}
      {tab === "jadwal" && (
        <div className="flex flex-col gap-4">
          {enrollments.length === 0 ? (
            <EmptyState title="Belum ada pendaftaran kelas." hint="Pendaftaran muncul setelah akun keluarga mendaftar atau admin menambahkan jadwal." />
          ) : (
            enrollments.map((e) => {
              const slot = slotOfEnrollment(e);
              const closed = e.status === "cancelled" || e.status === "rejected";
              return (
                <GlassCard key={e.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className={HEADING}>{e.program?.name}</h2>
                    <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                  </div>
                  <p className="text-sm text-slate-700">
                    {slot
                      ? `${dayName(slot.day_of_week)} · ${formatRange(slot.start_time, slot.duration_minutes ?? 60)} · ${slot.label ?? "Kelas"} · ${slot.location ?? "Lokasi belum diisi"} · ${coachName(slot.pelatih)}`
                      : `Belum terjadwal. Pilihan: ${[e.preferred_schedule, e.preferred_location].filter(Boolean).join(" · ") || "tidak ada"}`}
                  </p>
                  <p className="text-xs text-slate-500">Mendaftar {formatDateTime(e.created_at)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/pendaftar/kelas/${e.id}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}>
                      Kelola pendaftaran
                    </Link>
                    {slot && (
                      <Link href={`/admin/jadwal/${slot.id}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
                        Lihat roster sesi
                      </Link>
                    )}
                    {!closed && (
                      <ToastForm action={setEnrollmentStatusAction} className="flex items-center" pendingLabel="Memproses...">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="to" value="cancelled" />
                        <ImpactConfirm
                          label="Nonaktifkan enrollment"
                          title={`Nonaktifkan ${e.program?.name} untuk ${student.full_name}?`}
                          impacts={[
                            e.slot_id ? "Kursi di slot akan dilepas." : "Tidak ada kursi yang terkunci.",
                            "Laporan, tagihan, dan rekor yang sudah ada tetap tersimpan.",
                            "Pendaftaran ditutup; peserta harus mendaftar ulang untuk ikut lagi.",
                          ]}
                          destructive
                          confirmLabel="Ya, nonaktifkan"
                        />
                      </ToastForm>
                    )}
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* ---------------- Tagihan & Kuota ---------------- */}
      {tab === "tagihan" && (
        <div className="flex flex-col gap-4">
          {live.length === 0 && <EmptyState title="Belum ada pendaftaran kelas yang berjalan." hint="Tagihan dibuat per pendaftaran kelas." />}
          {live.map((e) => {
            const q = quotaOf(e);
            const programPackages = (packages ?? []).filter((p) => p.program_id === e.program?.id);
            return (
              <GlassCard key={e.id} className="flex flex-col gap-3">
                <h2 className={HEADING}>{e.program?.name}</h2>
                <p className="rounded-xl bg-[#DDF3F6] px-3 py-2 text-sm font-medium text-[#0B6470]">{quotaLine(q)}</p>
                {q.overdrawn > 0 && (
                  <p role="status" className="rounded-xl bg-[#FFF1CC] px-3 py-2 text-sm text-[#7A5400]">
                    Peringatan administrasi: kehadiran melebihi kuota lunas sebanyak {q.overdrawn} sesi. Data historis tidak diubah.
                  </p>
                )}
                <ToastForm action={createInvoiceForStudentAction} className="flex flex-wrap items-end gap-2" pendingLabel="Membuat...">
                  <input type="hidden" name="student_id" value={id} />
                  <input type="hidden" name="return" value={back} />
                  <div className="flex min-w-56 flex-col gap-1">
                    <label className="text-xs text-slate-600">Paket {e.program?.name}</label>
                    <GlassSelect name="program_package_id" required defaultValue="" glassChevron>
                      <option value="" disabled>
                        {programPackages.length ? "Pilih paket" : "Belum ada paket aktif"}
                      </option>
                      {programPackages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.sessions_count} sesi · {rupiah(p.price)}
                        </option>
                      ))}
                    </GlassSelect>
                  </div>
                  <GlassButton type="submit" disabled={programPackages.length === 0} className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
                    Buat draft tagihan
                  </GlassButton>
                </ToastForm>
              </GlassCard>
            );
          })}

          <GlassCard className="flex flex-col gap-2">
            <h2 className={HEADING}>Semua tagihan</h2>
            {invoices.length === 0 ? (
              <EmptyState title="Belum ada tagihan." hint="Buat draft tagihan dari kartu program di atas, lalu setujui dan kirim dari halaman Tagihan." />
            ) : (
              invoices.map((inv) => {
                const billing = inv.billing as unknown as { full_name: string | null; email: string } | null;
                const enr = enrollments.find((e) => e.id === inv.enrollment_id);
                const problem = invoiceProblem(inv, enr?.status);
                const overdue = isOverdue(inv, overdueDays);
                return (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/50 bg-white/50 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#17263D]">
                        {inv.package_name} ({inv.sessions_count} sesi) · {rupiah(inv.amount ?? 0)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {inv.invoice_number ?? "Draft"} · {enr?.program?.name ?? "Tanpa pendaftaran"} · Penagih: {billing?.full_name ?? "-"} · {formatDate(inv.created_at)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={INVOICE_TONE[inv.status] ?? "neutral"}>{INVOICE_LABEL[inv.status] ?? inv.status}</Badge>
                        {overdue && <Badge tone="danger">Jatuh tempo</Badge>}
                        {problem && <Badge tone="danger">{PROBLEM_TEXT[problem]}</Badge>}
                        {inv.status !== "paid" && <Badge tone="neutral">Belum menambah kuota</Badge>}
                      </div>
                    </div>
                    {["sent", "processing", "paid"].includes(inv.status) && (
                      <div className="flex flex-wrap items-center gap-2">
                        <CopyButton value={`${origin}/invoice/${inv.id}`} label="Salin link pembayaran" className="px-3 py-1.5 text-xs" />
                        {["sent", "processing"].includes(inv.status) && (
                          <ToastForm action={resendInvoiceAction} pendingLabel="Mengirim...">
                            <input type="hidden" name="invoice_id" value={inv.id} />
                            <input type="hidden" name="return" value={back} />
                            <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-1.5 text-xs`}>
                              Kirim ulang WhatsApp
                            </GlassButton>
                          </ToastForm>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </GlassCard>
        </div>
      )}

      {/* ---------------- Laporan ---------------- */}
      {tab === "laporan" && (
        <div className="flex flex-col gap-3">
          {live.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Link href={`/admin/murid/${id}?tab=laporan`} className={`inline-flex min-h-9 items-center rounded-xl px-3 text-sm font-semibold ${!activeProgramFilter ? "bg-[#0E7C89] text-white" : "border border-white/60 bg-white/60 text-slate-700"}`}>
                Semua program
              </Link>
              {live.map((e) => (
                <Link key={e.id} href={`/admin/murid/${id}?tab=laporan&program=${e.program?.id}`} className={`inline-flex min-h-9 items-center rounded-xl px-3 text-sm font-semibold ${activeProgramFilter === e.program?.id ? "bg-[#0E7C89] text-white" : "border border-white/60 bg-white/60 text-slate-700"}`}>
                  {e.program?.name}
                </Link>
              ))}
            </div>
          )}
          {(() => {
            const shown = reports.filter((r) => !activeProgramFilter || r.program_id === activeProgramFilter);
            if (shown.length === 0) {
              return <EmptyState title="Belum ada laporan." hint="Laporan muncul setelah pengajar mengisi laporan sesi peserta ini." />;
            }
            return shown.map((r) => {
              const enr = enrollments.find((e) => e.id === r.enrollment_id);
              const coach = r.pelatih as unknown as { full_name: string; title: string | null } | null;
              return (
                <GlassCard key={r.id} className="flex flex-col gap-1 !p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#17263D]">{formatDate(r.session_date)}</span>
                    <Badge tone={ATTENDANCE_TONE[r.attendance ?? ""] ?? "neutral"}>{r.attendance ?? "-"}</Badge>
                    <span className="text-xs text-slate-500">
                      {enr?.program?.name ?? "Program"} · {coachName(coach)}
                      {r.session_number ? ` · Sesi ${r.session_number}` : ""}
                    </span>
                  </div>
                  {r.notes && <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-700">{r.notes}</p>}
                  {r.next_focus && <p className="text-xs text-slate-500">Fokus berikutnya: {r.next_focus}</p>}
                </GlassCard>
              );
            });
          })()}
        </div>
      )}

      {/* ---------------- Rekor/Milestone ---------------- */}
      {tab === "rekor" && (
        <RecordsTab
          records={(recordRows ?? []) as (PerformanceRecordRow & { enrollment_id: string | null; program_id: string | null; awards: Record<string, string> | null })[]}
          programs={live.map((e) => e.program).filter((p): p is NonNullable<Enr["program"]> => !!p)}
        />
      )}

      {/* ---------------- Riwayat ---------------- */}
      {tab === "riwayat" && (
        <GlassCard className="flex flex-col divide-y divide-white/50 !p-0">
          {(activityRows ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState title="Belum ada riwayat aktivitas." hint="Perubahan pendaftaran, jadwal, dan tagihan peserta ini akan tercatat beserta siapa yang mengubahnya." />
            </div>
          ) : (
            ((activityRows ?? []) as ActivityRow[]).map((row) => {
              const d = describeActivity(row, lookup);
              return (
                <div key={row.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                  <p className="text-sm font-semibold text-[#17263D]">{d.title}</p>
                  {d.detail.map((line) => (
                    <p key={line} className="text-xs text-slate-600">
                      {line}
                    </p>
                  ))}
                  <p className="text-xs text-slate-500">
                    {row.actor_name ?? "Sistem"} · {formatDateTime(row.created_at)}
                  </p>
                </div>
              );
            })
          )}
        </GlassCard>
      )}
    </div>
  );
}

// Records/milestones: only programs that award medals have them; the others say so.
async function RecordsTab({
  records,
  programs,
}: {
  records: (PerformanceRecordRow & { enrollment_id: string | null; program_id: string | null; awards: Record<string, string> | null })[];
  programs: { id: string; name: string; assessment_type: string; records_mode: string }[];
}) {
  const supabase = await createClient();
  const medalPrograms = programs.filter((p) => p.records_mode === "medals");
  const sets = await Promise.all(medalPrograms.map(async (p) => [p.id, await loadMilestones(supabase, p.id)] as const));
  const milestoneCount = new Map(sets.map(([pid, list]) => [pid, list.filter((m) => m.active).length]));
  const TIER = { gold: "Emas", silver: "Perak", bronze: "Perunggu" } as const;
  const rank = { bronze: 1, silver: 2, gold: 3 } as const;

  if (programs.length === 0) {
    return <EmptyState title="Belum ada program yang berjalan." hint="Rekor mengikuti program yang sedang diikuti peserta." />;
  }
  return (
    <div className="flex flex-col gap-4">
      {programs.map((p) => {
        if (p.records_mode !== "medals") {
          return (
            <GlassCard key={p.id}>
              <h2 className={HEADING}>{p.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {p.records_mode === "personal_goals"
                  ? "Program ini memakai target pribadi peserta, bukan rekor dan medali."
                  : "Program ini tidak memakai rekor atau medali."}
              </p>
            </GlassCard>
          );
        }
        const mine = records.filter((r) => r.program_id === p.id);
        return (
          <GlassCard key={p.id} className="flex flex-col gap-2">
            <h2 className={HEADING}>{p.name}</h2>
            <p className="text-xs text-slate-500">{milestoneCount.get(p.id) ?? 0} milestone aktif pada program ini</p>
            {mine.length === 0 ? (
              <EmptyState title="Belum ada rekor." hint="Rekor dicatat oleh pengajar saat sesi latihan." />
            ) : (
              mine.map((r) => {
                const best = Object.values(r.awards ?? {}).sort((a, b) => (rank[b as keyof typeof rank] ?? 0) - (rank[a as keyof typeof rank] ?? 0))[0];
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/50 bg-white/50 px-4 py-2">
                    <div>
                      <p className="text-sm font-semibold text-[#17263D]">{formatMetricLabel(r)}</p>
                      <p className="text-xs text-slate-500">
                        {formatMetricValue(r)} · {formatDate(r.recorded_at)}
                      </p>
                    </div>
                    {best ? <Badge tone="ok">{TIER[best as keyof typeof TIER] ?? best}</Badge> : <Badge>Belum mencapai medali</Badge>}
                  </div>
                );
              })
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}
