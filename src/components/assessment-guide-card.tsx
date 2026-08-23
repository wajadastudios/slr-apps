import { GlassCard } from "@/components/ui/glass-card";

const LEVELS: { name: string; milestones: string[] }[] = [
  {
    name: "Dasar 1 — Pengenalan Air",
    milestones: [
      "Masuk & keluar kolam dengan aman",
      "Nyaman disiram air dari atas kepala",
      "Meluncur di dinding kolam",
    ],
  },
  {
    name: "Dasar 2 — Kenyamanan & Apung",
    milestones: [
      "Meniup gelembung 3x berturut, wajah terendam",
      "Mengapung telentang dengan bantuan",
      "Menendang 5 meter tanpa alat bantu",
    ],
  },
  {
    name: "Menengah — Gerak Dasar",
    milestones: [
      "Meluncur & berenang 10 meter (gaya bebas dasar)",
      "Menyelam mengambil benda di dasar kolam",
      "Mengapung posisi tuck selama 3 detik",
    ],
  },
  {
    name: "Mahir — Teknik & Ketahanan",
    milestones: [
      "Berenang 25 meter gaya bebas dengan nafas berirama",
      "Menguasai minimal 2 gaya (bebas, dada, punggung, atau kupu-kupu)",
      "Treading water (mengapung berdiri) 30 detik",
    ],
  },
];

export function AssessmentGuideCard() {
  return (
    <GlassCard>
      <details>
        <summary className="cursor-pointer font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Panduan Penilaian Perkembangan
        </summary>
        <div className="mt-4 flex flex-col gap-4 text-sm text-slate-700">
          <div>
            <p className="mb-1 font-semibold text-[#17263D]">
              Dua jenis bukti perkembangan
            </p>
            <p>
              <span className="font-medium">Skill Progress</span> menilai penguasaan
              teknik (0&ndash;100%) berdasarkan penilaian pelatih tiap sesi.{" "}
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
              Usia anak ditampilkan sebagai informasi saja. Kenaikan level murni
              berdasarkan pencapaian skill dan rekor &mdash; setiap anak berkembang
              dengan kecepatannya sendiri.
            </p>
          </div>

          <div>
            <p className="mb-2 font-semibold text-[#17263D]">
              Tahapan level (gambaran umum)
            </p>
            <div className="flex flex-col gap-3">
              {LEVELS.map((level) => (
                <div key={level.name}>
                  <p className="font-medium text-[#17263D]">{level.name}</p>
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    {level.milestones.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>
    </GlassCard>
  );
}
