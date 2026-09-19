// Display-only clean-up of known typos in admin-entered indicator names
// (e.g. "Gaya Daya" for "Gaya Dada"). The stored names are left untouched --
// scores are keyed by them -- so this must only be applied when rendering.
const FIXES: [RegExp, string][] = [
  [/Kupu\s*-\s*Kupu/g, "Kupu-Kupu"],
  [/^Gaya Daya\b/, "Gaya Dada"],
  [/Pernapasaran/g, "Pernapasan"],
];

export function formatSkillName(name: string): string {
  return FIXES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), name);
}
