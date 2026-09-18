import { GlassCard } from "@/components/ui/glass-card";
import { StarRating } from "@/components/ui/star-rating";

const LEVELS: { score: number; label: string; description: string }[] = [
  {
    score: 0,
    label: "Belum bisa",
    description: "Belum mampu atau belum berani mencoba gerakan ini sama sekali.",
  },
  {
    score: 1,
    label: "Baru mencoba",
    description: "Sudah mau mencoba, tapi masih sangat bergantung pada bantuan pengajar.",
  },
  {
    score: 2,
    label: "Cukup baik",
    description: "Bisa melakukan dengan bantuan, belum konsisten kalau dilepas sendiri.",
  },
  {
    score: 3,
    label: "Baik",
    description: "Bisa melakukan sendiri, tekniknya masih perlu banyak diperbaiki.",
  },
  {
    score: 4,
    label: "Sangat baik",
    description: "Bisa melakukan sendiri dengan teknik yang sudah cukup rapi.",
  },
  {
    score: 5,
    label: "Mahir",
    description: "Menguasai penuh, konsisten, dan mandiri tanpa bantuan.",
  },
];

export function StarScoreLegend() {
  return (
    <GlassCard>
      <h2 className="mb-1 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Arti Skor Bintang
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        Setiap indikator dinilai pengajar dengan skala 0&ndash;5 berikut ini
        (boleh setengah, misalnya 2.5):
      </p>
      <div className="flex flex-col gap-2.5">
        {LEVELS.map((level) => (
          <div
            key={level.score}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <StarRating value={level.score} size={16} className="shrink-0" />
            <span className="font-medium text-[#17263D]">
              {level.score} &mdash; {level.label}
            </span>
            <span className="text-sm text-slate-600">{level.description}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
