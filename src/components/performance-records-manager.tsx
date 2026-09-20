"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import {
  METRIC_LABELS,
  METRIC_TYPES,
  strokeFieldLabel,
  strokeOptions,
  usesStroke as metricUsesStroke,
  annotatePersonalBests,
  formatMetricLabel,
  formatMetricValue,
  type MetricType,
  type PerformanceRecordRow,
} from "@/lib/performance";
import type { ActionState } from "@/lib/action-result";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function RecordFields({
  record,
  today,
}: {
  record?: PerformanceRecordRow;
  today: string;
}) {
  const [metric, setMetric] = useState<MetricType>(record?.metric_type ?? "waktu_tempuh");
  const usesStroke = metricUsesStroke(metric);
  const usesDistance = metricUsesStroke(metric);
  const usesDuration = metric !== "jarak_tempuh";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-600">Jenis</label>
        <GlassSelect
          name="metric_type"
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricType)}
          className="min-w-[160px] text-sm"
        >
          {METRIC_TYPES.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </GlassSelect>
      </div>

      {usesStroke && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">{strokeFieldLabel(metric)}</label>
          <GlassSelect
            key={metric}
            name="stroke"
            defaultValue={record?.metric_type === metric && record.stroke ? record.stroke : strokeOptions(metric)[0]}
            className="min-w-[150px] text-sm"
          >
            {strokeOptions(metric).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </GlassSelect>
        </div>
      )}

      {usesDistance && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">
            {metric === "waktu_tempuh" ? "Target Jarak (m)" : "Jarak Tercapai (m)"}
          </label>
          <GlassInput
            name="distance_m"
            type="number"
            min={1}
            step="any"
            required
            defaultValue={record?.distance_m ?? (metric === "waktu_tempuh" ? 25 : "")}
            className="w-24 text-sm"
          />
        </div>
      )}

      {usesDuration && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">Waktu / Durasi (detik)</label>
          <GlassInput
            name="duration_seconds"
            type="number"
            min={0.1}
            step="any"
            required
            defaultValue={record?.duration_seconds ?? ""}
            className="w-28 text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-600">Tanggal</label>
        <GlassInput
          name="recorded_at"
          type="date"
          required
          defaultValue={record?.recorded_at ?? today}
          className="text-sm"
        />
      </div>
    </div>
  );
}

// List + edit/delete (+ add for admin) of one student's performance records.
// Controls only appear where the viewer may use them: admin on every record,
// a pengajar on the records they entered. The server actions and RLS enforce
// the same rule, this is just so nobody is offered a button that will refuse.
export function PerformanceRecordsManager({
  records,
  studentId,
  role,
  viewerId,
  updateAction,
  deleteAction,
  addAction,
  today,
  hidden,
}: {
  records: PerformanceRecordRow[];
  studentId: string;
  role: "pelatih" | "admin";
  viewerId: string | null;
  updateAction: Action;
  deleteAction: Action;
  addAction?: Action;
  today: string;
  // extra hidden fields every form carries (program / enrollment to return to)
  hidden?: Record<string, string>;
}) {
  const hiddenFields = Object.entries(hidden ?? {}).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
  const [editingId, setEditingId] = useState<string | null>(null);

  const annotated = annotatePersonalBests(records).sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  );
  const canManage = (r: PerformanceRecordRow) =>
    role === "admin" || (viewerId !== null && r.pelatih_id === viewerId);

  return (
    <GlassCard>
      <h2 className="mb-1 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Rekor Performa
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        {role === "admin"
          ? "Admin dapat menambah, mengubah, dan menghapus rekor semua siswa."
          : "Anda dapat mengubah atau menghapus rekor yang Anda catat sendiri. Rekor baru bisa ditambah lewat form laporan sesi."}
      </p>

      {annotated.length === 0 && (
        <p className="mb-2 text-sm text-slate-500">Belum ada rekor tersimpan.</p>
      )}

      <div className="flex flex-col gap-2">
        {annotated.map((r) => {
          const manage = canManage(r);
          const editing = editingId === r.id;
          const label = `${formatMetricLabel(r)} — ${formatMetricValue(r)} (${r.recorded_at})`;

          if (editing) {
            return (
              <ToastForm
                key={r.id}
                action={updateAction}
                className="flex flex-col gap-3 rounded-2xl border border-[#35C5D0]/40 bg-white/60 p-3"
              >
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="student_id" value={studentId} />
                {hiddenFields}
                <RecordFields record={r} today={today} />
                <div className="flex gap-2">
                  <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-4 py-2 text-xs`}>
                    Simpan Perubahan
                  </GlassButton>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white/60 active:bg-white/70"
                  >
                    Batal
                  </button>
                </div>
              </ToastForm>
            );
          }

          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/55 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#17263D]">
                  {formatMetricLabel(r)}
                  {r.isPersonalBest && (
                    <span className="ml-1.5 rounded-full bg-[#35C5D0]/15 px-2 py-0.5 text-[11px] font-medium text-[#1597A3]">
                      🏆 Rekor Terbaik
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-600">
                  {formatMetricValue(r)} &middot; {r.recorded_at}
                  {!manage && role === "pelatih" && " · dicatat pengajar lain"}
                </p>
              </div>
              {manage && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingId(r.id)}
                    className={`rounded-xl border border-white/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-[#17263D] transition-colors duration-200 hover:border-[#35C5D0]/60 hover:bg-[#35C5D0]/15 active:bg-[#35C5D0]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]`}
                  >
                    Edit
                  </button>
                  <ToastForm action={deleteAction} pendingLabel="Menghapus...">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="student_id" value={studentId} />
                {hiddenFields}
                    <ConfirmSubmitButton
                      message={`Hapus rekor ini?\n\n${label}\n\nTindakan ini tidak bisa dibatalkan.`}
                      className="!border-red-300 !bg-red-500/10 px-3 py-1.5 text-xs !text-red-700 hover:!bg-red-500/20"
                    >
                      Hapus
                    </ConfirmSubmitButton>
                  </ToastForm>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {addAction && (
        <ToastForm
          action={addAction}
          resetOnSuccess
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-[#35C5D0]/40 p-3"
        >
          <input type="hidden" name="student_id" value={studentId} />
                {hiddenFields}
          <p className="text-sm font-medium text-[#17263D]">Tambah rekor</p>
          <RecordFields today={today} />
          <GlassButton type="submit" className={`${SECONDARY_BUTTON} w-fit px-4 py-2 text-xs`}>
            Tambah Rekor
          </GlassButton>
        </ToastForm>
      )}
    </GlassCard>
  );
}
