"use client";

import { useState, type ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import { StarRating } from "@/components/ui/star-rating";
import { ProgressTrend, SeriesRibbons } from "@/components/progress-trend";
import { STAR_MEANING } from "@/lib/curriculum/stars";
import type { ParentProgressModel, UnitView } from "@/lib/curriculum/parent-view";
import type { UnitStatus } from "@/lib/curriculum/progress";
import { formatShortDate } from "@/lib/format-date";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const pct = (score: number) => `${Math.round(score * 20)}%`;

// mint = mastered, turquoise = being trained, soft yellow = just started, grey-blue = not started
const STATUS_STYLE: Record<UnitStatus, string> = {
  sudah_dikuasai: "border-[#BFEBD5] bg-[#E6F9EF] text-[#1E7A55]",
  berkembang_baik: "border-[#35C5D0]/40 bg-[#35C5D0]/15 text-[#0F7C86]",
  sedang_dilatih: "border-[#35C5D0]/35 bg-[#35C5D0]/10 text-[#0F7C86]",
  baru_dimulai: "border-[#F2D77A] bg-[#FFF6D6] text-[#7a5c00]",
  belum_dimulai: "border-[#CBD5E1]/80 bg-[#EEF2F7] text-[#56657C]",
};

// Height + opacity + a little lift, about 250ms.
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid transition-all duration-[250ms] ease-out ${open ? "grid-rows-[1fr] translate-y-0 opacity-100" : "pointer-events-none grid-rows-[0fr] -translate-y-1 opacity-0"}`}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function StatusPill({ status, label }: { status: UnitStatus; label: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{label}</span>;
}

function Detail({ unit }: { unit: UnitView }) {
  return (
    <div className="flex flex-col gap-4 px-1 pb-2 pt-1">
      {unit.focus && (
        <p className="rounded-xl bg-[#EEF9FB] px-3 py-2 text-sm text-[#17263D]">
          <span className="block text-[11px] font-medium text-slate-500">Fokus berikutnya</span>
          {unit.focus}
        </p>
      )}

      {unit.spark.length > 0 && (
        <div>
          <SeriesRibbons series={[{ key: unit.key, name: `Progress ${unit.name}`, points: unit.spark.map((p) => ({ date: p.date, score: p.score })), badge: null }]} valueFormat={pct} />
        </div>
      )}

      {unit.items.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-[#17263D]">Nilai terbaru tiap indikator</h4>
          <ul className="flex flex-col gap-1.5">
            {unit.items.map((i) => (
              <li key={i.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm text-slate-700">{i.label}</span>
                <span className="flex items-center gap-1.5">
                  <StarRating value={i.stars} size={14} />
                  <span className="text-[11px] text-slate-500">{formatShortDate(i.date)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unit.trend.reports.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-[#17263D]">Tren tiap indikator</h4>
          <ProgressTrend indicatorConfig={unit.trend.config} reports={unit.trend.reports} bare />
        </div>
      )}

      {unit.records.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-[#17263D]">Rekor</h4>
          <ul className="flex flex-col gap-1 text-sm text-slate-700">
            {unit.records.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UnitCard({ unit }: { unit: UnitView }) {
  const [open, setOpen] = useState(false);
  return (
    <GlassCard className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">{unit.name}</h3>
          {unit.levelText && <p className="text-xs text-slate-500">{unit.levelText}</p>}
        </div>
        <StatusPill status={unit.status} label={unit.statusLabel} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-[family-name:var(--font-quicksand)] text-3xl font-bold text-[#17263D]">{unit.percent}%</span>
        <span className="text-xs text-slate-500">Progress</span>
      </div>
      <p className="text-xs text-slate-600">{unit.coverage}</p>
      {unit.spark.length > 0 && <SeriesRibbons series={[{ key: unit.key, name: unit.name, points: unit.spark, badge: null }]} compact valueFormat={pct} />}
      <AccordionItem
        variant="ortu"
        chevronSize="sm"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="mt-1 rounded-2xl border border-white/60 bg-white/50"
        headerClassName="min-h-11 rounded-2xl px-3 py-1"
        header={<span className="text-sm font-medium text-[#0F7C86]">{open ? "Tutup detail" : "Lihat detail"}</span>}
      >
        <div className="px-3 pb-3">
          <Detail unit={unit} />
        </div>
      </AccordionItem>
    </GlassCard>
  );
}

// "? Cara membaca penilaian": a small link, closed until opened.
function HowToRead() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-[#1597A3] hover:bg-[#35C5D0]/10"
      >
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-[#35C5D0]/60 text-xs font-bold">
          ?
        </span>
        Cara membaca penilaian
      </button>
      <Collapse open={open}>
        <div className="mt-1 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-[#17263D]">Bintang adalah penilaian pengajar untuk tiap indikator:</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <li key={n}>
                <span className="font-semibold text-[#17263D]">{n} &#9733;</span> {STAR_MEANING[n].label}: {STAR_MEANING[n].description}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <span className="font-semibold text-[#17263D]">Progress %</span> dihitung otomatis dari nilai bintang terbaru indikator yang sudah dinilai. Indikator yang belum dinilai tidak
            dihitung sebagai 0. Ini ringkasan penguasaan dalam latihan, bukan nilai akhir kemampuan renang anak.
          </p>
        </div>
      </Collapse>
    </div>
  );
}

export function ParentProgressView({ model }: { model: ParentProgressModel }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const { overall, focus, attendance, main, more, full } = model;

  return (
    <div className="flex flex-col gap-4">
      <GlassCard>
        <h2 className={HEADING}>Perkembangan Saat Ini</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-[#35C5D0]/30 bg-gradient-to-br from-white/80 to-[#EEF9FB]/80 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1597A3]">Overall Progress</p>
            {overall ? (
              <>
                <p className="font-[family-name:var(--font-quicksand)] text-4xl font-bold text-[#17263D]">{overall.percent}%</p>
                <p className="mt-0.5 text-xs text-slate-600">Dihitung dari {overall.count} kemampuan yang sedang dipelajari dan sudah cukup dinilai.</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-600">Perkembangan sedang dikumpulkan dari penilaian latihan.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {focus && (
              <div className="rounded-2xl border border-white/60 bg-white/60 px-4 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">Fokus latihan saat ini</p>
                <p className="text-sm font-semibold text-[#17263D]">{focus.text}</p>
              </div>
            )}
            {attendance && (
              <div className="rounded-2xl border border-white/60 bg-white/60 px-4 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">Konsistensi latihan</p>
                <p className="text-sm font-semibold text-[#17263D]">
                  {attendance.present} dari {attendance.total} sesi hadir
                </p>
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-[#FFF8E1] px-3 py-2 text-xs text-[#6b5200]" role="note">
          Penilaian menunjukkan kemampuan dalam kondisi latihan yang dicatat. Anak tetap memerlukan pengawasan di sekitar air.
        </p>
      </GlassCard>

      {main.length > 0 && (
        <section aria-label="Kemampuan yang sedang dipelajari" className="flex flex-col gap-3">
          {main.map((u) => (
            <UnitCard key={u.key} unit={u} />
          ))}
        </section>
      )}

      {more.length > 0 && (
        <AccordionItem
          variant="ortu"
          chevronSize="sm"
          open={moreOpen}
          onToggle={() => setMoreOpen((v) => !v)}
          className="rounded-2xl border border-white/60 bg-white/55"
          headerClassName="min-h-14 rounded-2xl px-4 py-2"
          header={<span className="text-sm font-medium text-[#17263D]">Lihat kemampuan lainnya ({more.length})</span>}
        >
          <div className="flex flex-col gap-3 px-3 pb-3">
            {more.map((u) => (
              <UnitCard key={u.key} unit={u} />
            ))}
          </div>
        </AccordionItem>
      )}

      {full.reports.length > 0 && (
        <AccordionItem
          variant="ortu"
          chevronSize="sm"
          open={fullOpen}
          onToggle={() => setFullOpen((v) => !v)}
          className="rounded-2xl border border-white/60 bg-white/55"
          headerClassName="min-h-14 rounded-2xl px-4 py-2"
          header={<span className="text-sm font-medium text-[#17263D]">Lihat riwayat lengkap</span>}
        >
          <div className="px-3 pb-3">
            <ProgressTrend indicatorConfig={full.config} reports={full.reports} bare />
          </div>
        </AccordionItem>
      )}

      <HowToRead />
    </div>
  );
}
