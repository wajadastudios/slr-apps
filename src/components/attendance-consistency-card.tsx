import { GlassCard } from "@/components/ui/glass-card";

type Report = {
  session_date: string;
  session_number: number | null;
  attendance: string | null;
};

const STATUS: Record<string, { label: string; dot: string }> = {
  hadir: { label: "Hadir", dot: "bg-[#35C5D0]" },
  izin: { label: "Izin", dot: "bg-[#FFC800]" },
  sakit: { label: "Sakit", dot: "bg-[#FF8A65]" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Consistency is derived purely from attendance, kept separate from skill
// scores: missing a session delays progress but doesn't make the child
// less capable, so it shouldn't drag the skill lines down.
export function AttendanceConsistencyCard({ reports }: { reports: Report[] }) {
  if (reports.length === 0) return null;

  const chronological = [...reports].sort(
    (a, b) =>
      new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
  );
  const total = chronological.length;
  const count = (status: string) =>
    chronological.filter((r) => r.attendance === status).length;
  const hadir = count("hadir");
  const izin = count("izin");
  const sakit = count("sakit");
  const percent = Math.round((hadir / total) * 100);

  return (
    <GlassCard>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            Konsistensi Latihan
          </h2>
          <p className="text-sm text-slate-600">
            Hadir {hadir} dari {total} sesi
            {izin > 0 ? ` · ${izin} izin` : ""}
            {sakit > 0 ? ` · ${sakit} sakit` : ""}
          </p>
        </div>
        <span className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#35C5D0]">
          {percent}%
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chronological.map((r, i) => {
          const status = STATUS[r.attendance ?? ""] ?? STATUS.hadir;
          return (
            <span
              key={i}
              title={`${formatDate(r.session_date)}${
                r.session_number ? ` · Sesi ${r.session_number}` : ""
              } — ${status.label}`}
              className={`h-2.5 w-2.5 rounded-full ${status.dot}`}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Izin dan sakit tidak menurunkan skor kemampuan, hanya menunda
        perkembangan.
      </p>
    </GlassCard>
  );
}
