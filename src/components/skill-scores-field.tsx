"use client";

import { useState } from "react";
import { StarRating } from "@/components/ui/star-rating";

type Row = { name: string; score: number };

// Indicator names are fixed to the program's skill_template (set by admin
// under Admin > Program) so every pelatih scores the same things the same
// way -- a parent comparing sessions or admin comparing pengajar would
// otherwise be looking at incomparable, freely-renamed metrics.
export function SkillScoresField({
  initialSkills,
  fieldName = "scores_json",
}: {
  initialSkills: string[];
  fieldName?: string;
}) {
  const [rows, setRows] = useState<Row[]>(
    initialSkills.map((s) => ({ name: s, score: 3 }))
  );

  function updateRow(i: number, score: number) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, score } : r)));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-800">
        Skor Indikator (1&ndash;5, boleh setengah)
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={row.name}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/30 bg-white/40 px-3 py-2"
          >
            <span className="min-w-[160px] flex-1 text-sm font-medium text-[#17263D]">
              {row.name}
            </span>
            <StarRating
              value={row.score}
              onChange={(v) => updateRow(i, v)}
            />
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-slate-500">
            Program ini belum punya indikator penilaian. Minta admin
            mengaturnya di Admin &rarr; Program.
          </p>
        )}
      </div>
      <input type="hidden" name={fieldName} value={JSON.stringify(rows)} />
    </div>
  );
}
