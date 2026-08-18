import { GlassCard } from "@/components/ui/glass-card";
import { StarRating } from "@/components/ui/star-rating";

const ATTENDANCE_LABEL: Record<string, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
};

const ATTENDANCE_COLOR: Record<string, string> = {
  hadir: "bg-[#55D6A6]/20 text-[#1a8f6f]",
  izin: "bg-[#FFC800]/20 text-[#8a6900]",
  sakit: "bg-red-500/20 text-red-700",
};

export type ReportRow = {
  id: string;
  session_date: string;
  session_number: number | null;
  attendance: string | null;
  scores: unknown;
  notes: string | null;
  next_focus: string | null;
  media_urls: string[] | null;
  substitute_for?: string | null;
};

export function ReportHistoryCard({ reports }: { reports: ReportRow[] }) {
  return (
    <GlassCard>
      <h2 className="mb-4 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Riwayat Laporan
      </h2>
      <div className="flex flex-col gap-3">
        {reports.length === 0 && (
          <p className="text-sm text-slate-600">Belum ada laporan.</p>
        )}
        {reports.map((r) => {
          const scores = (r.scores as Record<string, number>) ?? {};
          const skillNames = Object.keys(scores);
          return (
            <div
              key={r.id}
              className="rounded-xl border border-white/30 bg-white/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-[#17263D]">
                  Sesi {r.session_number ?? "-"} &mdash; {r.session_date}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ATTENDANCE_COLOR[r.attendance ?? ""] ??
                    "bg-slate-200 text-slate-700"
                  }`}
                >
                  {ATTENDANCE_LABEL[r.attendance ?? ""] ?? r.attendance}
                </span>
              </div>
              {r.substitute_for && (
                <div className="mt-1">
                  <span className="rounded-full bg-[#FFC800]/20 px-2.5 py-0.5 text-xs font-medium text-[#8a6900]">
                    Diajar pengajar pengganti (menggantikan {r.substitute_for})
                  </span>
                </div>
              )}
              {skillNames.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {skillNames.map((skill) => (
                    <div
                      key={skill}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-slate-700">{skill}</span>
                      <StarRating value={scores[skill]} size={14} />
                    </div>
                  ))}
                </div>
              )}
              {r.notes && (
                <p className="mt-2 text-sm text-slate-700">{r.notes}</p>
              )}
              {r.next_focus && (
                <p className="mt-1 text-sm italic text-slate-600">
                  Fokus berikutnya: {r.next_focus}
                </p>
              )}
              {r.media_urls && r.media_urls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.media_urls.map((url: string) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#35C5D0] underline"
                    >
                      Lampiran
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
