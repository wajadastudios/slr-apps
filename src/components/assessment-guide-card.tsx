"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import { activeGroups, type IndicatorConfig } from "@/lib/indicators";

export function AssessmentGuideCard({ indicatorConfig }: { indicatorConfig: IndicatorConfig }) {
  const groups = activeGroups(indicatorConfig).map((g) => ({
    category: g.name,
    skills: g.indicators.map((i) => i.label),
  }));
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
            Panduan Penilaian Perkembangan
          </span>
        }
      >
        <div className="flex flex-col gap-4 px-6 pb-6 pt-1 text-sm text-slate-700">
          <div>
            <p className="mb-1 font-semibold text-[#17263D]">
              Dua jenis bukti perkembangan
            </p>
            <p>
              <span className="font-medium">Skor Indikator</span> menilai penguasaan
              tiap gerakan/teknik (skala 0&ndash;5, lihat &quot;Arti Skor Bintang&quot; di
              bawah) berdasarkan penilaian pengajar tiap sesi.{" "}
              <span className="font-medium">Rekor Performa</span> mencatat angka
              konkret &mdash; waktu tempuh, jarak, tahan nafas, dan treading water &mdash;
              yang bisa dibandingkan dari waktu ke waktu.
            </p>
          </div>

          <div>
            <p className="mb-1 font-semibold text-[#17263D]">
              Usia bukan patokan naik level
            </p>
            <p>
              Usia anak ditampilkan sebagai informasi saja. Kenaikan skor murni
              berdasarkan pencapaian indikator dan rekor &mdash; setiap anak
              berkembang dengan kecepatannya sendiri.
            </p>
          </div>

          {groups.length > 0 && (
            <div>
              <p className="mb-2 font-semibold text-[#17263D]">
                Indikator penilaian untuk program ini
              </p>
              <div className="flex flex-col gap-3">
                {groups.map((group) => (
                  <div key={group.category}>
                    <p className="font-medium text-[#17263D]">{group.category}</p>
                    <ul className="mt-1 list-inside list-disc text-slate-600">
                      {group.skills.map((skill) => (
                        <li key={skill}>{skill}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccordionItem>
    </GlassCard>
  );
}
