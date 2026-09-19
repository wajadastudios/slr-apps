"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { StarRating } from "@/components/ui/star-rating";
import { SkillScoresField } from "@/components/skill-scores-field";
import { LockIcon, LOCKED_HINT } from "@/components/ui/lock-icon";

const ATTENDANCE_LABEL: Record<string, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
};

const ATTENDANCE_COLOR: Record<string, string> = {
  hadir: "bg-[#55D6A6]/20 text-[#1a8f6f]",
  izin: "bg-[#FFC800]/20 text-[#8a6900]",
  sakit: "bg-red-500/20 text-red-700",
};

export type ReportRow = {
  id: string;
  session_date: string;
  session_number: number | null;
  attendance: string | null;
  scores: unknown;
  notes: string | null;
  next_focus: string | null;
  media_urls: string[] | null;
  substitute_for?: string | null;
};

type ReportAction = (formData: FormData) => void | Promise<void>;

// progress_reports.scores is jsonb, which does not preserve key insertion
// order -- so the only reliable order is the program's current
// skill_template, with any leftover names (from a since-edited template)
// tacked on at the end rather than dropped.
function orderedSkillNames(scores: Record<string, number>, skillTemplate: string[]) {
  const inTemplate = skillTemplate.filter((name) => name in scores);
  const extra = Object.keys(scores).filter((name) => !skillTemplate.includes(name));
  return [...inTemplate, ...extra];
}

function ReportEntry({
  report,
  studentId,
  skillTemplate,
  lockZeroScores,
  editable,
  updateAction,
  deleteAction,
}: {
  report: ReportRow;
  studentId: string;
  skillTemplate: string[];
  lockZeroScores: boolean;
  editable: boolean;
  updateAction?: ReportAction;
  deleteAction?: ReportAction;
}) {
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const [lockedOpen, setLockedOpen] = useState(false);

  const scores = (report.scores as Record<string, number>) ?? {};
  const skillNames = orderedSkillNames(scores, skillTemplate);
  const isLocked = (skill: string) => lockZeroScores && scores[skill] === 0;
  const unlockedNames = skillNames.filter((s) => !isLocked(s));
  const lockedNames = skillNames.filter(isLocked);

  if (editing && editable && updateAction) {
    return (
      <div className="rounded-xl border border-[#35C5D0]/40 bg-white/50 px-4 py-3">
        <form action={updateAction} className="flex flex-col gap-3">
          <input type="hidden" name="report_id" value={report.id} />
          <input type="hidden" name="student_id" value={studentId} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">Tanggal</label>
              <GlassInput
                name="session_date"
                type="date"
                defaultValue={report.session_date}
                required
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">Nomor Sesi</label>
              <GlassInput
                name="session_number"
                type="number"
                min={1}
                defaultValue={report.session_number ?? undefined}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">Kehadiran</label>
              <GlassSelect
                name="attendance"
                required
                defaultValue={report.attendance ?? "hadir"}
              >
                <option value="hadir">Hadir</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </GlassSelect>
            </div>
          </div>

          <SkillScoresField initialSkills={skillTemplate} initialScores={scores} />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Catatan</label>
            <GlassTextarea name="notes" rows={3} defaultValue={report.notes ?? ""} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">
              Tambah Foto/Video (opsional, lampiran lama tetap tersimpan)
            </label>
            <input
              type="file"
              name="media"
              multiple
              accept="image/*,video/*"
              className="w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#35C5D0] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">
              Rekomendasi Fokus Sesi Berikutnya
            </label>
            <GlassTextarea name="next_focus" rows={2} defaultValue={report.next_focus ?? ""} />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white/50 active:bg-white/60"
            >
              Batal
            </button>
            <GlassButton
              type="submit"
              className="!bg-[#35C5D0] px-3 py-1.5 text-xs font-semibold !text-white hover:!bg-[#2bb0ba] active:!bg-[#2bb0ba]"
            >
              Simpan Perubahan
            </GlassButton>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/30 bg-white/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-[#17263D]">
          Sesi {report.session_number ?? "-"} &mdash; {report.session_date}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            ATTENDANCE_COLOR[report.attendance ?? ""] ??
            "bg-slate-200 text-slate-700"
          }`}
        >
          {ATTENDANCE_LABEL[report.attendance ?? ""] ?? report.attendance}
        </span>
      </div>

      {report.substitute_for && (
        <div className="mt-1">
          <span className="rounded-full bg-[#FFC800]/20 px-2.5 py-0.5 text-xs font-medium text-[#8a6900]">
            Diajar pengajar pengganti (menggantikan {report.substitute_for})
          </span>
        </div>
      )}

      {report.notes && <p className="mt-2 text-sm text-slate-700">{report.notes}</p>}
      {report.next_focus && (
        <p className="mt-1 text-sm italic text-slate-600">
          Fokus berikutnya: {report.next_focus}
        </p>
      )}

      {skillNames.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setIndicatorsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#35C5D0] hover:underline"
          >
            {indicatorsOpen ? "Sembunyikan" : "Lihat"} Skor Indikator (
            {skillNames.length})
            <span
              className={`transition-transform ${indicatorsOpen ? "rotate-180" : ""}`}
            >
              &#9660;
            </span>
          </button>
          {indicatorsOpen && (
            <div className="mt-2 flex flex-col gap-1.5">
              {unlockedNames.map((skill) => (
                <div key={skill} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-700">{skill}</span>
                  <StarRating value={scores[skill]} size={14} />
                </div>
              ))}
              {lockedNames.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setLockedOpen((v) => !v)}
                    className="mt-1 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-white/60 active:bg-white/70"
                  >
                    <LockIcon />
                    {lockedNames.length} indikator belum dibuka
                    <span className={`transition-transform ${lockedOpen ? "rotate-180" : ""}`}>
                      &#9660;
                    </span>
                  </button>
                  {lockedOpen &&
                    lockedNames.map((skill) => (
                      <div
                        key={skill}
                        title={LOCKED_HINT}
                        className="flex items-center justify-between gap-3 text-slate-400"
                      >
                        <span className="text-sm">{skill}</span>
                        <span className="flex items-center gap-1 text-xs">
                          <LockIcon className="h-3 w-3" />
                          Belum dibuka
                        </span>
                      </div>
                    ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {report.media_urls && report.media_urls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {report.media_urls.map((url: string) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#35C5D0] underline"
            >
              Lampiran
            </a>
          ))}
        </div>
      )}

      {editable && (
        <div className="mt-3 flex justify-end gap-2 border-t border-white/30 pt-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl border border-white/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-[#17263D] transition-colors hover:bg-white/60 active:bg-white/70"
          >
            Edit
          </button>
          <form action={deleteAction}>
            <input type="hidden" name="report_id" value={report.id} />
            <input type="hidden" name="student_id" value={studentId} />
            <ConfirmSubmitButton
              message="Hapus laporan sesi ini? Tindakan ini tidak bisa dibatalkan."
              className="!border-red-300 !bg-red-500/10 px-3 py-1.5 text-xs !text-red-700 hover:!bg-red-500/20"
            >
              Hapus
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}

export function ReportHistoryCard({
  reports,
  skillTemplate = [],
  lockZeroScores = false,
  editable = false,
  studentId = "",
  updateAction,
  deleteAction,
}: {
  reports: ReportRow[];
  skillTemplate?: string[];
  // Orang tua sees a skill scored 0 as "not unlocked yet" rather than a
  // bare 0-star rating -- pelatih/admin still see the real score.
  lockZeroScores?: boolean;
  // Pengajar-only: shows Edit/Hapus controls per report.
  editable?: boolean;
  studentId?: string;
  updateAction?: ReportAction;
  deleteAction?: ReportAction;
}) {
  return (
    <GlassCard>
      <h2 className="mb-4 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Riwayat Laporan
      </h2>
      <div className="flex flex-col gap-3">
        {reports.length === 0 && (
          <p className="text-sm text-slate-600">Belum ada laporan.</p>
        )}
        {reports.map((r) => (
          <ReportEntry
            key={r.id}
            report={r}
            studentId={studentId}
            skillTemplate={skillTemplate}
            lockZeroScores={lockZeroScores}
            editable={editable}
            updateAction={updateAction}
            deleteAction={deleteAction}
          />
        ))}
      </div>
    </GlassCard>
  );
}
