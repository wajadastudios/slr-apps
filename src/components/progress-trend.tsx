import { GlassCard } from "@/components/ui/glass-card";

type Report = {
  session_date: string;
  session_number: number | null;
  scores: Record<string, number> | null;
};

const WIDTH = 280;
const HEIGHT = 70;
const PAD = 10;

function scoreToY(score: number) {
  // score 1-5 -> y within [HEIGHT - PAD, PAD], higher score = higher up
  return HEIGHT - PAD - ((score - 1) / 4) * (HEIGHT - 2 * PAD);
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

  const skillsWithData = skillTemplate.filter((skill) =>
    chronological.some((r) => typeof r.scores?.[skill] === "number")
  );

  if (skillsWithData.length === 0) {
    return (
      <GlassCard>
        <p className="text-sm text-slate-600">
          Belum ada data skor untuk ditampilkan sebagai tren.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <h2 className="mb-4 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Tren Perkembangan
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {skillsWithData.map((skill) => {
          const points = chronological
            .map((r, i) => ({ i, score: r.scores?.[skill] }))
            .filter(
              (p): p is { i: number; score: number } =>
                typeof p.score === "number"
            );

          const stepX =
            points.length > 1
              ? (WIDTH - 2 * PAD) / (points.length - 1)
              : 0;

          const coords = points.map((p, idx) => ({
            x: PAD + idx * stepX,
            y: scoreToY(p.score),
            score: p.score,
          }));

          const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
          const latest = coords[coords.length - 1];

          return (
            <div key={skill}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-slate-700">{skill}</span>
                <span className="text-sm font-medium text-[#17263D]">
                  {latest.score}/5
                </span>
              </div>
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="w-full overflow-visible"
              >
                {coords.length > 1 && (
                  <polyline
                    points={polyline}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-[#35C5D0]"
                  />
                )}
                {coords.map((c, idx) => (
                  <circle
                    key={idx}
                    cx={c.x}
                    cy={c.y}
                    r={3}
                    className="fill-[#55D6A6]"
                  />
                ))}
              </svg>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
