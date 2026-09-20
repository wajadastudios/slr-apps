"use client";

import { useState } from "react";
import { ToastForm } from "@/components/ui/toast-form";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { PRIMARY_BUTTON } from "@/lib/ui-classes";
import { METRIC_LABELS, METRIC_TYPES, STROKES, type MetricType } from "@/lib/performance";
import type { Milestone } from "@/lib/milestones";
import type { ActionState } from "@/lib/action-result";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const UNIT: Record<MetricType, string> = {
  waktu_tempuh: "detik (makin kecil makin baik)",
  jarak_tempuh: "meter",
  tahan_nafas: "detik",
  treading_water: "detik",
};

export function MilestoneForm({
  action,
  milestone,
  definitionLocked = false,
  levels,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: Action;
  milestone?: Milestone;
  // Metric/gaya/jarak can't change once the milestone has produced badges.
  definitionLocked?: boolean;
  levels: string[];
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [metric, setMetric] = useState<MetricType>(milestone?.metric_type ?? "waktu_tempuh");
  const usesStroke = metric === "waktu_tempuh";
  const usesDistance = metric === "waktu_tempuh";
  const listId = `levels-${milestone?.id ?? "new"}`;

  return (
    <ToastForm
      action={action}
      resetOnSuccess={resetOnSuccess}
      className="grid gap-3 sm:grid-cols-6"
    >
      {milestone && <input type="hidden" name="id" value={milestone.id} />}

      <div className="flex flex-col gap-1 sm:col-span-3">
        <label className="text-xs text-slate-600">Nama Milestone</label>
        <GlassInput name="label" defaultValue={milestone?.label ?? ""} required className="text-sm" />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-3">
        <label className="text-xs text-slate-600">Jenjang / Kategori</label>
        <GlassInput
          name="level"
          list={listId}
          defaultValue={milestone?.level ?? ""}
          placeholder="Contoh: Dasar 1, Mahir"
          className="text-sm"
        />
        <datalist id={listId}>
          {levels.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-xs text-slate-600">Metrik</label>
        {definitionLocked ? (
          <>
            <input type="hidden" name="metric_type" value={metric} />
            <p className="rounded-2xl bg-white/40 px-4 py-2.5 text-sm text-slate-700">
              {METRIC_LABELS[metric]}
            </p>
          </>
        ) : (
          <GlassSelect
            name="metric_type"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricType)}
          >
            {METRIC_TYPES.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </GlassSelect>
        )}
      </div>

      {usesStroke && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-slate-600">Gaya Renang</label>
          {definitionLocked ? (
            <>
              <input type="hidden" name="stroke" value={milestone?.stroke ?? ""} />
              <p className="rounded-2xl bg-white/40 px-4 py-2.5 text-sm text-slate-700">
                {milestone?.stroke ?? "-"}
              </p>
            </>
          ) : (
            <GlassSelect name="stroke" defaultValue={milestone?.stroke ?? "Bebas"}>
              {STROKES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </GlassSelect>
          )}
        </div>
      )}

      {usesDistance && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-slate-600">Jarak (m)</label>
          <GlassInput
            name="distance_m"
            type="number"
            min={1}
            step="any"
            defaultValue={milestone?.distance_m ?? 25}
            readOnly={definitionLocked}
            className="text-sm"
          />
        </div>
      )}

      <div className="sm:col-span-6">
        <p className="mb-1 text-xs text-slate-600">
          Target per lencana &mdash; satuan: {UNIT[metric]}
        </p>
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
                defaultValue={milestone?.[field] ?? ""}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="sm:col-span-6">
        <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-4 py-2 text-sm`}>
          {submitLabel}
        </GlassButton>
      </div>
    </ToastForm>
  );
}
