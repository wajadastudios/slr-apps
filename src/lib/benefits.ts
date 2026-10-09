// Benefits of a package are stored as plain text lines. Some were typed with
// their own bullet or asterisk ("*belum termasuk tiket"), which the list would
// then show twice, so every line is tidied before it is displayed.

const LEADING_MARK = /^[\s•·●▪\-–—*]+/;

export function cleanBenefits(raw: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const item of raw ?? []) {
    if (typeof item !== "string") continue;
    const text = item.replace(LEADING_MARK, "").replace(/\s+/g, " ").trim();
    if (text) out.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  return out;
}
