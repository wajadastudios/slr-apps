import { METRIC_TYPES, strokeOptions, type MetricType } from "@/lib/performance";

export type RecordInput = {
  metric_type: MetricType;
  stroke: string | null;
  distance_m: number | null;
  duration_seconds: number | null;
  recorded_at: string;
};

export type RecordParse =
  | { ok: true; value: RecordInput }
  | { ok: false; error: string };

function positive(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

// Same rules for the pengajar form, the edit dialog and the admin form:
//  waktu_tempuh  -> gaya + jarak target (m) + waktu (detik)
//  jarak_tempuh  -> gaya/teknik + jarak tercapai (m)
//  tahan_nafas / treading_water / mengapung_telentang -> durasi (detik)
export function parseRecordInput(raw: {
  metric_type?: unknown;
  stroke?: unknown;
  distance_m?: unknown;
  duration_seconds?: unknown;
  recorded_at?: unknown;
}): RecordParse {
  const metric = String(raw.metric_type ?? "");
  if (!(METRIC_TYPES as readonly string[]).includes(metric)) {
    return { ok: false, error: "Jenis rekor tidak valid." };
  }
  const metric_type = metric as MetricType;

  const recorded_at = String(raw.recorded_at ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recorded_at) || Number.isNaN(Date.parse(recorded_at))) {
    return { ok: false, error: "Tanggal pencatatan tidak valid." };
  }

  const strokeRaw = String(raw.stroke ?? "");
  const strokeValid = strokeOptions(metric_type).includes(strokeRaw);
  const distance = positive(raw.distance_m);
  const duration = positive(raw.duration_seconds);

  switch (metric_type) {
    case "waktu_tempuh":
      if (!strokeValid) return { ok: false, error: "Pilih gaya renang untuk waktu tempuh." };
      if (distance === null) return { ok: false, error: "Isi jarak (meter) dengan angka lebih dari 0." };
      if (duration === null) return { ok: false, error: "Isi waktu tempuh (detik) dengan angka lebih dari 0." };
      return { ok: true, value: { metric_type, stroke: strokeRaw, distance_m: distance, duration_seconds: duration, recorded_at } };
    case "jarak_tempuh":
      if (!strokeValid) return { ok: false, error: "Pilih gaya atau teknik untuk jarak tempuh." };
      if (distance === null) return { ok: false, error: "Isi jarak (meter) dengan angka lebih dari 0." };
      return { ok: true, value: { metric_type, stroke: strokeRaw, distance_m: distance, duration_seconds: null, recorded_at } };
    case "tahan_nafas":
    case "treading_water":
    case "mengapung_telentang":
      if (duration === null) return { ok: false, error: "Isi durasi (detik) dengan angka lebih dari 0." };
      return { ok: true, value: { metric_type, stroke: null, distance_m: null, duration_seconds: duration, recorded_at } };
  }
}

export type MilestoneInput = {
  label: string;
  level: string;
  metric_type: MetricType;
  stroke: string | null;
  distance_m: number | null;
  bronze: number;
  silver: number;
  gold: number;
};

// Time milestones improve downward (bronze slowest -> gold fastest); the rest
// improve upward. Tiers must be strictly ordered so a value maps to one tier.
export function parseMilestoneInput(raw: {
  label?: unknown;
  level?: unknown;
  metric_type?: unknown;
  stroke?: unknown;
  distance_m?: unknown;
  bronze?: unknown;
  silver?: unknown;
  gold?: unknown;
}): { ok: true; value: MilestoneInput } | { ok: false; error: string } {
  const label = String(raw.label ?? "").trim();
  if (!label) return { ok: false, error: "Nama milestone wajib diisi." };
  const level = String(raw.level ?? "").trim() || "Umum";

  const metric = String(raw.metric_type ?? "");
  if (!(METRIC_TYPES as readonly string[]).includes(metric)) {
    return { ok: false, error: "Jenis metrik tidak valid." };
  }
  const metric_type = metric as MetricType;

  const strokeRaw = String(raw.stroke ?? "");
  const strokeValid = strokeOptions(metric_type).includes(strokeRaw);
  const usesStroke = metric_type === "waktu_tempuh" || metric_type === "jarak_tempuh";
  if (usesStroke && !strokeValid) {
    return {
      ok: false,
      error:
        metric_type === "waktu_tempuh"
          ? "Pilih gaya renang untuk milestone waktu tempuh."
          : "Pilih gaya atau teknik untuk milestone jarak tempuh.",
    };
  }

  const distance = positive(raw.distance_m);
  if (metric_type === "waktu_tempuh" && distance === null) {
    return { ok: false, error: "Isi jarak (meter) untuk milestone waktu tempuh." };
  }

  const bronze = positive(raw.bronze);
  const silver = positive(raw.silver);
  const gold = positive(raw.gold);
  if (bronze === null || silver === null || gold === null) {
    return {
      ok: false,
      error: "Target perunggu, perak, dan emas wajib diisi dengan angka lebih dari 0.",
    };
  }
  const ordered =
    metric_type === "waktu_tempuh" ? bronze > silver && silver > gold : bronze < silver && silver < gold;
  if (!ordered) {
    return {
      ok: false,
      error:
        metric_type === "waktu_tempuh"
          ? "Untuk waktu tempuh, target harus makin cepat: perunggu > perak > emas (detik)."
          : "Target harus makin tinggi: perunggu < perak < emas.",
    };
  }

  return {
    ok: true,
    value: {
      label,
      level,
      metric_type,
      stroke: usesStroke ? strokeRaw : null,
      distance_m: metric_type === "waktu_tempuh" ? distance : null,
      bronze,
      silver,
      gold,
    },
  };
}
