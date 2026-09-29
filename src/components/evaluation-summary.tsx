"use client";

import { useId, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import { LockIcon, LOCKED_HINT } from "@/components/ui/lock-icon";
import { isAbsent } from "@/lib/progress";
import { activeKeys, displayName, type IndicatorConfig } from "@/lib/indicators";

type Report = {
  session_date: string;
  session_number: number | null;
  attendance?: string | null;
  notes?: string | null;
  // unknown (not Record<string,number>) so a raw Supabase row can be passed
  // through untouched, same convention as ReportRow in report-history-card.
  scores: unknown;
  author_name?: string | null;
};

type SessionEvent = {
  x: number;
  y: number;
  score: number | null;
  date: string;
  sessionNumber: number | null;
  notes: string | null;
  authorName: string | null;
  marker: string | null;
};

const X_MIN = 3;
const X_MAX = 92;
const Y_TOP = 24;
const Y_BOTTOM = 82;
const STEP_WIDTH = 5;
const TREND_THRESHOLD = 0.3;

function scoreToY(score: number) {
  return Y_BOTTOM - (score / 5) * (Y_BOTTOM - Y_TOP);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function absenceLabel(attendance: string | null | undefined) {
  return attendance === "sakit" ? "Sakit" : "Izin";
}

function xFor(iso: string, minT: number, maxT: number) {
  return maxT === minT
    ? 50
    : X_MIN + ((new Date(iso).getTime() - minT) / (maxT - minT)) * (X_MAX - X_MIN);
}

function buildEvents(skill: string, chronological: Report[], minT: number, maxT: number): SessionEvent[] {
  const rows = chronological
    .map((r) => ({
      r,
      score: isAbsent(r.attendance) ? null : (r.scores as Record<string, number> | null)?.[skill],
    }))
    .filter((p) => isAbsent(p.r.attendance) || typeof p.score === "number") as {
    r: Report;
    score: number | null;
  }[];

  if (!rows.some((p) => p.score !== null)) return [];

  const events: SessionEvent[] = [];
  let prevScore: number | null = null;

  for (const { r, score } of rows) {
    let marker: string | null = null;
    if (score === null) {
      marker = absenceLabel(r.attendance);
    } else if (prevScore !== null) {
      const drop = prevScore - score;
      if (drop >= 3) marker = "Perlu perhatian";
      else if (drop >= 2) marker = "Evaluasi ulang";
    }

    events.push({
      x: xFor(r.session_date, minT, maxT),
      y: score === null ? Number.NaN : scoreToY(score),
      score,
      date: r.session_date,
      sessionNumber: r.session_number,
      notes: r.notes ?? null,
      authorName: r.author_name ?? null,
      marker,
    });
    if (score !== null) prevScore = score;
  }

  let lastY = events.find((e) => e.score !== null)!.y;
  for (const e of events) {
    if (e.score !== null) lastY = e.y;
    else e.y = lastY;
  }

  return events;
}

function stepPath(points: SessionEvent[]) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.y === b.y) {
      d += ` L ${b.x} ${b.y}`;
      continue;
    }
    const tx = Math.min(b.x - a.x, STEP_WIDTH);
    d += ` L ${b.x - tx} ${a.y} C ${b.x - tx / 2} ${a.y}, ${b.x - tx / 2} ${b.y}, ${b.x} ${b.y}`;
  }
  return d;
}

function IndicatorRibbon({
  name,
  events,
  handoverX,
  handoverLabel,
}: {
  name: string;
  events: SessionEvent[];
  handoverX: number | null;
  handoverLabel: string | null;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);

  const scored = events.filter((e) => e.score !== null);
  const latest = scored[scored.length - 1];
  const line = stepPath(scored);
  const area = `${line} L ${latest.x} 100 L ${scored[0].x} 100 Z`;

  const activeEvent = active !== null ? events[active] : null;
  const tooltipAlign = activeEvent !== null && activeEvent.x > 50 ? "left-1" : "right-1";

  return (
    <div>
      <p className="mb-1 text-sm text-slate-700">{name}</p>
      <div
        className="relative h-24"
        onClick={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        <span className="sr-only">
          Skor terbaru {latest.score} dari 5 setelah {scored.length} sesi.
        </span>

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#35C5D0" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#35C5D0" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[Y_TOP, (Y_TOP + Y_BOTTOM) / 2, Y_BOTTOM].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#35C5D0" strokeOpacity="0.1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          ))}
          {handoverX !== null && (
            <line x1={handoverX} x2={handoverX} y1="0" y2="100" stroke="#94A3B8" strokeOpacity="0.5" strokeDasharray="1.5 2" vectorEffect="non-scaling-stroke" />
          )}
          {scored.length > 1 && (
            <>
              <path d={area} fill={`url(#${gradientId})`} />
              <path
                d={line}
                fill="none"
                stroke="#35C5D0"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "drop-shadow(0 0 3px rgba(53,197,208,0.6))" }}
              />
            </>
          )}
        </svg>

        {handoverX !== null && handoverLabel && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[8px] font-medium leading-none text-slate-500"
            style={{ left: `${handoverX}%` }}
          >
            {handoverLabel}
          </div>
        )}

        {events.map((e, i) => {
          const left = i === 0 ? 0 : (events[i - 1].x + e.x) / 2;
          const right = i === events.length - 1 ? 100 : (e.x + events[i + 1].x) / 2;
          return (
            <div
              key={i}
              onMouseEnter={() => setActive(i)}
              onClick={(ev) => {
                ev.stopPropagation();
                setActive(i);
              }}
              className="absolute top-0 h-full cursor-pointer"
              style={{ left: `${left}%`, width: `${right - left}%` }}
            />
          );
        })}

        {events.map((e, i) =>
          e.marker ? (
            <div
              key={`m${i}`}
              className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${e.x}%`, top: `${e.y}%`, marginTop: -4 }}
            >
              <span className="h-1.5 w-1.5 rounded-full border border-[#FFC800] bg-[#FFF8E1]" />
              <span className="mt-0.5 whitespace-nowrap text-[8px] font-medium leading-none text-[#a67c00]/80">{e.marker}</span>
            </div>
          ) : null
        )}

        {activeEvent && (
          <>
            <span className="pointer-events-none absolute top-0 h-full w-px bg-[#35C5D0]/30" style={{ left: `${activeEvent.x}%` }} />
            {activeEvent.score !== null && activeEvent !== latest && (
              <span
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#35C5D0] shadow-[0_0_8px_rgba(53,197,208,0.8)]"
                style={{ left: `${activeEvent.x}%`, top: `${activeEvent.y}%` }}
              />
            )}
          </>
        )}

        <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${latest.x}%`, top: `${latest.y}%` }}>
          <span
            className="block h-4 w-4 rounded-full border border-white/90"
            style={{
              background: "radial-gradient(circle at 30% 30%, #ffffff 0%, #b8f1f5 35%, #35C5D0 100%)",
              boxShadow: "0 0 12px rgba(53,197,208,0.8), 0 0 0 5px rgba(53,197,208,0.18)",
            }}
          />
          <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap text-sm font-bold text-[#17263D]">
            {latest.score}/5
          </span>
        </div>

        {activeEvent && (
          <div className={`pointer-events-none absolute top-1 z-30 w-48 rounded-xl border border-white/70 bg-white/95 p-2 text-[11px] shadow-[0_8px_24px_rgba(23,38,61,0.18)] ${tooltipAlign}`}>
            <p className="font-semibold text-[#17263D]">
              {formatDate(activeEvent.date)}
              {activeEvent.sessionNumber ? ` · Sesi ${activeEvent.sessionNumber}` : ""}
            </p>
            {activeEvent.score !== null ? (
              <p className="mt-0.5 text-[#0f8a94]">Skor {activeEvent.score}/5</p>
            ) : (
              <p className="mt-0.5 text-slate-500">Tidak berlatih, skor tetap</p>
            )}
            {activeEvent.authorName && <p className="mt-0.5 text-slate-500">Oleh {activeEvent.authorName}</p>}
            {activeEvent.marker && <p className="mt-0.5 font-medium text-[#a67c00]">{activeEvent.marker}</p>}
            {activeEvent.notes && <p className="mt-0.5 line-clamp-2 text-slate-600">{activeEvent.notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function LockedIndicators({ items }: { items: { key: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(6);
  if (items.length === 0) return null;
  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="mt-4 rounded-2xl border border-white/60 bg-white/45"
      headerClassName="min-h-12 rounded-2xl px-3 py-1.5"
      header={
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <LockIcon className="h-4 w-4" />
          {items.length} indikator belum dibuka
        </span>
      }
    >
      <div className="px-3 pb-3 pt-1">
        <div className="flex flex-wrap gap-2">
          {visible.map((s) => (
            <span key={s.key} title={LOCKED_HINT} className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/60 px-2.5 py-1 text-xs text-slate-500">
              <LockIcon className="h-3 w-3" />
              {s.name}
            </span>
          ))}
        </div>
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setShown((n) => n + 12)}
            className="mt-3 min-h-10 rounded-xl border border-[#35C5D0]/40 px-3 text-xs font-medium text-[#1597A3] transition-colors duration-200 hover:border-[#35C5D0]/70 hover:bg-[#35C5D0]/15 active:bg-[#35C5D0]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]"
          >
            Lihat {remaining} lainnya
          </button>
        )}
      </div>
    </AccordionItem>
  );
}

const MAIN_RIBBONS = 6;

function MoreIndicators({ items }: { items: { skill: string; name: string; events: SessionEvent[] }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="mt-4 rounded-2xl border border-white/60 bg-white/45"
      headerClassName="min-h-12 rounded-2xl px-3 py-1.5"
      header={
        <span className="text-sm font-medium text-[#17263D]">
          Lihat semua indikator
          <span className="ml-1.5 text-xs font-normal text-slate-500">&middot; {items.length} lainnya</span>
        </span>
      }
    >
      <div className="grid gap-x-6 gap-y-5 px-3 pb-4 pt-2 sm:grid-cols-2">
        {items.map(({ skill, name, events }) => (
          <IndicatorRibbon key={skill} name={name} events={events} handoverX={null} handoverLabel={null} />
        ))}
      </div>
    </AccordionItem>
  );
}

const TREND_COPY: Record<"meningkat" | "stabil" | "perlu_perhatian", { label: string; tone: string }> = {
  meningkat: { label: "Meningkat", tone: "bg-[#DDF7EE] text-[#0f6b52]" },
  stabil: { label: "Stabil", tone: "bg-[#DFF3FF] text-[#0b5f8a]" },
  perlu_perhatian: { label: "Perlu perhatian", tone: "bg-[#FFE9E0] text-[#9a4a2a]" },
};

// Average score across every active indicator that has been scored, per
// attended session (newest first) -- the last 4 such sessions, last 2 vs
// the 2 before that. Fewer than 4 attended+scored sessions: no verdict yet.
function classifyTrend(reportsNewestFirstHadir: Report[], keys: string[]): keyof typeof TREND_COPY | null {
  const perSession = reportsNewestFirstHadir
    .map((r) => {
      const scores = (r.scores as Record<string, number> | null) ?? {};
      const values = keys.map((k) => scores[k]).filter((v): v is number => typeof v === "number");
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    })
    .filter((v): v is number => v !== null)
    .slice(0, 4);

  if (perSession.length < 4) return null;
  const recent = (perSession[0] + perSession[1]) / 2;
  const prior = (perSession[2] + perSession[3]) / 2;
  const delta = recent - prior;
  if (delta >= TREND_THRESHOLD) return "meningkat";
  if (delta <= -TREND_THRESHOLD) return "perlu_perhatian";
  return "stabil";
}

export function EvaluationSummary({
  indicatorConfig,
  reports,
  latestIndicatorLabel,
  nextFocus,
  nextTargetLabel,
  handoverAt,
  currentPelatihName,
}: {
  indicatorConfig: IndicatorConfig;
  reports: Report[];
  // "Gaya Bebas - Kaki" of the most recently attended, scored session
  latestIndicatorLabel: string | null;
  nextFocus: string | null;
  // e.g. "Perunggu 25m Gaya Bebas" from pickNextTarget()
  nextTargetLabel: string | null;
  handoverAt: string | null;
  currentPelatihName: string | null;
}) {
  const chronological = [...reports].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());
  const attendedNewestFirst = [...reports].filter((r) => !isAbsent(r.attendance)).sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime());

  const keys = activeKeys(indicatorConfig);
  const trend = classifyTrend(attendedNewestFirst, keys);

  if (reports.length === 0 || attendedNewestFirst.length < 2) {
    return (
      <GlassCard>
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Evaluasi Perkembangan</h2>
        <p className="mt-2 text-sm text-slate-600">
          Belum cukup laporan untuk membaca tren. Grafik muncul setelah beberapa sesi dinilai.
        </p>
      </GlassCard>
    );
  }

  const times = chronological.map((r) => new Date(r.session_date).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const handoverX = handoverAt ? xFor(handoverAt, minT, maxT) : null;
  const handoverLabel = currentPelatihName ? `Mulai bersama ${currentPelatihName}` : null;

  // Most-recently-scored indicators surface first; anything never opened
  // collapses into the locked-chip list instead of an empty chart.
  const lastScoredAt = new Map<string, number>();
  for (const r of chronological) {
    const scores = (r.scores as Record<string, number> | null) ?? {};
    for (const key of Object.keys(scores)) {
      if (typeof scores[key] === "number" && scores[key] > 0) lastScoredAt.set(key, new Date(r.session_date).getTime());
    }
  }

  const all = keys
    .map((skill) => ({
      skill,
      name: displayName(indicatorConfig, skill),
      events: buildEvents(skill, chronological, minT, maxT),
      lastScored: lastScoredAt.get(skill) ?? -1,
    }))
    .filter((s) => s.events.length > 0)
    .sort((a, b) => b.lastScored - a.lastScored);

  const opened = all.filter((s) => s.lastScored > 0);
  const lockedIndicators = keys
    .filter((k) => !lastScoredAt.has(k))
    .map((k) => ({ key: k, name: displayName(indicatorConfig, k) }));

  return (
    <GlassCard className="relative">
      <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Evaluasi Perkembangan</h2>
      <p className="mb-3 text-xs text-slate-500">
        Alat evaluasi untuk pengajar: tren indikator per kelompok, bukan riwayat laporan.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {trend && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TREND_COPY[trend].tone}`}>
            Tren 4 sesi terakhir: {TREND_COPY[trend].label}
          </span>
        )}
        {latestIndicatorLabel && (
          <span className="rounded-full bg-[#EEF9FB] px-3 py-1 text-xs font-medium text-[#17263D]">
            Terakhir dinilai: {latestIndicatorLabel}
          </span>
        )}
      </div>

      {(nextFocus || nextTargetLabel) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {nextFocus && (
            <div className="rounded-xl bg-[#EEF9FB] px-3 py-2">
              <p className="text-[11px] font-medium text-slate-500">Fokus latihan berikutnya</p>
              <p className="text-sm text-[#17263D]">{nextFocus}</p>
            </div>
          )}
          {nextTargetLabel && (
            <div className="rounded-xl bg-[#FFF8E1] px-3 py-2">
              <p className="text-[11px] font-medium text-slate-500">Target rekor berikutnya</p>
              <p className="text-sm text-[#17263D]">{nextTargetLabel}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {opened.slice(0, MAIN_RIBBONS).map(({ skill, name, events }) => (
          <IndicatorRibbon
            key={skill}
            name={name}
            events={events}
            handoverX={handoverX}
            handoverLabel={handoverLabel}
          />
        ))}
      </div>
      <MoreIndicators items={opened.slice(MAIN_RIBBONS)} />
      <LockedIndicators items={lockedIndicators} />
    </GlassCard>
  );
}
