import { GlassCard } from "@/components/ui/glass-card";

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

function TargetIcon() {
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
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function SparkIcon() {
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
      <path d="M12 3.5l2.2 5.3 5.3 2.2-5.3 2.2L12 18.5l-2.2-5.3L4.5 11l5.3-2.2L12 3.5z" />
    </svg>
  );
}

export function ChildSummaryWidget({
  greeting,
  childLabel,
  kehadiran,
  tagihanLabel,
  tagihanOk,
  laporanTersedia,
  nextSessionLabel,
  nextFocus,
  achievement,
  className,
}: {
  greeting?: string | null;
  childLabel: string;
  kehadiran: { value: string; note: string };
  tagihanLabel: string;
  tagihanOk: boolean;
  laporanTersedia: boolean;
  nextSessionLabel: string | null;
  // Trainer's own focus note from the newest attended report that has one.
  nextFocus: string | null;
  // Data-backed positive note, or null when the data can't support one.
  achievement: string | null;
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

      {/* 1. Next session */}
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

      {/* 2 + 3. Focus and achievement (each only when the data exists) */}
      {(nextFocus || achievement) && (
        <div
          className={`mt-3 grid gap-3 ${nextFocus && achievement ? "md:grid-cols-2" : ""}`}
        >
          {nextFocus && (
            <div className="flex items-start gap-3 rounded-2xl border border-[#35C5D0]/25 bg-gradient-to-br from-[#EEF9FB] to-white p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#1597A3]">
                <TargetIcon />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-600">
                  Fokus latihan berikutnya
                </p>
                <p className="mt-0.5 whitespace-pre-line text-sm font-medium leading-snug text-[#17263D]">
                  {nextFocus}
                </p>
              </div>
            </div>
          )}
          {achievement && (
            <div className="flex items-start gap-3 rounded-2xl border border-[#55D6A6]/40 bg-gradient-to-br from-[#E9FBF3] to-white p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#1a8f6f]">
                <SparkIcon />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-600">Pencapaian terakhir</p>
                <p className="mt-0.5 text-sm font-medium leading-snug text-[#17263D]">
                  {achievement}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Attendance / quota + supporting details */}
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
