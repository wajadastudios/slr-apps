// What a star means in the level curriculum. 0 is a real, observed result --
// never "not touched" (a skipped indicator simply has no score).

export const STAR_MEANING: Record<0 | 1 | 2 | 3 | 4 | 5, { label: string; description: string }> = {
  0: { label: "Belum mampu", description: "Sudah diamati, belum mampu sesuai rubrik." },
  1: { label: "Mulai mengenal", description: "Membutuhkan bantuan atau arahan hampir penuh." },
  2: { label: "Mulai melakukan", description: "Masih sering membutuhkan bantuan atau koreksi." },
  3: { label: "Mandiri, belum konsisten", description: "Dapat melakukan secara mandiri, tetapi belum konsisten." },
  4: { label: "Baik dan konsisten", description: "Membutuhkan sedikit koreksi." },
  5: { label: "Sesuai standar", description: "Benar, mandiri, dan konsisten sesuai standar indikator/level." },
};

export const HALF_POINT_NOTE =
  "Setengah poin (mis. 3,5) berarti kemampuan berada di antara dua kategori.";

export function formatStars(score: number): string {
  return String(Math.round(score * 100) / 100).replace(".", ",");
}

// "3,5 — antara Mandiri, belum konsisten dan Baik dan konsisten"
export function starText(score: number): string {
  const s = Math.max(0, Math.min(5, score));
  const low = Math.floor(s) as 0 | 1 | 2 | 3 | 4 | 5;
  if (Number.isInteger(s)) return `${formatStars(s)} — ${STAR_MEANING[low].label}`;
  const high = Math.ceil(s) as 0 | 1 | 2 | 3 | 4 | 5;
  return `${formatStars(s)} — antara “${STAR_MEANING[low].label}” dan “${STAR_MEANING[high].label}”`;
}
