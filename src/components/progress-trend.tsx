"use client";

import { useId, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { isAbsent } from "@/lib/progress";
import { LockIcon, LOCKED_HINT } from "@/components/ui/lock-icon";
import { AccordionItem } from "@/components/ui/accordion";
import { type IndicatorConfig } from "@/lib/indicators";
import {
  computeMastery,
  type MasteryOverview,
  type SkillProgress,
} from "@/lib/skill-mastery";

type Report = {
  session_date: string;
  session_number: number | null;
  attendance?: string | null;
  notes?: string | null;
  next_focus?: string | null;
  scores: Record<string, number> | null;
};

// One entry per session. Attended sessions carry a score; izin/sakit
// sessions have score = null and sit at the carried-forward level, so an
// absence shows up as a marked pause instead of a fake drop in skill.
type SessionEvent = {
  x: number;
  y: number;
  score: number | null;
  date: string;
  sessionNumber: number | null;
  notes: string | null;
  marker: string | null;
};

// Faint wave + grid texture for the card background. Pure decoration, so it
// lives in its own pointer-events-none layer clipped to the card's radius
// (the card itself can't overflow-hidden or tooltips would get cut off).
const WAVE_BG = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='28' viewBox='0 0 160 28'><path d='M0 14 Q20 4 40 14 T80 14 T120 14 T160 14' fill='none' stroke='%2335C5D0' stroke-opacity='0.045' stroke-width='1'/></svg>")`;
const GRID_BG =
  "linear-gradient(to bottom, rgba(53,197,208,0.025) 1px, transparent 1px)";

const X_MIN = 3;
const X_MAX = 92;
const Y_TOP = 24;
const Y_BOTTOM = 82;
const STEP_WIDTH = 5;

// Status colours. Always paired with a text label, never colour alone.
const MINT_PILL = "border-[#BFEBD5] bg-[#E6F9EF] text-[#1E7A55]";
const TRAINING_PILL = "border-[#35C5D0]/35 bg-[#35C5D0]/12 text-[#0F7C86]";
const NOT_STARTED_PILL = "border-[#CBD5E1]/80 bg-[#EEF2F7] text-[#56657C]";

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

function buildEvents(
  skill: string,
  chronological: Report[],
  minT: number,
  maxT: number
): SessionEvent[] {
  const xFor = (iso: string) =>
    maxT === minT
      ? 50
      : X_MIN + ((new Date(iso).getTime() - minT) / (maxT - minT)) * (X_MAX - X_MIN);

  const rows = chronological
    .map((r) => ({
      r,
      score: isAbsent(r.attendance) ? null : r.scores?.[skill],
    }))
    .filter(
      (p) => isAbsent(p.r.attendance) || typeof p.score === "number"
    ) as { r: Report; score: number | null }[];

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
      x: xFor(r.session_date),
      // Absent sessions borrow the level from before; resolved below for
      // any that come before the first scored session.
      y: score === null ? Number.NaN : scoreToY(score),
      score,
      date: r.session_date,
      sessionNumber: r.session_number,
      notes: r.notes ?? null,
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

// Step line: the level holds flat until a session changes it, then eases
// to the new level right at that session -- an honest "changed here"
// rather than a slope that implies gradual change between sessions.
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-3 w-3"}
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function MasteredBadge() {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${MINT_PILL}`}
    >
      <CheckIcon />
      Sudah dikuasai
    </span>
  );
}

function SkillRibbon({
  name,
  events,
  progress,
  badge,
  compact = false,
  valueFormat,
}: {
  name: string;
  events: SessionEvent[];
  progress: SkillProgress;
  // undefined = the usual "Sedang dilatih"; a string replaces it; null hides it
  badge?: string | null;
  // a small chart for a card: no title row, lower height
  compact?: boolean;
  // how a value is written ("62%"); default is "4/5"
  valueFormat?: (score: number) => string;
}) {
  const fmt = valueFormat ?? ((v: number) => `${v}/5`);
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const mastered = progress.status === "mastered";

  const scored = events.filter((e) => e.score !== null);
  const latest = scored[scored.length - 1];
  const line = stepPath(scored);
  const area = `${line} L ${latest.x} 100 L ${scored[0].x} 100 Z`;

  const activeEvent = active !== null ? events[active] : null;
  const tooltipAlign =
    activeEvent !== null && activeEvent.x > 50 ? "left-1" : "right-1";

  // Label sits to the left of the end marker so it never runs off the card.
  const endLabelRight = `${100 - latest.x}%`;

  return (
    <div>
      {!compact && (
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={`text-sm ${mastered ? "text-slate-600" : "font-medium text-[#17263D]"}`}>
          {name}
        </p>
        {mastered ? (
          <MasteredBadge />
        ) : badge === null ? null : (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TRAINING_PILL}`}
          >
            {badge ?? "Sedang dilatih"}
          </span>
        )}
      </div>
      )}
      {compact ? null : mastered ? (
        <p className="mb-1 text-xs leading-relaxed text-[#2F6F57]">
          Konsisten mendapat 5/5 dalam {progress.streak} penilaian terakhir. Siap
          melanjutkan ke kemampuan berikutnya.
        </p>
      ) : (
        progress.afterMastered && (
          <p className="mb-1 text-xs text-slate-500">
            Tahap berikutnya setelah {progress.afterMastered}
          </p>
        )
      )}
      <div
        className={`relative ${mastered || compact ? "h-16" : "h-24"}`}
        onClick={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        <div className="sr-only">
          <p>
            Skor terbaru {latest.score} dari 5 setelah {scored.length} penilaian
            {mastered ? ", sudah dikuasai" : ""}.
          </p>
          <ul>
            {events.map((e, i) => (
              <li key={i}>
                {formatDate(e.date)}
                {e.sessionNumber ? `, sesi ${e.sessionNumber}` : ""}:{" "}
                {e.score !== null ? `skor ${e.score} dari 5` : `${e.marker}, tidak dinilai`}
              </li>
            ))}
          </ul>
        </div>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#35C5D0" stopOpacity={mastered ? "0.08" : "0.22"} />
              <stop offset="100%" stopColor="#35C5D0" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[Y_TOP, (Y_TOP + Y_BOTTOM) / 2, Y_BOTTOM].map((y) => (
            <line
              key={y}
              x1="0"
              x2="100"
              y1={y}
              y2={y}
              stroke="#35C5D0"
              strokeOpacity={mastered ? "0.06" : "0.1"}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {scored.length > 1 && (
            <>
              <path d={area} fill={`url(#${gradientId})`} />
              <path
                d={line}
                fill="none"
                stroke="#35C5D0"
                strokeWidth={mastered ? "1" : "1.5"}
                strokeOpacity={mastered ? "0.55" : "1"}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={
                  mastered
                    ? undefined
                    : { filter: "drop-shadow(0 0 3px rgba(53,197,208,0.6))" }
                }
              />
            </>
          )}
        </svg>

        {/* Hover/tap strips: one per session, spanning halfway to each
            neighbour, so the whole column is the target. */}
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

        {/* Pause / dip markers -- a mastered skill is shown as one calm
            line with a single end marker, no per-session points. */}
        {!mastered &&
          events.map((e, i) =>
            e.marker ? (
              <div
                key={`m${i}`}
                className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${e.x}%`, top: `${e.y}%`, marginTop: -4 }}
              >
                <span className="h-1.5 w-1.5 rounded-full border border-[#FFC800] bg-[#FFF8E1]" />
                <span className="mt-0.5 whitespace-nowrap text-[8px] font-medium leading-none text-[#a67c00]/80">
                  {e.marker}
                </span>
              </div>
            ) : null
          )}

        {/* Hovered point */}
        {activeEvent && (
          <>
            <span
              className="pointer-events-none absolute top-0 h-full w-px bg-[#35C5D0]/30"
              style={{ left: `${activeEvent.x}%` }}
            />
            {activeEvent.score !== null && activeEvent !== latest && (
              <span
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#35C5D0] shadow-[0_0_8px_rgba(53,197,208,0.8)]"
                style={{ left: `${activeEvent.x}%`, top: `${activeEvent.y}%` }}
              />
            )}
          </>
        )}

        {/* Latest value */}
        {mastered ? (
          <>
            <span
              className="pointer-events-none absolute flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 text-white"
              style={{
                left: `${latest.x}%`,
                top: `${latest.y}%`,
                background:
                  "radial-gradient(circle at 30% 30%, #8fe6ec 0%, #35C5D0 70%)",
                boxShadow:
                  "0 0 10px rgba(53,197,208,0.55), 0 0 0 5px rgba(53,197,208,0.14)",
              }}
            >
              <CheckIcon className="h-2.5 w-2.5" />
            </span>
            <span
              className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap pr-4 text-[11px] font-semibold text-[#1E7A55]"
              style={{ right: endLabelRight, top: `${latest.y - 18}%` }}
            >
              5/5 &middot; Dikuasai
            </span>
          </>
        ) : (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${latest.x}%`, top: `${latest.y}%` }}
          >
            <span
              className="block h-4 w-4 rounded-full border border-white/90"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, #ffffff 0%, #b8f1f5 35%, #35C5D0 100%)",
                boxShadow:
                  "0 0 12px rgba(53,197,208,0.8), 0 0 0 5px rgba(53,197,208,0.18)",
              }}
            />
            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap text-sm font-bold text-[#17263D]">
              {fmt(latest.score as number)}
            </span>
          </div>
        )}

        {activeEvent && (
          <div
            className={`pointer-events-none absolute top-1 z-30 w-44 rounded-xl border border-white/70 bg-white/95 p-2 text-[11px] shadow-[0_8px_24px_rgba(23,38,61,0.18)] ${tooltipAlign}`}
          >
            <p className="font-semibold text-[#17263D]">
              {formatDate(activeEvent.date)}
              {activeEvent.sessionNumber ? ` · Sesi ${activeEvent.sessionNumber}` : ""}
            </p>
            {activeEvent.score !== null ? (
              <p className="mt-0.5 text-[#0f8a94]">{valueFormat ? fmt(activeEvent.score as number) : `Skor ${activeEvent.score}/5`}</p>
            ) : (
              <p className="mt-0.5 text-slate-500">
                Tidak berlatih, skor tetap
              </p>
            )}
            {activeEvent.marker && (
              <p className="mt-0.5 font-medium text-[#a67c00]">{activeEvent.marker}</p>
            )}
            {activeEvent.notes && (
              <p className="mt-0.5 line-clamp-2 text-slate-600">{activeEvent.notes}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- the same ribbon for a whole series (Overall, one skill) ----------
export type RibbonPoint = {
  date: string;
  // average stars, 0-5
  score: number;
  // shown in the hover card (e.g. "Riwayat sebelum pembaruan kurikulum")
  note?: string | null;
  // a small annotation under the point (e.g. "Mulai Level 2")
  marker?: string | null;
};
export type RibbonSeries = { key: string; name: string; points: RibbonPoint[]; badge?: string | null };

// The very same ribbons as the per-indicator trend above (step line, glow,
// end bubble, hover card), fed with a series of average scores instead of one
// indicator. All series share one time axis so they can be read side by side.
export function SeriesRibbons({
  series,
  compact = false,
  valueFormat,
}: {
  series: RibbonSeries[];
  compact?: boolean;
  valueFormat?: (score: number) => string;
}) {
  const times = series.flatMap((s) => s.points.map((p) => new Date(p.date).getTime()));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const xFor = (iso: string) => (maxT === minT ? 50 : X_MIN + ((new Date(iso).getTime() - minT) / (maxT - minT)) * (X_MAX - X_MIN));

  return (
    <div className={series.length > 1 ? "grid gap-x-6 gap-y-5 sm:grid-cols-2" : "grid"}>
      {series.map((s) => {
        if (s.points.length === 0) {
          return (
            <div key={s.key}>
              <p className="text-sm font-medium text-[#17263D]">{s.name}</p>
              <p className="mt-1 text-xs text-slate-500">Belum ada penilaian untuk skill ini.</p>
            </div>
          );
        }
        const events: SessionEvent[] = [...s.points]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((p) => ({
            x: xFor(p.date),
            y: scoreToY(p.score),
            score: p.score,
            date: p.date,
            sessionNumber: null,
            notes: p.note ?? null,
            marker: p.marker ?? null,
          }));
        const progress: SkillProgress = {
          key: s.key,
          name: s.name,
          label: s.name,
          status: "training",
          scores: events.map((e) => e.score as number),
          latest: events[events.length - 1].score,
          streak: 0,
          afterMastered: null,
        };
        return <SkillRibbon key={s.key} name={s.name} events={events} progress={progress} badge={s.badge ?? null} compact={compact} valueFormat={valueFormat} />;
      })}
    </div>
  );
}

const CHIP_STEP = 6;

function NotStartedSkills({ skills }: { skills: SkillProgress[] }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(CHIP_STEP);
  if (skills.length === 0) return null;

  const visible = skills.slice(0, shown);
  const remaining = skills.length - visible.length;

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="mt-4 rounded-2xl border border-white/60 bg-white/45"
      headerClassName="min-h-12 rounded-2xl px-3 py-1.5"
      header={
        <span className="flex items-center gap-1.5 text-sm font-medium text-[#56657C]">
          <LockIcon className="h-4 w-4" />
          {skills.length} indikator belum mulai
        </span>
      }
    >
      <div className="px-3 pb-3 pt-1">
        <div className="flex flex-wrap gap-2">
          {visible.map((skill) => (
            <span
              key={skill.key}
              title={LOCKED_HINT}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${NOT_STARTED_PILL}`}
            >
              <LockIcon className="h-3 w-3" />
              {skill.name}
            </span>
          ))}
        </div>
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setShown((n) => n + CHIP_STEP * 2)}
            className="mt-3 min-h-10 rounded-xl border border-[#35C5D0]/40 px-3 text-xs font-medium text-[#1597A3] transition-colors duration-200 hover:border-[#35C5D0]/70 hover:bg-[#35C5D0]/15 active:bg-[#35C5D0]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]"
          >
            Lihat {remaining} lainnya
          </button>
        )}
      </div>
    </AccordionItem>
  );
}

type Ribbon = { progress: SkillProgress; events: SessionEvent[] };

const MAIN_RIBBONS = 6;

function MoreRibbons({ items }: { items: Ribbon[] }) {
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
          Lihat indikator lain yang sedang dilatih
          <span className="ml-1.5 text-xs font-normal text-slate-500">
            &middot; {items.length} lainnya
          </span>
        </span>
      }
    >
      <div className="grid gap-x-6 gap-y-5 px-3 pb-4 pt-2 sm:grid-cols-2">
        {items.map(({ progress, events }) => (
          <SkillRibbon key={progress.key} name={progress.name} events={events} progress={progress} />
        ))}
      </div>
    </AccordionItem>
  );
}

function MasteredSkills({ items }: { items: Ribbon[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="mt-4 rounded-2xl border border-[#BFEBD5]/80 bg-[#F1FBF6]/70"
      headerClassName="min-h-12 rounded-2xl px-3 py-1.5"
      header={
        <span className="flex items-center gap-2 text-sm font-medium text-[#1E7A55]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#D3F3E2]">
            <CheckIcon />
          </span>
          Kemampuan yang sudah dikuasai ({items.length})
        </span>
      }
    >
      <div className="grid gap-x-6 gap-y-5 px-3 pb-4 pt-2 sm:grid-cols-2">
        {items.map(({ progress, events }) => (
          <SkillRibbon key={progress.key} name={progress.name} events={events} progress={progress} />
        ))}
      </div>
    </AccordionItem>
  );
}

// Small summary at the top of the progress tab: what is mastered, what is
// being trained, and the coach's next focus when written. No global
// percentage on purpose.
export function ProgressOverview({
  indicatorConfig,
  reports,
}: {
  indicatorConfig: IndicatorConfig;
  reports: Report[];
}) {
  const overview = computeMastery(indicatorConfig, reports);
  return <ProgressOverviewCard overview={overview} />;
}

function ProgressOverviewCard({ overview }: { overview: MasteryOverview }) {
  const { mastered, training, nextFocus } = overview;
  if (mastered.length === 0 && training.length === 0 && !nextFocus) return null;

  return (
    <GlassCard tone="soft" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-2xl border px-3 py-2 ${MINT_PILL}`}>
          <p className="flex items-center gap-1.5 text-lg font-bold leading-tight">
            <CheckIcon className="h-4 w-4" />
            {mastered.length}
          </p>
          <p className="text-xs font-medium">indikator sudah dikuasai</p>
        </div>
        <div className={`rounded-2xl border px-3 py-2 ${TRAINING_PILL}`}>
          <p className="text-lg font-bold leading-tight">{training.length}</p>
          <p className="text-xs font-medium">indikator sedang dilatih</p>
        </div>
      </div>
      {nextFocus && (
        <div className="rounded-2xl border border-white/60 bg-white/55 px-3 py-2.5">
          <p className="text-xs font-medium text-slate-500">
            Fokus latihan berikutnya &middot; dari pengajar
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#17263D]">{nextFocus}</p>
        </div>
      )}
    </GlassCard>
  );
}

export function ProgressTrend({
  indicatorConfig,
  reports,
  bare = false,
}: {
  indicatorConfig: IndicatorConfig;
  reports: Report[];
  // render the charts only, without the card and heading around them
  bare?: boolean;
}) {
  if (reports.length === 0) {
    return bare ? (
      <p className="text-sm text-slate-600">Belum ada data skor untuk ditampilkan sebagai tren.</p>
    ) : (
      <GlassCard>
        <p className="text-sm text-slate-600">
          Belum ada data skor untuk ditampilkan sebagai tren.
        </p>
      </GlassCard>
    );
  }

  const chronological = [...reports].sort(
    (a, b) =>
      new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
  );

  // One shared time axis for every skill, so a gap between sessions looks
  // the same width on every chart.
  const times = chronological.map((r) => new Date(r.session_date).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  const overview = computeMastery(indicatorConfig, reports);
  const ribbon = (progress: SkillProgress): Ribbon => ({
    progress,
    events: buildEvents(progress.key, chronological, minT, maxT),
  });
  // Being trained first (curriculum order), then not started, and the
  // mastered ones tucked away in their own section.
  const training = overview.training.map(ribbon);
  const mastered = overview.mastered.map(ribbon);

  const wrap = (children: React.ReactNode) =>
    bare ? (
      <div className="relative">{children}</div>
    ) : (
      <GlassCard className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          style={{
            backgroundImage: `${WAVE_BG}, ${GRID_BG}`,
            backgroundSize: "160px 28px, 100% 28px",
          }}
        />
        <div className="relative">{children}</div>
      </GlassCard>
    );

  return wrap(
      <div className="relative">
        {!bare && (
          <>
            <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
              Tren Perkembangan
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Sumbu waktu mengikuti tanggal sesi. Sesi izin/sakit ditandai dan tidak
              menurunkan skor.
            </p>
          </>
        )}
        {training.length > 0 ? (
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {training.slice(0, MAIN_RIBBONS).map(({ progress, events }) => (
              <SkillRibbon key={progress.key} name={progress.name} events={events} progress={progress} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Belum ada indikator yang sedang dilatih saat ini.
          </p>
        )}
        <MoreRibbons items={training.slice(MAIN_RIBBONS)} />
        <NotStartedSkills skills={overview.notStarted} />
        <MasteredSkills items={mastered} />
      </div>
  );
}
