import { activeKeys, type IndicatorConfig } from "@/lib/indicators";
import { allowsHalfPoints, maxScoreFor, type AssessmentType } from "@/lib/programs";

// Turns the posted scores_json into {indicator key: value}. Only keys the
// pengajar is allowed to score are kept, and each value is clamped to the
// scale of the program (0-5 in halves, or a whole level of a support /
// observation scale).
export function parseScoresPayload(
  raw: string,
  allowedKeys: Set<string>,
  type: AssessmentType
): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    parsed = [];
  }

  const max = maxScoreFor(type);
  const scores: Record<string, number> = {};
  if (!Array.isArray(parsed)) return scores;

  for (const item of parsed.slice(0, 60)) {
    if (!item || typeof item !== "object") continue;
    const key = String((item as { name?: unknown }).name ?? "").trim();
    if (!key || !allowedKeys.has(key)) continue;
    const value = Number((item as { score?: unknown }).score);
    if (!Number.isFinite(value)) continue;
    const rounded = allowsHalfPoints(type) ? Math.round(value * 2) / 2 : Math.round(value);
    scores[key] = Math.min(max, Math.max(0, rounded));
  }
  return scores;
}

// A missed session (izin / sakit) records nothing about what the participant
// can do, so it never carries scores or performance records.
export function sessionAllowsAssessment(attendance: string): boolean {
  return attendance === "hadir";
}

// The keys a report may score when it is written: active indicators of the
// program's current template. (Editing keeps keys it already scored too.)
export function scorableKeys(config: IndicatorConfig, alsoKeys: string[] = []): Set<string> {
  return new Set([...activeKeys(config), ...alsoKeys]);
}
