import { GlassCard } from "@/components/ui/glass-card";

export function ChildSummaryWidget({
  greeting,
  childLabel,
  kehadiranLabel,
  tagihanLabel,
  tagihanOk,
  progressPercent,
  laporanTersedia,
  nextSessionLabel,
  className,
}: {
  greeting?: string | null;
  childLabel: string;
  kehadiranLabel: string;
  tagihanLabel: string;
  tagihanOk: boolean;
  progressPercent: number | null;
  laporanTersedia: boolean;
  nextSessionLabel: string | null;
  className?: string;
}) {
  return (
    <GlassCard className={`!bg-white/85 ${className ?? ""}`}>
      {greeting && (
        <p className="text-sm font-semibold text-[#17263D]">{greeting} 👋</p>
      )}
      <p
        className={`mb-3 text-xs text-slate-500 ${
          greeting ? "" : "!text-sm !font-semibold !text-[#17263D]"
        }`}
      >
        {childLabel}
      </p>

      <div className="grid grid-cols-2 gap-2 text-left">
        <div className="rounded-xl bg-[#EEF9FB] p-2">
          <p className="text-[10px] text-slate-500">Kehadiran</p>
          <p className="text-sm font-semibold text-[#35C5D0]">{kehadiranLabel}</p>
        </div>
        <div className="rounded-xl bg-[#EEF9FB] p-2">
          <p className="text-[10px] text-slate-500">Tagihan</p>
          <p
            className={`text-sm font-semibold ${
              tagihanOk ? "text-[#55D6A6]" : "text-amber-600"
            }`}
          >
            {tagihanLabel}
          </p>
        </div>
        <div className="rounded-xl bg-[#EEF9FB] p-2">
          <p className="text-[10px] text-slate-500">Progress</p>
          <p className="text-sm font-semibold text-[#35C5D0]">
            {progressPercent === null ? "-" : `${progressPercent}%`}
          </p>
        </div>
        <div className="rounded-xl bg-[#EEF9FB] p-2">
          <p className="text-[10px] text-slate-500">Laporan</p>
          <p
            className={`text-sm font-semibold ${
              laporanTersedia ? "text-[#55D6A6]" : "text-slate-500"
            }`}
          >
            {laporanTersedia ? "Tersedia" : "Belum ada"}
          </p>
        </div>
      </div>

      {progressPercent !== null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>Skill Renang</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#35C5D0] to-[#55D6A6]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {nextSessionLabel && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#FFF8E1] p-2">
          <span className="text-base">📅</span>
          <p className="text-[11px] font-medium text-[#17263D]">
            Sesi Berikutnya: {nextSessionLabel}
          </p>
        </div>
      )}
    </GlassCard>
  );
}
