import { GlassCard } from "@/components/ui/glass-card";
import { formatShortDate } from "@/lib/format-date";
import { attendanceLabel } from "@/lib/report-preview";
import { countAttendedSessions } from "@/lib/progress";

type Session = {
  session_date: string;
  session_number: number | null;
  attendance: string | null;
  notes: string | null;
  next_focus: string | null;
};

// Aquanatal "Perjalanan Kelas": a calm timeline of the sessions attended. It
// counts participation, never ability -- no scores, percentages or targets.
export function ClassJourneyCard({ reports }: { reports: Session[] }) {
  const attendedCount = countAttendedSessions(reports);
  const first = [...reports].sort((a, b) => a.session_date.localeCompare(b.session_date))[0];
  const timeline = reports.slice(0, 12);

  return (
    <GlassCard>
      <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Perjalanan Kelas
      </h2>

      {reports.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">
          Perjalanan kelas Anda akan tampil di sini setelah sesi pertama.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-600">
            {attendedCount} sesi diikuti
            {first ? ` sejak ${formatShortDate(first.session_date)}` : ""}. Setiap sesi berjalan sesuai
            kenyamanan Anda.
          </p>
          <ol className="flex flex-col gap-0">
            {timeline.map((r, index) => (
              <li key={r.session_date + index} className="relative flex gap-3 pb-4 last:pb-0">
                <span className="flex flex-col items-center" aria-hidden="true">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#35C5D0] shadow-[0_0_0_3px_rgba(53,197,208,0.18)]" />
                  {index < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-[#35C5D0]/30" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#17263D]">
                    {r.session_number ? `Sesi ${r.session_number} · ` : ""}
                    {formatShortDate(r.session_date)}
                    <span className="ml-2 rounded-full bg-[#EEF9FB] px-2 py-0.5 text-xs font-medium text-[#1597A3]">
                      {attendanceLabel(r.attendance) ?? "-"}
                    </span>
                  </p>
                  {r.notes && <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{r.notes}</p>}
                  {r.next_focus && (
                    <p className="mt-0.5 text-xs text-slate-500">Fokus berikutnya: {r.next_focus}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {reports.length > timeline.length && (
            <p className="mt-3 text-xs text-slate-500">
              Menampilkan {timeline.length} sesi terbaru. Riwayat lengkap ada di tab Catatan Sesi.
            </p>
          )}
        </>
      )}
    </GlassCard>
  );
}
