"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import {
  METRIC_TYPES,
  METRIC_LABELS,
  strokeFieldLabel,
  strokeOptions,
  usesStroke,
  type MetricType,
} from "@/lib/performance";

type Row = {
  metric_type: MetricType;
  stroke: string;
  distance_m: string;
  duration_seconds: string;
};

const EMPTY_ROW: Row = {
  metric_type: "waktu_tempuh",
  stroke: "Bebas",
  distance_m: "25",
  duration_seconds: "",
};

function usesDistance(metric: MetricType) {
  return metric === "waktu_tempuh" || metric === "jarak_tempuh";
}
function usesDuration(metric: MetricType) {
  return metric !== "jarak_tempuh";
}

export function PerformanceRecordField({
  fieldName = "performance_records_json",
}: {
  fieldName?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-800">Rekor Performa (opsional)</p>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-white/30 bg-white/40 px-3 py-2.5"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">Jenis</label>
              <GlassSelect
                value={row.metric_type}
                onChange={(e) => {
                  const metric_type = e.target.value as MetricType;
                  updateRow(i, { metric_type, stroke: strokeOptions(metric_type)[0] ?? "" });
                }}
                className="min-w-[160px]"
              >
                {METRIC_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </GlassSelect>
            </div>

            {usesStroke(row.metric_type) && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">{strokeFieldLabel(row.metric_type)}</label>
                <GlassSelect
                  value={row.stroke}
                  onChange={(e) => updateRow(i, { stroke: e.target.value })}
                  className="min-w-[150px]"
                >
                  {strokeOptions(row.metric_type).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </GlassSelect>
              </div>
            )}

            {usesDistance(row.metric_type) && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">
                  {row.metric_type === "waktu_tempuh" ? "Target Jarak (m)" : "Jarak Tercapai (m)"}
                </label>
                <GlassInput
                  type="number"
                  min={1}
                  value={row.distance_m}
                  onChange={(e) => updateRow(i, { distance_m: e.target.value })}
                  className="w-24"
                />
              </div>
            )}

            {usesDuration(row.metric_type) && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">Waktu (detik)</label>
                <GlassInput
                  type="number"
                  min={1}
                  step="0.1"
                  value={row.duration_seconds}
                  onChange={(e) => updateRow(i, { duration_seconds: e.target.value })}
                  className="w-24"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Hapus
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-slate-500">Belum ada rekor ditambahkan.</p>
        )}
      </div>
      <GlassButton
        type="button"
        onClick={addRow}
        className="w-fit px-4 py-2 text-sm"
      >
        + Tambah Rekor
      </GlassButton>
      <input type="hidden" name={fieldName} value={JSON.stringify(rows)} />
    </div>
  );
}
