import { GlassCard } from "@/components/ui/glass-card";

const PROGRESS_EXPLANATION =
  "Dihitung dari rata-rata nilai indikator pada sesi latihan terakhir yang dihadiri.";

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3.5V7M16 3.5V7" />
    </svg>
  );
}

export function ChildSummaryWidget({
  greeting,
  childLabel,
  kehadiran,
  tagihanLabel,
  tagihanOk,
  progressPercent,
  progressNote,
  laporanTersedia,
  nextSessionLabel,
  className,
}: {
  greeting?: string | null;
  childLabel: string;
  kehadiran: { value: string; note: string };
  tagihanLabel: string;
  tagihanOk: boolean;
  progressPercent: number | null;
  // e.g. "Sesi 27 · 13 Sep 2026" -- which session the percentage comes from.
  progressNote?: string | null;
  laporanTersedia: boolean;
  nextSessionLabel: string | null;
  className?: string;
}) {
  const [nextMain, ...nextRest] = (nextSessionLabel ?? "").split(" · ");

  return (
    <GlassCard className={`!bg-white/85 ${className ?? ""}`}>
      {greeting && (
        <p className="text-sm font-semibold text-[#17263D]">{greeting} 👋</p>
      )}
      <p
        className={`mb-4 ${
          greeting
            ? "text-xs text-slate-500"
            : "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]"
        }`}
      >
        {childLabel}
      </p>

      {/* Primary: what the parent most wants to know */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[#35C5D0]/25 bg-gradient-to-br from-[#EEF9FB] to-white p-4">
          <p className="text-xs font-medium text-slate-600">
            Perkembangan pada penilaian terakhir
          </p>
          {progressPercent === null ? (
            <>
              <p className="mt-1 font-[family-name:var(--font-quicksand)] text-xl font-bold text-slate-500">
                Belum ada penilaian
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                Muncul setelah pengajar mengisi penilaian pada sesi yang dihadiri.
              </p>
            </>
          ) : (
            <>
              <p className="mt-0.5 font-[family-name:var(--font-quicksand)] text-4xl font-bold leading-tight text-[#1597A3]">
                {progressPercent}%
              </p>
              <div
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/80"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                aria-label="Perkembangan pada penilaian terakhir"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#35C5D0] to-[#55D6A6]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p
                className="mt-2 text-[11px] leading-snug text-slate-500"
                title={PROGRESS_EXPLANATION}
              >
                {PROGRESS_EXPLANATION}
                {progressNote ? ` (${progressNote})` : ""}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-[#FFC800]/45 bg-gradient-to-br from-[#FFF3C4] to-[#FFF8E1] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-[#a67c00] shadow-[0_2px_8px_rgba(166,124,0,0.18)]">
            <CalendarIcon />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#8a6900]">Sesi Berikutnya</p>
            {nextSessionLabel ? (
              <>
                <p className="font-[family-name:var(--font-quicksand)] text-xl font-bold leading-tight text-[#17263D]">
                  {nextMain}
                </p>
                {nextRest.length > 0 && (
                  <p className="text-sm text-slate-700">{nextRest.join(" · ")}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600">Belum ada jadwal</p>
            )}
          </div>
        </div>
      </div>

      {/* Supporting details */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">
        <div className="col-span-2 rounded-xl bg-[#EEF9FB] px-3 py-2 sm:col-span-1">
          <p className="text-[11px] text-slate-500">Kehadiran</p>
          <p className="text-sm font-semibold text-[#17263D]">{kehadiran.value}</p>
          <p className="text-[11px] text-slate-500">{kehadiran.note}</p>
        </div>
        <div className="rounded-xl bg-[#EEF9FB] px-3 py-2">
          <p className="text-[11px] text-slate-500">Tagihan</p>
          <p
            className={`text-sm font-semibold ${
              tagihanOk ? "text-[#1a8f6f]" : "text-amber-600"
            }`}
          >
            {tagihanLabel}
          </p>
        </div>
        <div className="rounded-xl bg-[#EEF9FB] px-3 py-2">
          <p className="text-[11px] text-slate-500">Laporan</p>
          <p
            className={`text-sm font-semibold ${
              laporanTersedia ? "text-[#1a8f6f]" : "text-slate-500"
            }`}
          >
            {laporanTersedia ? "Tersedia" : "Belum ada"}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
