import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, EmptyState, FIELD_CLASS, FilterBar, PageHeader, TabLinks, type Tone } from "@/components/admin/ui";
import { SelectAll } from "@/components/admin/select-all";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { STATUS_LABEL, type EnrollmentStatus } from "@/lib/enrollment";
import { selectAll } from "@/lib/admin/load";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { DAYS } from "@/lib/days";
import { bulkPipelineAction } from "./kelas/actions";
import { TrialSection, type TrialRegistration } from "./trial-section";

// The pipeline, one status per tab. Terminal states live in "Riwayat".
const TABS: { key: string; label: string; statuses: EnrollmentStatus[]; empty: string; hint: string }[] = [
  { key: "tinjau", label: "Perlu ditinjau", statuses: ["pending_review"], empty: "Tidak ada pendaftar yang perlu ditinjau.", hint: "Pendaftar baru dari akun orang tua atau peserta dewasa akan muncul di sini." },
  { key: "menunggu", label: "Menunggu jadwal", statuses: ["waiting_schedule"], empty: "Tidak ada pendaftar yang menunggu slot.", hint: "Pendaftar valid yang belum mendapat slot dipindahkan ke sini dari tab Perlu ditinjau." },
  { key: "ditawarkan", label: "Jadwal ditawarkan", statuses: ["schedule_offered"], empty: "Tidak ada jadwal yang menunggu jawaban peserta.", hint: "Tawarkan slot dari halaman pendaftar; peserta menyetujuinya lewat WhatsApp atau akunnya." },
  { key: "terjadwal", label: "Terjadwal", statuses: ["scheduled"], empty: "Belum ada pendaftar terjadwal.", hint: "Peserta yang menyetujui jadwal tampil di sini sampai kelasnya diaktifkan." },
  { key: "aktif", label: "Aktif", statuses: ["active"], empty: "Belum ada peserta aktif.", hint: "Kelas menjadi aktif setelah terjadwal dan paket dibayar." },
  { key: "riwayat", label: "Riwayat", statuses: ["cancelled", "rejected"], empty: "Belum ada riwayat.", hint: "Pendaftaran yang dibatalkan atau ditolak tersimpan di sini." },
];

const TONE: Record<EnrollmentStatus, Tone> = {
  pending_review: "warn",
  waiting_schedule: "info",
  schedule_offered: "info",
  scheduled: "ok",
  active: "ok",
  cancelled: "neutral",
  rejected: "danger",
};

const NEXT_ACTION: Record<EnrollmentStatus, string> = {
  pending_review: "Tinjau",
  waiting_schedule: "Atur jadwal",
  schedule_offered: "Lihat penawaran",
  scheduled: "Aktifkan kelas",
  active: "Lihat peserta",
  cancelled: "Lihat",
  rejected: "Lihat",
};

const PERIODS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };
const TIMES: Record<string, string[]> = { pagi: ["pagi"], siang: ["siang"], sore: ["sore", "malam"] };
const PAGE = 30;

// the earliest registration time still inside the chosen period
function periodCutoff(period: string | undefined): number | null {
  const days = PERIODS[period ?? ""];
  return days ? Date.now() - days * 86_400_000 : null;
}

type Row = {
  id: string;
  status: EnrollmentStatus;
  preferred_schedule: string | null;
  preferred_location: string | null;
  created_at: string;
  followed_up_at: string | null;
  billing_contact_user_id: string | null;
  student: { id: string; full_name: string; phone: string | null; parent_id: string } | null;
  program: { id: string; name: string } | null;
};

type Params = {
  tab?: string;
  q?: string;
  program?: string;
  periode?: string;
  fu?: string;
  hari?: string;
  lokasi?: string;
  waktu?: string;
  limit?: string;
  error?: string;
};

function paymentBadge(invoices: { status: string }[]): { label: string; tone: Tone } {
  if (invoices.some((i) => i.status === "paid")) return { label: "Lunas", tone: "ok" };
  if (invoices.some((i) => i.status === "sent" || i.status === "processing")) return { label: "Menunggu pembayaran", tone: "warn" };
  if (invoices.some((i) => i.status === "draft" || i.status === "approved")) return { label: "Draft tagihan", tone: "neutral" };
  return { label: "Belum ada tagihan", tone: "neutral" };
}

export default async function PendaftarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const tab = sp.tab === "trial" || TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "tinjau";
  const supabase = await createClient();

  const [rows, invoices, { data: accounts }, { data: programs }, { data: registrations }, { data: pelatihList }] =
    await Promise.all([
      selectAll<Row>(
        supabase,
        "enrollments",
        "id, status, preferred_schedule, preferred_location, created_at, followed_up_at, billing_contact_user_id, student:student_id(id, full_name, phone, parent_id), program:program_id(id, name)"
      ),
      selectAll<{ enrollment_id: string | null; status: string }>(supabase, "invoices", "enrollment_id, status"),
      supabase.from("users").select("id, full_name, phone").eq("role", "ortu"),
      supabase.from("programs").select("id, name").order("name"),
      supabase
        .from("registrations")
        .select(
          "id, child_name, parent_name, parent_email, parent_phone, preferred_schedule, status, trial_fee_status, payment_method, trial_pelatih_id, trial_session_date, trial_session_time, trial_location, payment_token, trial_proof_url, created_at, program:program_id(name)"
        )
        .order("created_at", { ascending: false }),
      supabase.from("users").select("id, full_name, title").eq("role", "pelatih").eq("active", true).order("full_name"),
    ]);

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const invoicesByEnrollment = new Map<string, { status: string }[]>();
  for (const i of invoices) {
    if (!i.enrollment_id) continue;
    const list = invoicesByEnrollment.get(i.enrollment_id) ?? [];
    list.push(i);
    invoicesByEnrollment.set(i.enrollment_id, list);
  }

  const trialPending = (registrations ?? []).filter((r) => r.status === "pending").length;
  const countFor = (statuses: EnrollmentStatus[]) => rows.filter((r) => statuses.includes(r.status)).length;
  const tabs = [
    ...TABS.map((t) => ({ key: t.key, label: t.label, count: countFor(t.statuses), href: `/admin/pendaftar?tab=${t.key}` })),
    { key: "trial", label: "Trial", count: trialPending, href: "/admin/pendaftar?tab=trial" },
  ];

  const header = (
    <PageHeader
      title="Pendaftar"
      subtitle="Pipeline pendaftaran: tinjau, cari slot, tawarkan jadwal, lalu aktifkan."
    />
  );

  if (tab === "trial") {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <TabLinks tabs={tabs} active={tab} label="Tahap pendaftaran" />
        <TrialSection
          registrations={(registrations ?? []) as unknown as TrialRegistration[]}
          pelatihList={pelatihList ?? []}
          origin={await getSiteOrigin()}
          error={sp.error}
        />
      </div>
    );
  }

  const def = TABS.find((t) => t.key === tab)!;
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);
  const q = (sp.q ?? "").trim().toLowerCase();
  const cutoff = periodCutoff(sp.periode);
  const includes = (text: string | null, needle: string) => (text ?? "").toLowerCase().includes(needle.toLowerCase());

  const filtered = rows
    .filter((r) => def.statuses.includes(r.status))
    .filter((r) => !sp.program || r.program?.id === sp.program)
    .filter((r) => cutoff === null || new Date(r.created_at).getTime() >= cutoff)
    .filter((r) => (sp.fu === "belum" ? !r.followed_up_at : sp.fu === "sudah" ? !!r.followed_up_at : true))
    .filter((r) => !sp.hari || includes(r.preferred_schedule, sp.hari))
    .filter((r) => !sp.lokasi || includes(r.preferred_location, sp.lokasi) || includes(r.preferred_schedule, sp.lokasi))
    .filter((r) => !sp.waktu || (TIMES[sp.waktu] ?? []).some((w) => includes(r.preferred_schedule, w)))
    .filter((r) => {
      if (!q) return true;
      const account = accountById.get(r.billing_contact_user_id ?? r.student?.parent_id ?? "");
      return [r.student?.full_name, r.student?.phone, account?.full_name, account?.phone, r.program?.name].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      );
    })
    // oldest first: whoever has waited longest is on top
    .sort((a, b) => (tab === "riwayat" || tab === "aktif" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));

  const shown = filtered.slice(0, limit);
  const showSlotFilters = tab === "tinjau" || tab === "menunggu";
  const bulk = tab === "tinjau" || tab === "menunggu" || tab === "ditawarkan";
  const keep = new URLSearchParams(Object.entries({ tab, q: sp.q, program: sp.program, periode: sp.periode, fu: sp.fu, hari: sp.hari, lokasi: sp.lokasi, waktu: sp.waktu }).filter(([, v]) => v) as [string, string][]);
  const returnTo = `/admin/pendaftar?${keep.toString()}`;
  const filtersActive = !!(q || sp.program || sp.periode || sp.fu || sp.hari || sp.lokasi || sp.waktu);

  const list = (
    <div className="flex flex-col gap-2">
      {shown.map((r) => {
        const account = accountById.get(r.billing_contact_user_id ?? r.student?.parent_id ?? "");
        const phone = r.student?.phone || account?.phone || null;
        const digits = phone?.replace(/[^0-9]/g, "") ?? "";
        const pay = paymentBadge(invoicesByEnrollment.get(r.id) ?? []);
        const preference = [r.preferred_schedule, r.preferred_location].filter(Boolean).join(" · ");
        return (
          <div
            key={r.id}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto]"
          >
            {bulk ? (
              <input type="checkbox" name="ids" value={r.id} aria-label={`Pilih ${r.student?.full_name}`} className="mt-1 h-4 w-4" />
            ) : (
              <span />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-[#17263D]">{r.student?.full_name ?? "Peserta"}</span>
                <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                <Badge tone={pay.tone}>{pay.label}</Badge>
                {r.followed_up_at && <Badge tone="info">Sudah di-follow-up {formatDate(r.followed_up_at)}</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate-700">
                {r.program?.name ?? "Program"} · {preference || "Tanpa pilihan jadwal"}
              </p>
              <p className="text-xs text-slate-500">
                Akun penagih: {account?.full_name ?? "-"} · Mendaftar {formatDateTime(r.created_at)}
              </p>
              {phone && (
                <p className="text-xs text-slate-600">
                  WhatsApp: {phone}
                  {digits && (
                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 font-semibold text-[#0B6470] hover:underline"
                    >
                      Buka chat
                    </a>
                  )}
                </p>
              )}
            </div>
            <Link
              href={`/admin/pendaftar/kelas/${r.id}`}
              className={`col-span-2 inline-flex min-h-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold md:col-span-1 ${ADMIN_CTA}`}
            >
              {NEXT_ACTION[r.status]}
            </Link>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {header}
      <TabLinks tabs={tabs} active={tab} label="Tahap pendaftaran" />

      {sp.error && (
        <p role="alert" className="text-sm text-red-700">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      <FilterBar action="/admin/pendaftar">
        <input type="hidden" name="tab" value={tab} />
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
          Cari
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Nama, WhatsApp, atau akun" className={FIELD_CLASS} />
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
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Periode daftar
          <select name="periode" defaultValue={sp.periode ?? ""} className={FIELD_CLASS}>
            <option value="">Semua waktu</option>
            <option value="7">7 hari terakhir</option>
            <option value="30">30 hari terakhir</option>
            <option value="90">90 hari terakhir</option>
          </select>
        </label>
        {bulk && (
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Follow-up
            <select name="fu" defaultValue={sp.fu ?? ""} className={FIELD_CLASS}>
              <option value="">Semua</option>
              <option value="belum">Belum di-follow-up</option>
              <option value="sudah">Sudah di-follow-up</option>
            </select>
          </label>
        )}
        {showSlotFilters && (
          <>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Hari diminati
              <select name="hari" defaultValue={sp.hari ?? ""} className={FIELD_CLASS}>
                <option value="">Semua hari</option>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={DAYS[d]}>
                    {DAYS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Waktu
              <select name="waktu" defaultValue={sp.waktu ?? ""} className={FIELD_CLASS}>
                <option value="">Semua waktu</option>
                <option value="pagi">Pagi</option>
                <option value="siang">Siang</option>
                <option value="sore">Sore / malam</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Lokasi
              <input name="lokasi" defaultValue={sp.lokasi ?? ""} placeholder="Nama kolam" className={FIELD_CLASS} />
            </label>
          </>
        )}
        <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
          Terapkan
        </GlassButton>
        {filtersActive && (
          <Link href={`/admin/pendaftar?tab=${tab}`} className="min-h-10 self-center text-sm font-semibold text-[#0B6470] hover:underline">
            Reset
          </Link>
        )}
      </FilterBar>

      {shown.length === 0 ? (
        <EmptyState
          title={filtersActive ? "Tidak ada pendaftar yang cocok dengan filter." : def.empty}
          hint={filtersActive ? "Ubah atau reset filter untuk melihat lebih banyak." : def.hint}
          action={
            filtersActive ? (
              <Link href={`/admin/pendaftar?tab=${tab}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
                Reset filter
              </Link>
            ) : undefined
          }
        />
      ) : bulk ? (
        <GlassCard className="flex flex-col gap-3">
          <ToastForm action={bulkPipelineAction} className="flex flex-col gap-3">
            <input type="hidden" name="return" value={returnTo} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SelectAll name="ids" />
              <div className="flex flex-wrap items-center gap-2">
                <GlassButton type="submit" name="intent" value="followup" className={`${SECONDARY_BUTTON} px-4 py-2 text-sm`}>
                  Tandai sudah di-follow-up
                </GlassButton>
                {tab === "tinjau" && (
                  <GlassButton type="submit" name="intent" value="waiting" className={`${SECONDARY_BUTTON} px-4 py-2 text-sm`}>
                    Pindahkan ke Menunggu Jadwal
                  </GlassButton>
                )}
              </div>
            </div>
            {list}
          </ToastForm>
        </GlassCard>
      ) : (
        list
      )}

      {filtered.length > shown.length && (
        <Link
          href={`/admin/pendaftar?${new URLSearchParams({ ...Object.fromEntries(keep), limit: String(limit + PAGE) }).toString()}`}
          className={`inline-flex min-h-11 w-fit items-center rounded-2xl border px-5 text-sm font-semibold ${SECONDARY_BUTTON}`}
        >
          Tampilkan lebih banyak ({filtered.length - shown.length} lagi)
        </Link>
      )}
    </div>
  );
}
