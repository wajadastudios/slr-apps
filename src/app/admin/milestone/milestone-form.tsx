"use client";

import { useState } from "react";
import { ToastForm } from "@/components/ui/toast-form";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { PRIMARY_BUTTON } from "@/lib/ui-classes";
import {
  METRIC_LABELS,
  METRIC_TYPES,
  strokeFieldLabel,
  strokeOptions,
  usesStroke,
  type MetricType,
} from "@/lib/performance";
import { isSupervisedOnly, type Milestone } from "@/lib/milestones";
import type { ActionState } from "@/lib/action-result";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const UNIT: Record<MetricType, string> = {
  waktu_tempuh: "detik (makin kecil makin baik)",
  jarak_tempuh: "meter",
  tahan_nafas: "detik",
  treading_water: "detik",
  mengapung_telentang: "detik",
};

type Values = {
  label: string;
  level: string;
  metric_type: MetricType;
  stroke: string;
  distance_m: string;
  bronze: string;
  silver: string;
  gold: string;
};

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));

function initialValues(m?: Milestone): Values {
  const metric_type = m?.metric_type ?? "waktu_tempuh";
  return {
    label: m?.label ?? "",
    level: m?.level ?? "",
    metric_type,
    stroke: m?.stroke ?? strokeOptions(metric_type)[0] ?? "",
    distance_m: m ? str(m.distance_m) : "25",
    bronze: str(m?.bronze),
    silver: str(m?.silver),
    gold: str(m?.gold),
  };
}

function isDirty(a: Values, b: Values) {
  return (Object.keys(a) as (keyof Values)[]).some((k) => a[k] !== b[k]);
}

// Editor for one milestone (or a blank one). Fully controlled so the parent
// can be told when there are unsaved changes; the parent remounts it (via
// key) after a save or a discard.
export function MilestoneForm({
  action,
  milestone,
  definitionLocked = false,
  levels,
  submitLabel,
  onDirtyChange,
  onCancel,
}: {
  action: Action;
  milestone?: Milestone;
  // Metric/gaya/jarak can't change once the milestone has produced badges.
  definitionLocked?: boolean;
  levels: string[];
  submitLabel: string;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel?: () => void;
}) {
  const [initial] = useState(() => initialValues(milestone));
  const [values, setValues] = useState<Values>(initial);
  const dirty = isDirty(values, initial);

  const metric = values.metric_type;
  const showStroke = usesStroke(metric);
  const showDistance = metric === "waktu_tempuh";

  function update(patch: Partial<Values>) {
    const next = { ...values, ...patch };
    setValues(next);
    onDirtyChange?.(isDirty(next, initial));
  }

  function changeMetric(next: MetricType) {
    update({
      metric_type: next,
      stroke: strokeOptions(next)[0] ?? "",
      distance_m: next === "waktu_tempuh" ? values.distance_m || "25" : "",
    });
  }

  const listId = `levels-${milestone?.id ?? "new"}`;
  const locked = "rounded-2xl bg-white/40 px-4 py-2.5 text-sm text-slate-700";

  return (
    <ToastForm action={action} className="flex flex-col gap-4">
      {milestone && <input type="hidden" name="id" value={milestone.id} />}
      {/* the (possibly locked) definition always travels with the form */}
      <input type="hidden" name="metric_type" value={values.metric_type} />
      <input type="hidden" name="stroke" value={showStroke ? values.stroke : ""} />
      <input type="hidden" name="distance_m" value={showDistance ? values.distance_m : ""} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600" htmlFor={`${listId}-label`}>
            Nama milestone
          </label>
          <GlassInput
            id={`${listId}-label`}
            value={values.label}
            onChange={(e) => update({ label: e.target.value })}
            required
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600" htmlFor={`${listId}-level`}>
            Kategori / jenjang
          </label>
          <GlassInput
            id={`${listId}-level`}
            list={listId}
            name="level"
            value={values.level}
            onChange={(e) => update({ level: e.target.value })}
            placeholder="Contoh: Dasar, Menengah, Mahir"
            className="text-sm"
          />
          <datalist id={listId}>
            {levels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
      </div>
      <input type="hidden" name="label" value={values.label} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">Jenis metrik</label>
          {definitionLocked ? (
            <p className={locked}>{METRIC_LABELS[metric]}</p>
          ) : (
            <GlassSelect
              value={metric}
              onChange={(e) => changeMetric(e.target.value as MetricType)}
              className="text-sm"
            >
              {METRIC_TYPES.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </GlassSelect>
          )}
        </div>

        {showStroke && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">{strokeFieldLabel(metric)}</label>
            {definitionLocked ? (
              <p className={locked}>{values.stroke || "-"}</p>
            ) : (
              <GlassSelect
                value={values.stroke}
                onChange={(e) => update({ stroke: e.target.value })}
                className="text-sm"
              >
                {strokeOptions(metric).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </GlassSelect>
            )}
          </div>
        )}

        {showDistance && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Jarak (m)</label>
            {definitionLocked ? (
              <p className={locked}>{values.distance_m} m</p>
            ) : (
              <GlassInput
                type="number"
                min={1}
                step="any"
                value={values.distance_m}
                onChange={(e) => update({ distance_m: e.target.value })}
                className="text-sm"
              />
            )}
          </div>
        )}
      </div>

      {definitionLocked && (
        <p className="-mt-2 text-xs text-slate-500">
          Metrik, gaya, dan jarak terkunci karena milestone ini sudah menghasilkan lencana.
        </p>
      )}
      {isSupervisedOnly(metric) && (
        <p className="-mt-2 text-xs text-slate-500">
          Tahan nafas hanya boleh dinilai pengajar dalam sesi yang terawasi &mdash; hindari teks
          yang mengajak anak berlatih sendiri atau berlomba.
        </p>
      )}

      <div>
        <p className="mb-1 text-xs text-slate-600">Target per lencana &mdash; satuan: {UNIT[metric]}</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["bronze", "🥉 Perunggu"],
              ["silver", "🥈 Perak"],
              ["gold", "🥇 Emas"],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="flex flex-col gap-1">
              <label className="text-[11px] text-slate-500">{label}</label>
              <GlassInput
                name={field}
                type="number"
                min={0.1}
                step="any"
                required
                value={values[field]}
                onChange={(e) => update({ [field]: e.target.value })}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-2 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-[0_4px_16px_rgba(23,38,61,0.08)] backdrop-blur-md lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
        <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-5 py-2 text-sm`}>
          {submitLabel}
        </GlassButton>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={!dirty}
            className="min-h-10 rounded-xl px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-white/60 active:bg-white/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Batalkan perubahan
          </button>
        )}
        {dirty && <span className="text-xs text-[#8a6900]">Belum disimpan</span>}
      </div>
    </ToastForm>
  );
}
