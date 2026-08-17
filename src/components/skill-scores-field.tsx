"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { StarRating } from "@/components/ui/star-rating";

type Row = { name: string; score: number };

export function SkillScoresField({
  initialSkills,
  fieldName = "scores_json",
}: {
  initialSkills: string[];
  fieldName?: string;
}) {
  const [rows, setRows] = useState<Row[]>(
    initialSkills.length > 0
      ? initialSkills.map((s) => ({ name: s, score: 3 }))
      : [{ name: "", score: 3 }]
  );

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addRow() {
    setRows((prev) => [...prev, { name: "", score: 3 }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-800">
        Skor Indikator (1&ndash;5, boleh setengah)
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/30 bg-white/40 px-3 py-2"
          >
            <GlassInput
              value={row.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
              placeholder="Nama indikator"
              className="min-w-[160px] flex-1"
            />
            <StarRating
              value={row.score}
              onChange={(v) => updateRow(i, { score: v })}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Hapus
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-slate-500">Belum ada indikator.</p>
        )}
      </div>
      <GlassButton
        type="button"
        onClick={addRow}
        className="w-fit px-4 py-2 text-sm"
      >
        + Tambah Indikator
      </GlassButton>
      <input type="hidden" name={fieldName} value={JSON.stringify(rows)} />
    </div>
  );
}
