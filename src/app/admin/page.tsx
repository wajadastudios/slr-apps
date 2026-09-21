import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge, EmptyState, PageHeader, StatTile, type Tone } from "@/components/admin/ui";
import { ADMIN_CTA } from "@/lib/ui-classes";
import { loadAdminData } from "@/lib/admin/load";
import { buildQueue, missingReports, type QueueCard } from "@/lib/admin/queue";
import { describeActivity, type ActivityRow } from "@/lib/admin/activity";
import { dayName, formatClock, formatDateTime } from "@/lib/admin/format";
import { jakartaToday, toISODate } from "@/lib/week";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const TONE: Record<QueueCard["tone"], Tone> = { danger: "danger", warn: "warn", info: "info" };
const TONE_LABEL: Record<QueueCard["tone"], string> = { danger: "Mendesak", warn: "Segera", info: "Pantau" };

// Monday-start week for the "laporan minggu ini" tile (Jakarta calendar date).
function startOfWeekISO(): string {
  const d = new Date(jakartaToday());
  const diff = (d.getDay() === 0 ? -6 : 1) - d.getDay();
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return toISODate(d);
}

function ActionCard({ card }: { card: QueueCard }) {
  return (
    <GlassCard className="flex flex-col gap-3 !bg-white/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={TONE[card.tone]}>{TONE_LABEL[card.tone]}</Badge>
          </div>
          <h3 className="font-[family-name:var(--font-quicksand)] text-base font-bold leading-snug text-[#17263D]">
            {card.title}
          </h3>
        </div>
        <span
          className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-[#17263D] px-2 font-[family-name:var(--font-quicksand)] text-xl font-bold text-white"
          aria-label={`${card.count} item`}
        >
          {card.count}
        </span>
      </div>

      <p className="text-sm text-slate-600">{card.description}</p>

      <ul className="flex flex-col gap-1.5">
        {card.items.map((item, i) => (
          <li key={`${item.href}-${i}`}>
            <Link
              href={item.href}
              className="flex min-h-11 flex-col justify-center rounded-xl border border-white/70 bg-white/70 px-3 py-1.5 transition-colors hover:bg-[#0E7C89]/10"
            >
              <span className="truncate text-sm font-semibold text-[#17263D]">{item.label}</span>
              {item.meta && <span className="truncate text-xs text-slate-500">{item.meta}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-3">
        <Link
          href={card.href}
          className={`inline-flex min-h-11 items-center rounded-2xl border px-5 text-sm font-semibold ${ADMIN_CTA}`}
        >
          {card.cta}
        </Link>
        {card.count > card.items.length && (
          <Link href={card.href} className="text-sm font-semibold text-[#0B6470] underline-offset-4 hover:underline">
            Lihat semua ({card.count})
          </Link>
        )}
      </div>
    </GlassCard>
  );
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const data = await loadAdminData(supabase);

  const [{ data: pendingTrials }, { data: activityRows }, { count: pelatihCount }, { count: programCount }] =
    await Promise.all([
      supabase.from("registrations").select("id, child_name, parent_name, created_at").eq("status", "pending").order("created_at"),
      supabase
        .from("activity_log")
        .select("id, created_at, actor_name, entity_type, action, changes, note")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "pelatih").eq("active", true),
      supabase.from("programs").select("id", { count: "exact", head: true }).eq("active", true),
    ]);

  const slotMap = new Map(data.slots.map((s) => [s.id, s]));
  const missing = missingReports(
    data.schedules,
    slotMap,
    data.enrollments,
    data.reports,
    data.studentNames,
    data.todayISO,
    data.nowMinutes
  );

  const cards = buildQueue({
    enrollments: data.enrollments,
    invoices: data.invoices,
    reports: data.reports,
    slots: data.slots,
    filledBySlot: data.filledBySlot,
    missing,
    threshold: data.threshold,
    pelatihNames: data.pelatihNames,
  });

  // old-style trial registrations belong to the same first step: review
  const trials = pendingTrials ?? [];
  if (trials.length > 0) {
    cards.unshift({
      key: "trial",
      urgency: 0,
      tone: "danger",
      title: "Pendaftar trial menunggu persetujuan",
      description: "Pendaftar kelas trial dari halaman depan yang belum disetujui atau ditolak.",
      count: trials.length,
      cta: "Tinjau pendaftar",
      href: "/admin/pendaftar?tab=trial",
      items: trials.slice(0, 3).map((t) => ({
        label: t.child_name,
        meta: `Orang tua: ${t.parent_name}`,
        href: "/admin/pendaftar?tab=trial",
      })),
    });
  }

  const weekStart = startOfWeekISO();
  const reportsThisWeek = data.reports.filter((r) => r.session_date >= weekStart).length;
  const running = data.enrollments.filter((e) => e.status === "active" || e.status === "scheduled").length;
  const pipeline = data.enrollments.filter((e) =>
    ["pending_review", "waiting_schedule", "schedule_offered"].includes(e.status)
  ).length;
  const unpaid = data.invoices.filter((i) => i.status === "sent" || i.status === "processing").length;

  const activity = (activityRows ?? []) as ActivityRow[];
  const slotLabel = (id: string) => {
    const s = data.slotById.get(id);
    return s ? `${s.programName} · ${dayName(s.day_of_week)} ${formatClock(s.start_time)}` : undefined;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pusat Tindakan"
        subtitle="Yang perlu dikerjakan hari ini, dari yang paling mendesak."
      />

      <section aria-labelledby="perlu-ditindaklanjuti" className="flex flex-col gap-3">
        <h2 id="perlu-ditindaklanjuti" className={HEADING}>
          Perlu Ditindaklanjuti
        </h2>
        {cards.length === 0 ? (
          <EmptyState
            title="Semua beres. Tidak ada antrean tindakan."
            hint="Pendaftar baru, tagihan, laporan, dan jadwal yang perlu perhatian akan muncul di sini."
            action={
              <Link
                href="/admin/pendaftar"
                className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}
              >
                Buka daftar pendaftar
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {cards.map((card) => (
              <ActionCard key={card.key} card={card} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="ringkasan" className="flex flex-col gap-2">
        <h2 id="ringkasan" className="text-sm font-semibold text-slate-600">
          Ringkasan
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Kelas berjalan" value={running} hint="terjadwal + aktif" />
          <StatTile label="Dalam pipeline" value={pipeline} hint="belum terjadwal" />
          <StatTile label="Menunggu bayar" value={unpaid} hint="tagihan terkirim" />
          <StatTile label="Laporan minggu ini" value={reportsThisWeek} />
          <StatTile label="Pengajar aktif" value={pelatihCount ?? 0} />
          <StatTile label="Program aktif" value={programCount ?? 0} />
        </div>
      </section>

      <section aria-labelledby="aktivitas" className="flex flex-col gap-2">
        <h2 id="aktivitas" className={HEADING}>
          Aktivitas Terbaru
        </h2>
        {activity.length === 0 ? (
          <EmptyState
            title="Belum ada aktivitas tercatat."
            hint="Perubahan pendaftaran, jadwal, tagihan, dan program akan tercatat di sini beserta siapa yang mengubahnya."
          />
        ) : (
          <GlassCard className="flex flex-col divide-y divide-white/50 !p-0">
            {activity.map((row) => {
              const d = describeActivity(row, (kind, id) =>
                kind === "slot" ? slotLabel(id) : data.pelatihNames.get(id)
              );
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
            })}
          </GlassCard>
        )}
      </section>
    </div>
  );
}
