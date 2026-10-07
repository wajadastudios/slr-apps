import type { SeriesSegment } from "@/lib/curriculum/summary";
import type { AbilitySeries } from "@/lib/curriculum/series";
import { levelLabel } from "@/lib/curriculum/types";
import { formatShortDate } from "@/lib/format-date";

// a narrow canvas so text stays readable when the chart shrinks to a phone
const W = 480;
const H = 240;
const M = { l: 42, r: 24, t: 40, b: 46 };
const PLOT_W = W - M.l - M.r;
const PLOT_H = H - M.t - M.b;
const TEAL = "#1597A3";
const INK = "#17263D";
const MUTED = "#64748B";
const LEGACY = "#6B7FA3";

const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Axis dates drop the year when every point is in the same year (the full
// date stays in each point's tooltip).
function axisDates(dates: string[]): (d: string) => string {
  const years = new Set(dates.map((d) => d.slice(0, 4)));
  return (d) => (years.size === 1 ? formatShortDate(d).replace(/ \d{4}$/, "") : formatShortDate(d));
}

// 1/2/5 steps so the distance axis reads 0, 10, 20, 30 instead of 7,3 / 14,5.
function niceScale(max: number): { top: number; ticks: number[] } {
  const target = Math.max(1, max * 1.1);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((st) => Math.ceil(target / st) <= 5) ?? 1000;
  const top = Math.ceil(target / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

// which date labels fit: always the first and last, and evenly spaced ones between
function showTick(i: number, count: number): boolean {
  const step = Math.max(1, Math.ceil(count / 6));
  return i === 0 || i === count - 1 || (i % step === 0 && i >= step && count - 1 - i >= step);
}

function xAt(i: number, count: number): number {
  return count <= 1 ? M.l + PLOT_W / 2 : M.l + (PLOT_W * i) / (count - 1);
}

// One legend, shared by every technique chart that wants it.
export function TechniqueLegend({ segments }: { segments: SeriesSegment[] }) {
  const flat = segments.flatMap((seg) => seg.points.map((p) => ({ ...p, legacy: seg.legacy === true })));
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <svg width="12" height="12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill={TEAL} />
        </svg>
        penilaian lengkap
      </span>
      {flat.some((p) => !p.complete) && (
        <span className="inline-flex items-center gap-1">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" fill="#fff" stroke={TEAL} strokeWidth="1.8" strokeDasharray="2.5 2" />
          </svg>
          penilaian sebagian (tidak dihubungkan)
        </span>
      )}
      {flat.some((p) => p.legacy) && (
        <span className="inline-flex items-center gap-1">
          <svg width="12" height="12" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" fill={LEGACY} />
          </svg>
          riwayat sebelum pembaruan kurikulum
        </span>
      )}
      <span>Skor bisa turun; titik baru hanya ada bila ada penilaian baru.</span>
    </p>
  );
}

// ---------- technique ("Ringkasan penilaian") ----------
// X = assessment date, Y = 0-100. A point exists only for a session that really
// assessed something; points are never added for sessions without an
// assessment, the line never crosses a level change (a new rubric starts a new
// segment, "Mulai Level 2"), and a partial assessment is a hollow marker that
// is not joined to its neighbours -- it covers fewer indicators, so it is not
// comparable.
export function TechniqueChart({ segments, name, legend = true }: { segments: SeriesSegment[]; name: string; legend?: boolean }) {
  const flat = segments.flatMap((seg, s) => seg.points.map((p, i) => ({ ...p, legacy: seg.legacy === true, seg: s, first: i === 0 })));
  if (flat.length === 0) return null;
  const y = (pct: number) => M.t + PLOT_H * (1 - pct / 100);
  const axis = axisDates(flat.map((p) => p.date));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Grafik ringkasan penilaian ${name}: ${flat.map((p) => `${formatShortDate(p.date)} ${p.percent}%${p.complete ? "" : " (parsial)"}`).join(", ")}`}
        className="h-auto w-full"
      >
        <text x={M.l} y={16} fontSize="12" fill={MUTED}>
          Ringkasan penilaian (%)
        </text>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={M.l} x2={W - M.r} y1={y(g)} y2={y(g)} stroke="#CBD5E1" strokeWidth={g === 0 ? 1.2 : 0.6} strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={M.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill={MUTED}>
              {g}
            </text>
          </g>
        ))}

        {flat.map((p, i) => {
          const prev = flat[i - 1];
          const x = xAt(i, flat.length);
          const join = prev && prev.seg === p.seg && prev.complete && p.complete;
          const color = p.legacy ? LEGACY : TEAL;
          return (
            <g key={`${p.reportId}-${p.level ?? 0}`}>
              {p.first && (i > 0 || p.legacy) && (
                <g>
                  {i > 0 && <line x1={x} x2={x} y1={M.t} y2={M.t + PLOT_H} stroke="#94A3B8" strokeDasharray="2 4" />}
                  <text
                    x={i > 0 ? (x > W * 0.6 ? x - 4 : x + 4) : x - 4}
                    textAnchor={i > 0 && x > W * 0.6 ? "end" : "start"}
                    y={M.t - 8}
                    fontSize="11"
                    fontWeight="600"
                    fill={INK}
                  >
                    {p.legacy
                      ? p.level
                        ? `Sebelum pembaruan \u00b7 L${p.level}`
                        : "Sebelum pembaruan"
                      : p.level
                        ? `Mulai ${levelLabel(p.level).split(" \u2014 ")[0]}`
                        : "Mulai kurikulum baru"}
                  </text>
                </g>
              )}
              {join && <line x1={xAt(i - 1, flat.length)} y1={y(prev.percent)} x2={x} y2={y(p.percent)} stroke={color} strokeWidth={2.5} />}
              {p.legacy ? (
                p.complete ? (
                  <rect x={x - 4.5} y={y(p.percent) - 4.5} width={9} height={9} fill={LEGACY}>
                    <title>{`${formatShortDate(p.date)}: ${p.percent}% (${p.assessed}/${p.required} indikator) \u2014 riwayat sebelum pembaruan kurikulum`}</title>
                  </rect>
                ) : (
                  <rect x={x - 5} y={y(p.percent) - 5} width={10} height={10} fill="#fff" stroke={LEGACY} strokeWidth={2} strokeDasharray="2.5 2">
                    <title>{`${formatShortDate(p.date)}: ${p.percent}% \u2014 sebagian indikator (${p.assessed}/${p.required}), riwayat sebelum pembaruan kurikulum`}</title>
                  </rect>
                )
              ) : p.complete ? (
                <circle cx={x} cy={y(p.percent)} r={5} fill={TEAL}>
                  <title>{`${formatShortDate(p.date)}: ${p.percent}% (${p.assessed}/${p.required} indikator)`}</title>
                </circle>
              ) : (
                <circle cx={x} cy={y(p.percent)} r={5.5} fill="#fff" stroke={TEAL} strokeWidth={2} strokeDasharray="2.5 2">
                  <title>{`${formatShortDate(p.date)}: ${p.percent}% — penilaian parsial (${p.assessed}/${p.required} indikator), tidak dihubungkan`}</title>
                </circle>
              )}
              <text x={x} y={y(p.percent) - 10} textAnchor="middle" fontSize="11" fill={INK}>
                {p.percent}
              </text>
              {showTick(i, flat.length) && (
                <text x={x} y={H - 24} textAnchor={i === 0 ? "start" : i === flat.length - 1 ? "end" : "middle"} fontSize="11" fill={MUTED}>
                  {axis(p.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {legend && <TechniqueLegend segments={segments} />}
    </figure>
  );
}

// ---------- real ability (distance / duration) ----------
export function AbilityChart({ series, name }: { series: AbilitySeries; name: string }) {
  const { points, target, unit } = series;
  const maxValue = Math.max(...points.map((p) => p.value), target?.value ?? 0);
  const { top, ticks } = niceScale(maxValue);
  const y = (v: number) => M.t + PLOT_H * (1 - v / top);
  const axis = axisDates(points.map((p) => p.date));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Grafik ${name} dalam ${unit === "m" ? "meter" : "detik"}: ${points
          .map((p) => `${formatShortDate(p.date)} ${num(p.value)} ${unit}${p.assisted ? " dengan bantuan" : ""}`)
          .join(", ")}${target ? `. Target ${num(target.value)} ${unit}` : ""}`}
        className="h-auto w-full"
      >
        <text x={M.l} y={16} fontSize="12" fill={MUTED}>
          {unit === "m" ? "Jarak (meter)" : "Durasi (detik)"}
        </text>
        {ticks.map((g) => (
          <g key={g}>
            <line x1={M.l} x2={W - M.r} y1={y(g)} y2={y(g)} stroke="#CBD5E1" strokeWidth={g === 0 ? 1.2 : 0.6} strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={M.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill={MUTED}>
              {num(g)}
            </text>
          </g>
        ))}

        {target && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={y(target.value)} y2={y(target.value)} stroke="#D97706" strokeWidth={1.6} strokeDasharray="6 4" />
            <text x={W - M.r} y={y(target.value) - 5} textAnchor="end" fontSize="11" fontWeight="600" fill="#B45309">
              {`Target ${num(target.value)} ${unit}${target.level ? ` (${levelLabel(target.level).split(" — ")[0]})` : ""}`}
            </text>
          </g>
        )}

        {points.map((p, i) => {
          const x = xAt(i, points.length);
          // the line only joins validated results done without help
          const prevIdx = (() => {
            for (let k = i - 1; k >= 0; k--) if (points[k].valid && !points[k].assisted) return k;
            return -1;
          })();
          const joins = p.valid && !p.assisted && prevIdx >= 0;
          return (
            <g key={p.resultId}>
              {joins && <line x1={xAt(prevIdx, points.length)} y1={y(points[prevIdx].value)} x2={x} y2={y(p.value)} stroke={TEAL} strokeWidth={2.5} />}
              {p.assisted ? (
                <rect x={x - 5} y={y(p.value) - 5} width={10} height={10} fill="#fff" stroke="#7C3AED" strokeWidth={2}>
                  <title>{`${formatShortDate(p.date)}: ${num(p.value)} ${unit} dengan bantuan/alat (tidak membuka target atau rekor)`}</title>
                </rect>
              ) : p.valid ? (
                <circle cx={x} cy={y(p.value)} r={5} fill={TEAL}>
                  <title>{`${formatShortDate(p.date)}: ${num(p.value)} ${unit}`}</title>
                </circle>
              ) : (
                <circle cx={x} cy={y(p.value)} r={4.5} fill="#E2E8F0" stroke="#94A3B8" strokeWidth={1.5}>
                  <title>{`${formatShortDate(p.date)}: ${num(p.value)} ${unit} (belum divalidasi / kondisi tidak sebanding)`}</title>
                </circle>
              )}
              {p.isRecord && <circle cx={x} cy={y(p.value)} r={9} fill="none" stroke="#D97706" strokeWidth={2} />}
              <text x={x} y={y(p.value) - 13} textAnchor="middle" fontSize="11" fill={INK}>
                {num(p.value)}
              </text>
              {showTick(i, points.length) && (
                <text x={x} y={H - 24} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="11" fill={MUTED}>
                  {axis(p.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="6" fill="none" stroke="#D97706" strokeWidth="1.8" />
            <circle cx="7" cy="7" r="3.5" fill={TEAL} />
          </svg>
          rekor pribadi
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="12" height="12" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" fill="#fff" stroke="#7C3AED" strokeWidth="1.8" />
          </svg>
          dengan bantuan/alat (dipisah)
        </span>
        <span>Hasil di bawah target tetap dicatat dan dihargai sebagai kemajuan.</span>
      </figcaption>
    </figure>
  );
}
