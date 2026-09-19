"use client";

import { useId, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";

type Report = {
  session_date: string;
  session_number: number | null;
  attendance?: string | null;
  notes?: string | null;
  scores: Record<string, number> | null;
};

type Point = {
  x: number;
  y: number;
  score: number;
  date: string;
  sessionNumber: number | null;
  notes: string | null;
  marker: string | null;
};

// Faint wave + grid texture for the card background. Pure decoration, so it
// lives in its own pointer-events-none layer clipped to the card's radius
// (the card itself can't overflow-hidden or tooltips would get cut off).
const WAVE_BG = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='28' viewBox='0 0 160 28'><path d='M0 14 Q20 4 40 14 T80 14 T120 14 T160 14' fill='none' stroke='%2335C5D0' stroke-opacity='0.10' stroke-width='1'/></svg>")`;
const GRID_BG =
  "linear-gradient(to bottom, rgba(53,197,208,0.05) 1px, transparent 1px)";

const X_MIN = 3;
const X_MAX = 92;
const Y_TOP = 24;
const Y_BOTTOM = 82;

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

// A dip should read as context, not as a broken chart: absence explains
// itself, and a sharp drop without absence is flagged for a second look.
function markerFor(
  attendance: string | null | undefined,
  prevScore: number | null,
  score: number
): string | null {
  if (attendance === "izin") return "Izin";
  if (attendance === "sakit") return "Sakit";
  if (prevScore !== null) {
    const drop = prevScore - score;
    if (drop >= 3) return "Perlu perhatian";
    if (drop >= 2) return "Evaluasi ulang";
  }
  return null;
}

function buildPoints(skill: string, chronological: Report[]): Point[] {
  const raw = chronological
    .map((r) => ({ r, score: r.scores?.[skill] }))
    .filter((p): p is { r: Report; score: number } => typeof p.score === "number");

  return raw.map((p, i) => ({
    x: raw.length > 1 ? X_MIN + (i / (raw.length - 1)) * (X_MAX - X_MIN) : 50,
    y: scoreToY(p.score),
    score: p.score,
    date: p.r.session_date,
    sessionNumber: p.r.session_number,
    notes: p.r.notes ?? null,
    marker: markerFor(p.r.attendance, i > 0 ? raw[i - 1].score : null, p.score),
  }));
}

// Smooth "step" line: each level change is an S-curve between sessions
// instead of a sharp diagonal, since scores move in discrete jumps.
function stepPath(points: Point[]) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mid = (a.x + b.x) / 2;
    d += ` C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
  }
  return d;
}

function SkillRibbon({ skill, points }: { skill: string; points: Point[] }) {
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);

  const latest = points[points.length - 1];
  const line = stepPath(points);
  const area = `${line} L ${latest.x} 100 L ${points[0].x} 100 Z`;
  const step = points.length > 1 ? (X_MAX - X_MIN) / (points.length - 1) : 100;

  const activePoint = active !== null ? points[active] : null;
  const tooltipAlign =
    activePoint === null
      ? ""
      : activePoint.x > 60
        ? "right-0"
        : activePoint.x < 40
          ? "left-0"
          : "left-1/2 -translate-x-1/2";

  return (
    <div>
      <p className="mb-1 text-sm text-slate-700">{skill}</p>
      <div
        className="relative h-24"
        onClick={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        <span className="sr-only">
          Skor terbaru {latest.score} dari 5 setelah {points.length} sesi.
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
          {points.length > 1 && (
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

        {/* Hover/tap strips: one per session, full height, so the whole
            column is the target instead of a tiny invisible dot. */}
        {points.map((p, i) => (
          <div
            key={i}
            onMouseEnter={() => setActive(i)}
            onClick={(e) => {
              e.stopPropagation();
              setActive(i);
            }}
            className="absolute top-0 h-full cursor-pointer"
            style={{
              left: `${p.x}%`,
              width: `${Math.max(step, 4)}%`,
              transform: "translateX(-50%)",
            }}
          />
        ))}

        {/* Extreme-dip markers */}
        {points.map((p, i) =>
          p.marker ? (
            <div
              key={`m${i}`}
              className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${p.x}%`, top: `${p.y}%`, marginTop: -4 }}
            >
              <span className="h-2 w-2 rounded-full border border-[#FFC800] bg-[#FFF8E1]" />
              <span className="mt-0.5 whitespace-nowrap text-[9px] font-medium leading-none text-[#a67c00]">
                {p.marker}
              </span>
            </div>
          ) : null
        )}

        {/* Hovered point */}
        {activePoint && active !== points.length - 1 && (
          <>
            <span
              className="pointer-events-none absolute top-0 h-full w-px bg-[#35C5D0]/30"
              style={{ left: `${activePoint.x}%` }}
            />
            <span
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#35C5D0] shadow-[0_0_8px_rgba(53,197,208,0.8)]"
              style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }}
            />
          </>
        )}

        {/* Latest value: glass orb + label */}
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${latest.x}%`, top: `${latest.y}%` }}
        >
          <span
            className="block h-3.5 w-3.5 rounded-full border border-white/80"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, #ffffff 0%, #b8f1f5 35%, #35C5D0 100%)",
              boxShadow:
                "0 0 10px rgba(53,197,208,0.75), 0 0 0 4px rgba(53,197,208,0.15)",
            }}
          />
          <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-[#17263D]">
            {latest.score}/5
          </span>
        </div>

        {activePoint && (
          <div
            className={`absolute top-full z-30 mt-1 w-48 rounded-xl border border-white/60 bg-white/90 p-2.5 text-xs shadow-[0_8px_24px_rgba(23,38,61,0.18)] backdrop-blur-md ${tooltipAlign}`}
          >
            <p className="font-semibold text-[#17263D]">
              {formatDate(activePoint.date)}
              {activePoint.sessionNumber ? ` · Sesi ${activePoint.sessionNumber}` : ""}
            </p>
            <p className="mt-0.5 text-[#0f8a94]">Skor {activePoint.score}/5</p>
            {activePoint.marker && (
              <p className="mt-0.5 font-medium text-[#a67c00]">{activePoint.marker}</p>
            )}
            {activePoint.notes && (
              <p className="mt-1 line-clamp-3 text-slate-600">{activePoint.notes}</p>
            )}
          </div>
        )}
      </div>
    </div>
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

  const skills = skillTemplate
    .map((skill) => ({ skill, points: buildPoints(skill, chronological) }))
    .filter((s) => s.points.length > 0);

  if (skills.length === 0) {
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
        <h2 className="mb-4 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Tren Perkembangan
        </h2>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {skills.map(({ skill, points }) => (
            <SkillRibbon key={skill} skill={skill} points={points} />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
