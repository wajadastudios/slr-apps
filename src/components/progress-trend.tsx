"use client";

import { useId, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { isAbsent } from "@/lib/progress";
import { LockIcon, LOCKED_HINT } from "@/components/ui/lock-icon";
import { AccordionItem } from "@/components/ui/accordion";
import { formatSkillName } from "@/lib/skill-names";

type Report = {
  session_date: string;
  session_number: number | null;
  attendance?: string | null;
  notes?: string | null;
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

function SkillRibbon({ skill, events }: { skill: string; events: SessionEvent[] }) {
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);

  const scored = events.filter((e) => e.score !== null);
  const latest = scored[scored.length - 1];
  const line = stepPath(scored);
  const area = `${line} L ${latest.x} 100 L ${scored[0].x} 100 Z`;

  const activeEvent = active !== null ? events[active] : null;
  const tooltipAlign =
    activeEvent !== null && activeEvent.x > 50 ? "left-1" : "right-1";

  return (
    <div>
      <p className="mb-1 text-sm text-slate-700">{formatSkillName(skill)}</p>
      <div
        className="relative h-24"
        onClick={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        <span className="sr-only">
          Skor terbaru {latest.score} dari 5 setelah {scored.length} sesi.
        </span>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#35C5D0" stopOpacity="0.22" />
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
              strokeOpacity="0.1"
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
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "drop-shadow(0 0 3px rgba(53,197,208,0.6))" }}
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

        {/* Pause / dip markers */}
        {events.map((e, i) =>
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

        {/* Latest value: glass orb + label */}
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
            {latest.score}/5
          </span>
        </div>

        {activeEvent && (
          <div
            className={`pointer-events-none absolute top-1 z-30 w-44 rounded-xl border border-white/70 bg-white/95 p-2 text-[11px] shadow-[0_8px_24px_rgba(23,38,61,0.18)] ${tooltipAlign}`}
          >
            <p className="font-semibold text-[#17263D]">
              {formatDate(activeEvent.date)}
              {activeEvent.sessionNumber ? ` · Sesi ${activeEvent.sessionNumber}` : ""}
            </p>
            {activeEvent.score !== null ? (
              <p className="mt-0.5 text-[#0f8a94]">Skor {activeEvent.score}/5</p>
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

const CHIP_STEP = 6;

function LockedSkills({ skills }: { skills: string[] }) {
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
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <LockIcon className="h-4 w-4" />
          {skills.length} indikator belum dibuka
        </span>
      }
    >
      <div className="px-3 pb-3 pt-1">
        <div className="flex flex-wrap gap-2">
          {visible.map((skill) => (
            <span
              key={skill}
              title={LOCKED_HINT}
              className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/60 px-2.5 py-1 text-xs text-slate-500"
            >
              <LockIcon className="h-3 w-3" />
              {formatSkillName(skill)}
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

const MAIN_RIBBONS = 6;

function MoreRibbons({
  items,
}: {
  items: { skill: string; events: SessionEvent[] }[];
}) {
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
          <span className="ml-1.5 text-xs font-normal text-slate-500">
            &middot; {items.length} lainnya
          </span>
        </span>
      }
    >
      <div className="grid gap-x-6 gap-y-5 px-3 pb-4 pt-2 sm:grid-cols-2">
        {items.map(({ skill, events }) => (
          <SkillRibbon key={skill} skill={skill} events={events} />
        ))}
      </div>
    </AccordionItem>
  );
}

export function ProgressTrend({
  skillTemplate,
  reports,
}: {
  skillTemplate: string[];
  reports: Report[];
}) {
  const chronological = [...reports].sort(
    (a, b) =>
      new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
  );

  // One shared time axis for every skill, so a gap between sessions looks
  // the same width on every chart.
  const times = chronological.map((r) => new Date(r.session_date).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  const all = skillTemplate.map((skill) => ({
    skill,
    events: buildEvents(skill, chronological, minT, maxT),
  }));

  // A skill still at 0 (or never scored) hasn't been "opened" yet -- a flat
  // line at the floor says nothing, so those collapse into a chip list
  // instead of taking up a chart each.
  const isOpened = (events: SessionEvent[]) => {
    const scored = events.filter((e) => e.score !== null);
    return scored.length > 0 && scored[scored.length - 1].score! > 0;
  };
  const skills = all.filter((s) => isOpened(s.events));
  const lockedSkills = all.filter((s) => !isOpened(s.events)).map((s) => s.skill);

  if (reports.length === 0) {
    return (
      <GlassCard>
        <p className="text-sm text-slate-600">
          Belum ada data skor untuk ditampilkan sebagai tren.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
        style={{
          backgroundImage: `${WAVE_BG}, ${GRID_BG}`,
          backgroundSize: "160px 28px, 100% 28px",
        }}
      />
      <div className="relative">
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Tren Perkembangan
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Sumbu waktu mengikuti tanggal sesi. Sesi izin/sakit ditandai dan tidak
          menurunkan skor.
        </p>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {skills.slice(0, MAIN_RIBBONS).map(({ skill, events }) => (
            <SkillRibbon key={skill} skill={skill} events={events} />
          ))}
        </div>
        <MoreRibbons items={skills.slice(MAIN_RIBBONS)} />
        <LockedSkills skills={lockedSkills} />
      </div>
    </GlassCard>
  );
}
