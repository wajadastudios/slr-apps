"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import { StarRating } from "@/components/ui/star-rating";
import { SCORE_LABELS } from "@/lib/report-summary";

const DESCRIPTIONS = [
  "Belum mampu atau belum berani mencoba gerakan ini sama sekali.",
  "Sudah mau mencoba, tapi masih sangat bergantung pada bantuan pengajar.",
  "Bisa melakukan dengan bantuan, belum konsisten kalau dilepas sendiri.",
  "Bisa melakukan sendiri, tekniknya masih perlu banyak diperbaiki.",
  "Bisa melakukan sendiri dengan teknik yang sudah cukup rapi.",
  "Menguasai penuh, konsisten, dan mandiri tanpa bantuan.",
];

// Collapsed by default: it is a reference, not something to scroll past.
export function StarScoreLegend() {
  const [open, setOpen] = useState(false);

  return (
    <GlassCard className="!p-0">
      <AccordionItem
        variant="ortu"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="rounded-3xl"
        headerClassName="min-h-16 rounded-3xl px-6 py-3"
        header={
          <span className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            Arti Skor Bintang
          </span>
        }
      >
        <div className="px-6 pb-6 pt-1">
          <p className="mb-4 text-sm text-slate-600">
            Setiap indikator dinilai pengajar dengan skala 0&ndash;5 berikut ini (boleh setengah,
            misalnya 2,5):
          </p>
          <div className="flex flex-col gap-2.5">
            {SCORE_LABELS.map((label, score) => (
              <div key={score} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StarRating value={score} size={16} className="shrink-0" />
                <span className="font-medium text-[#17263D]">
                  {score} &mdash; {label}
                </span>
                <span className="text-sm text-slate-600">{DESCRIPTIONS[score]}</span>
              </div>
            ))}
          </div>
        </div>
      </AccordionItem>
    </GlassCard>
  );
}
