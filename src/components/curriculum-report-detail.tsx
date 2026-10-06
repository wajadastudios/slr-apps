import { StarRating } from "@/components/ui/star-rating";
import { coverageLabel, techniqueSummary } from "@/lib/curriculum/summary";
import { checkTarget, formatMeasure, targetOf } from "@/lib/curriculum/results";
import { formatStars } from "@/lib/curriculum/stars";
import { levelLabel, type AssessmentContext, type CurriculumData, type Level } from "@/lib/curriculum/types";
import { isLevel } from "@/lib/curriculum/types";

// What one saved report said, skill by skill: the level it was written at, only
// the indicators that were really assessed (the rest are simply not listed),
// "tidak berlaku" with its reason, and the tests recorded that day. Used by the
// pengajar's history and by the parent's report card.
export function CurriculumReportDetail({
  data,
  report,
}: {
  data: CurriculumData;
  report: { id: string; scores: Record<string, number>; context: AssessmentContext };
}) {
  const skills = [...data.skills]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(
      (s) =>
        report.context.skills?.[s.id] !== undefined ||
        data.indicators.some((i) => i.skillId === s.id && typeof report.scores[i.key] === "number")
    );
  if (skills.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-3">
      {skills.map((skill) => {
        const lv = report.context.skills?.[skill.id]?.level;
        const level: Level | null = isLevel(lv) ? lv : null;
        const own = data.indicators
          .filter((i) => i.skillId === skill.id && i.level === level)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const assessed = own.filter((i) => typeof report.scores[i.key] === "number");
        const na = own.filter((i) => report.context.na?.[i.key]);
        const summary = techniqueSummary(data.indicators, skill.id, level, report);
        const results = data.results.filter(
          (r) => r.reportId === report.id && data.testTypes.find((t) => t.id === r.testTypeId)?.skillId === skill.id
        );

        return (
          <section key={skill.id} className="rounded-xl border border-[#35C5D0]/25 bg-[#EEF9FB]/60 px-3 py-2.5" aria-label={skill.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#17263D]">
                {skill.name}
                {level !== null && <span className="ml-2 rounded-full bg-[#DDF3F6] px-2 py-0.5 text-[11px] font-semibold text-[#0B6470]">{levelLabel(level)}</span>}
              </p>
              {summary.percent !== null && (
                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-[#17263D]">Ringkasan penilaian {summary.percent}%</span> &middot; {coverageLabel(summary)}
                </p>
              )}
            </div>

            {assessed.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {assessed.map((i) => (
                  <li key={i.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">{i.label}</span>
                    <span className="flex items-center gap-1.5">
                      <StarRating value={report.scores[i.key]} size={14} />
                      <span className="w-8 text-right text-[11px] text-slate-500">{formatStars(report.scores[i.key])}/5</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {na.length > 0 && (
              <ul className="mt-1.5 text-xs text-slate-500">
                {na.map((i) => (
                  <li key={i.key}>
                    {i.label}: tidak berlaku ({report.context.na![i.key]})
                  </li>
                ))}
              </ul>
            )}

            {results.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 border-t border-white/60 pt-2">
                {results.map((r) => {
                  const type = data.testTypes.find((t) => t.id === r.testTypeId)!;
                  const check = checkTarget(r, type, targetOf(r, data.targets));
                  return (
                    <li key={r.id} className="text-xs text-slate-700">
                      <span className="font-semibold text-[#17263D]">{type.label}:</span> {formatMeasure(r, type)}
                      {r.assisted ? " (dengan bantuan/alat)" : ""}
                      {r.validation !== "divalidasi" ? ` · ${r.validation === "tidak_valid" ? "tidak valid" : "belum divalidasi"}` : ""}
                      {targetOf(r, data.targets) && (
                        <span className={check.met ? " font-medium text-[#1a8f6f]" : " text-slate-500"}> &middot; {check.met ? "target standar tercapai" : "target standar belum tercapai"}</span>
                      )}
                      {r.notes ? <span className="block text-slate-500">{r.notes}</span> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
