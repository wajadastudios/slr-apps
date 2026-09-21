import { computeQuota, billingReason, invoiceProblem, isOpenInvoice, paidSessionsOf, type BillingReason, type InvoiceLite, type InvoiceProblem, type Quota } from "./quota";
import { existingConflicts, type SlotContext } from "./schedule-rules";
import { coachName, dayName, formatClock, slotFill } from "./format";

export type QEnrollment = {
  id: string;
  student_id: string;
  program_id: string;
  status: string;
  slot_id: string | null;
  offered_slot_id: string | null;
  preferred_schedule: string | null;
  preferred_location: string | null;
  created_at: string;
  updated_at: string | null;
  followed_up_at: string | null;
  studentName: string;
  programName: string;
};

export type QSchedule = { student_id: string; slot_id: string; created_at: string };
export type QReport = { student_id: string; program_id: string | null; session_date: string; attendance: string | null; enrollment_id: string | null };

// ---------- quota per enrollment ----------
export type EnrollmentBillingInfo = {
  enrollment: QEnrollment;
  quota: Quota;
  reason: BillingReason | null;
  openInvoices: InvoiceLite[];
  paidInvoices: InvoiceLite[];
};

const HAS_CLASS = ["scheduled", "active"];

export function enrollmentBilling(
  enrollments: QEnrollment[],
  invoices: InvoiceLite[],
  reports: QReport[],
  threshold: number
): EnrollmentBillingInfo[] {
  const hadirByEnrollment = new Map<string, number>();
  for (const r of reports) {
    if (r.attendance !== "hadir" || !r.enrollment_id) continue;
    hadirByEnrollment.set(r.enrollment_id, (hadirByEnrollment.get(r.enrollment_id) ?? 0) + 1);
  }
  const byEnrollment = new Map<string, InvoiceLite[]>();
  for (const i of invoices) {
    if (!i.enrollment_id) continue;
    const list = byEnrollment.get(i.enrollment_id) ?? [];
    list.push(i);
    byEnrollment.set(i.enrollment_id, list);
  }
  return enrollments.map((e) => {
    const mine = byEnrollment.get(e.id) ?? [];
    const quota = computeQuota(paidSessionsOf(mine), hadirByEnrollment.get(e.id) ?? 0);
    const open = mine.filter((i) => isOpenInvoice(i.status));
    // only a class that has started needs a bill
    const reason = HAS_CLASS.includes(e.status) ? billingReason(quota, threshold, open.length > 0) : null;
    return { enrollment: e, quota, reason, openInvoices: open, paidInvoices: mine.filter((i) => i.status === "paid") };
  });
}

// ---------- reports that were never written ----------
export type MissingReport = {
  student_id: string;
  studentName: string;
  pelatih_id: string;
  programName: string;
  slotLabel: string;
  date: string; // yyyy-mm-dd
};

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Sessions that already took place (in the last `days` days, after the
// participant joined the slot) and have no report for that participant and
// program. `todayISO` is the Jakarta calendar date; a session of today only
// counts once its start time has passed.
export function missingReports(
  schedules: QSchedule[],
  slots: Map<string, SlotContext & { program_id: string }>,
  enrollments: QEnrollment[],
  reports: QReport[],
  names: Map<string, string>,
  todayISO: string,
  nowMinutes: number,
  days = 14
): MissingReport[] {
  const reported = new Set(reports.map((r) => `${r.student_id}|${r.program_id ?? ""}|${r.session_date}`));
  const running = new Set(
    enrollments.filter((e) => HAS_CLASS.includes(e.status)).map((e) => `${e.student_id}|${e.program_id}`)
  );
  const today = new Date(`${todayISO}T00:00:00Z`);
  const out: MissingReport[] = [];

  for (const sc of schedules) {
    const slot = slots.get(sc.slot_id);
    if (!slot || !running.has(`${sc.student_id}|${slot.program_id}`)) continue;
    const joined = sc.created_at.slice(0, 10);
    for (let back = 0; back < days; back++) {
      const d = new Date(today.getTime() - back * 86_400_000);
      if (d.getUTCDay() !== slot.day_of_week) continue;
      const date = isoDate(d);
      if (date < joined) continue;
      if (back === 0 && nowMinutes < Number(slot.start_time.slice(0, 2)) * 60 + Number(slot.start_time.slice(3, 5)) + slot.duration_minutes) continue;
      if (reported.has(`${sc.student_id}|${slot.program_id}|${date}`)) continue;
      out.push({
        student_id: sc.student_id,
        studentName: names.get(sc.student_id) ?? "Peserta",
        pelatih_id: slot.pelatih_id,
        programName: slot.programName,
        slotLabel: `${dayName(slot.day_of_week)} ${formatClock(slot.start_time)}`,
        date,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- the action queue ----------
export type QueueItem = { label: string; meta?: string; href: string };

export type QueueCard = {
  key: string;
  urgency: number; // lower = more urgent
  tone: "danger" | "warn" | "info";
  title: string;
  description: string;
  count: number;
  cta: string;
  href: string;
  items: QueueItem[];
};

export type QueueInput = {
  enrollments: QEnrollment[];
  invoices: InvoiceLite[];
  reports: QReport[];
  slots: SlotContext[];
  filledBySlot: Map<string, number>;
  missing: MissingReport[];
  threshold: number;
  pelatihNames: Map<string, string>;
};

const MAX_ITEMS = 3;
const enrollmentHref = (id: string) => `/admin/pendaftar/kelas/${id}`;

export function buildQueue(input: QueueInput): QueueCard[] {
  const cards: QueueCard[] = [];
  const add = (c: Omit<QueueCard, "items"> & { items: QueueItem[] }) => {
    if (c.count > 0) cards.push({ ...c, items: c.items.slice(0, MAX_ITEMS) });
  };

  const byStatus = (s: string) => input.enrollments.filter((e) => e.status === s);
  const oldestFirst = <T extends { created_at: string }>(list: T[]) => [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const asItem = (e: QEnrollment): QueueItem => ({
    label: `${e.studentName} · ${e.programName}`,
    meta: [e.preferred_schedule, e.preferred_location].filter(Boolean).join(" · ") || undefined,
    href: enrollmentHref(e.id),
  });

  const review = oldestFirst(byStatus("pending_review"));
  add({
    key: "tinjau",
    urgency: 1,
    tone: "danger",
    title: "Pendaftar baru perlu ditinjau",
    description: "Cek data peserta, lalu tawarkan jadwal atau pindahkan ke daftar tunggu. Jangan tolak hanya karena slot belum ada.",
    count: review.length,
    cta: "Tinjau pendaftar",
    href: "/admin/pendaftar?tab=tinjau",
    items: review.map(asItem),
  });

  // paid but no sessions / not linked
  const billing = enrollmentBilling(input.enrollments, input.invoices, input.reports, input.threshold);
  const enrollmentById = new Map(input.enrollments.map((e) => [e.id, e]));
  const problems = input.invoices
    .map((inv) => ({ inv, problem: invoiceProblem(inv, inv.enrollment_id ? enrollmentById.get(inv.enrollment_id)?.status : null) }))
    .filter((x): x is { inv: InvoiceLite; problem: InvoiceProblem } => x.problem !== null);
  add({
    key: "bermasalah",
    urgency: 2,
    tone: "danger",
    title: "Pembayaran lunas tetapi kuota belum bertambah",
    description: "Tagihan sudah lunas namun tidak menambah sesi peserta. Periksa jumlah sesi atau hubungkan ke pendaftaran kelas.",
    count: problems.length,
    cta: "Periksa pembayaran",
    href: "/admin/tagihan?tab=bermasalah",
    items: problems.map(({ inv }) => ({
      label: inv.package_name ?? "Tagihan",
      meta: enrollmentById.get(inv.enrollment_id ?? "")?.studentName,
      href: "/admin/tagihan?tab=bermasalah",
    })),
  });

  const offered = oldestFirst(byStatus("schedule_offered"));
  add({
    key: "ditawarkan",
    urgency: 3,
    tone: "warn",
    title: "Jadwal ditawarkan, belum dikonfirmasi",
    description: "Peserta belum menjawab penawaran jadwal. Hubungi peserta atau tawarkan slot lain sebelum penawaran kedaluwarsa.",
    count: offered.length,
    cta: "Lihat penawaran",
    href: "/admin/pendaftar?tab=ditawarkan",
    items: offered.map(asItem),
  });

  const waiting = oldestFirst(byStatus("waiting_schedule"));
  add({
    key: "menunggu",
    urgency: 4,
    tone: "warn",
    title: "Pendaftar menunggu slot / jadwal",
    description: "Data sudah valid, tinggal mencarikan slot yang cocok. Filter menurut program, hari, dan lokasi.",
    count: waiting.length,
    cta: "Atur jadwal",
    href: "/admin/pendaftar?tab=menunggu",
    items: waiting.map(asItem),
  });

  const conflicts = existingConflicts(input.slots);
  add({
    key: "konflik",
    urgency: 5,
    tone: "danger",
    title: "Konflik jadwal pengajar atau kolam",
    description: "Ada slot yang bertabrakan pada hari dan jam yang sama. Perbaiki agar tidak terjadi dua kelas di satu tempat.",
    count: conflicts.length,
    cta: "Lihat konflik",
    href: "/admin/jadwal?filter=konflik",
    items: conflicts.map((c) => ({
      label: `${c.kind === "pelatih" ? coachName({ full_name: c.a.pelatihName }) : (c.a.location ?? "Kolam")} · ${dayName(c.a.day_of_week)} ${formatClock(c.a.start_time)}`,
      meta: `${c.a.programName} bertabrakan dengan ${c.b.programName}`,
      href: `/admin/jadwal/${c.a.id}`,
    })),
  });

  const noPackage = billing.filter((b) => b.reason === "no_package" && b.enrollment.status === "active");
  add({
    key: "belum-lunas",
    urgency: 6,
    tone: "warn",
    title: "Peserta aktif belum punya paket lunas",
    description: "Peserta sudah mengikuti kelas tetapi belum ada paket yang lunas. Buat tagihan agar kuota tercatat.",
    count: noPackage.length,
    cta: "Buat tagihan",
    href: "/admin/tagihan?tab=perlu-ditagih&alasan=belum-lunas",
    items: noPackage.map((b) => ({ label: `${b.enrollment.studentName} · ${b.enrollment.programName}`, meta: "Belum ada paket lunas", href: `/admin/murid/${b.enrollment.student_id}?tab=tagihan` })),
  });

  const lowQuota = billing.filter((b) => b.reason === "low_quota");
  add({
    key: "kuota-menipis",
    urgency: 7,
    tone: "warn",
    title: `Kuota hampir habis (sisa ${input.threshold} sesi atau kurang)`,
    description: "Buat tagihan berikutnya sebelum kuota habis supaya kelas tidak terputus.",
    count: lowQuota.length,
    cta: "Buat tagihan",
    href: "/admin/tagihan?tab=perlu-ditagih&alasan=kuota-menipis",
    items: lowQuota
      .sort((a, b) => a.quota.remaining - b.quota.remaining)
      .map((b) => ({ label: `${b.enrollment.studentName} · ${b.enrollment.programName}`, meta: `Sisa ${b.quota.remaining} sesi`, href: `/admin/murid/${b.enrollment.student_id}?tab=tagihan` })),
  });

  const missingPeople = new Set(input.missing.map((m) => `${m.student_id}|${m.date}`));
  add({
    key: "laporan",
    urgency: 8,
    tone: "info",
    title: "Laporan pengajar belum diisi",
    description: "Sesi dalam 14 hari terakhir yang belum punya laporan. Kirim pengingat ke pengajar terkait.",
    count: missingPeople.size,
    cta: "Lihat laporan",
    href: "/admin/laporan/pengingat",
    items: input.missing.map((m) => ({
      label: `${m.studentName} · ${m.programName}`,
      meta: `${input.pelatihNames.get(m.pelatih_id) ?? "Pengajar"} · ${m.slotLabel}`,
      href: "/admin/laporan/pengingat",
    })),
  });

  const near = input.slots
    .map((s) => ({ s, filled: input.filledBySlot.get(s.id) ?? 0 }))
    .filter((x) => slotFill(x.filled, x.s.capacity) === "hampir_penuh");
  add({
    key: "slot-penuh",
    urgency: 9,
    tone: "info",
    title: "Slot mendekati penuh",
    description: "Sisa satu kursi atau kurang. Siapkan slot tambahan bila masih ada pendaftar menunggu.",
    count: near.length,
    cta: "Lihat slot",
    href: "/admin/jadwal?filter=hampir_penuh",
    items: near.map((x) => ({
      label: `${x.s.programName} · ${dayName(x.s.day_of_week)} ${formatClock(x.s.start_time)}`,
      meta: `${x.filled}/${x.s.capacity} peserta`,
      href: `/admin/jadwal/${x.s.id}`,
    })),
  });

  return cards.sort((a, b) => a.urgency - b.urgency);
}
