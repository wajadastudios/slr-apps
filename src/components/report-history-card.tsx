"use client";

import { useRef, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { StarRating } from "@/components/ui/star-rating";
import { MediaFileInput } from "@/components/media-file-input";
import { SkillScoresField } from "@/components/skill-scores-field";
import { ParentIndicatorSummary } from "@/components/parent-indicator-summary";
import { ParentLevelSummary } from "@/components/parent-level-summary";
import { LevelScoresField } from "@/components/level-scores-field";
import { AttendanceProvider, AttendanceSelect, PresentOnly } from "@/components/report-attendance";
import { NarrativeField } from "@/components/narrative-field";
import { summarizeLevelGroups } from "@/lib/level-summary";
import { levelLabel, levelsFor, usesStars, type AssessmentType } from "@/lib/programs";
import { AccordionItem } from "@/components/ui/accordion";
import { formatShortDate } from "@/lib/format-date";
import {
  displayName,
  formGroups,
  resolveReportIndicators,
  type IndicatorConfig,
  type IndicatorSnapshot,
} from "@/lib/indicators";
import { isAbsent } from "@/lib/progress";
import { summarizeReportGroups } from "@/lib/report-summary";
import { GHOST_BUTTON } from "@/lib/ui-classes";
import { ToastForm } from "@/components/ui/toast-form";
import type { ActionState } from "@/lib/action-result";

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

export type ReportRevision = {
  created_at: string;
  actor_name: string | null;
  // {column: [old, new]}, straight from activity_log -- see log_activity()
  changes: Record<string, [unknown, unknown]>;
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
  // label/group of every scored indicator as they were when the report was written
  indicator_snapshot?: IndicatorSnapshot | null;
  // how the scores were measured when the report was written
  assessment_type?: AssessmentType | null;
  // who wrote the report and any edits since -- absent for callers that
  // don't need per-report authorship (e.g. the parent's single latest card)
  pelatih_id?: string | null;
  author_name?: string | null;
  revisions?: ReportRevision[];
  // 'final' when absent (every caller predating this column always was) --
  // a draft is only ever visible to the pengajar who wrote it (RLS), so
  // ReportHistoryCard is the one place it can legitimately show up at all.
  status?: "draft" | "final" | "cancelled";
};

type ReportAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type CorrectionAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

// Columns whose raw before/after would be unreadable or is purely internal
// bookkeeping -- never shown in "Riwayat perubahan".
const CHANGE_SKIP = new Set([
  "indicator_snapshot",
  "updated_at",
  "created_at",
  "program_id",
  "enrollment_id",
  "assessment_type",
  "template_version",
  "pelatih_id",
  "student_id",
  "id",
]);

const CHANGE_LABEL: Record<string, string> = {
  session_date: "Tanggal",
  session_number: "Nomor sesi",
  attendance: "Kehadiran",
  notes: "Catatan",
  next_focus: "Fokus sesi berikutnya",
  media_urls: "Lampiran",
};

function truncate(value: unknown, max = 60): string {
  const text = value == null ? "—" : String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text || "—";
}

// One readable line per changed field. `scores` is expanded per indicator
// (using the labels the report was written with) instead of dumping jsonb.
function describeChanges(
  changes: Record<string, [unknown, unknown]>,
  indicatorConfig: IndicatorConfig
): string[] {
  const lines: string[] = [];
  for (const [column, [before, after]] of Object.entries(changes)) {
    if (CHANGE_SKIP.has(column)) continue;
    if (column === "scores") {
      const oldScores = (before as Record<string, number>) ?? {};
      const newScores = (after as Record<string, number>) ?? {};
      const keys = new Set([...Object.keys(oldScores), ...Object.keys(newScores)]);
      for (const key of keys) {
        if (oldScores[key] === newScores[key]) continue;
        const label = displayName(indicatorConfig, key);
        lines.push(`${label}: ${oldScores[key] ?? "—"} → ${newScores[key] ?? "—"}`);
      }
      continue;
    }
    if (column === "attendance") {
      lines.push(
        `Kehadiran: ${ATTENDANCE_LABEL[String(before)] ?? String(before)} → ${ATTENDANCE_LABEL[String(after)] ?? String(after)}`
      );
      continue;
    }
    if (column === "session_date") {
      lines.push(`Tanggal: ${formatShortDate(String(before))} → ${formatShortDate(String(after))}`);
      continue;
    }
    if (column === "media_urls") {
      const oldCount = Array.isArray(before) ? before.length : 0;
      const newCount = Array.isArray(after) ? after.length : 0;
      if (oldCount !== newCount) lines.push(`Lampiran: ${oldCount} → ${newCount} berkas`);
      continue;
    }
    const label = CHANGE_LABEL[column] ?? column;
    lines.push(`${label}: ${truncate(before)} → ${truncate(after)}`);
  }
  return lines;
}

function RevisionHistory({
  revisions,
  indicatorConfig,
}: {
  revisions: ReportRevision[];
  indicatorConfig: IndicatorConfig;
}) {
  const [open, setOpen] = useState(false);
  if (revisions.length === 0) return null;

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="mt-3 rounded-xl border border-white/40 bg-white/30"
      headerClassName="min-h-11 rounded-xl px-3 py-1"
      header={
        <span className="text-xs font-medium text-slate-600">
          Riwayat perubahan
          <span className="ml-1.5 text-[11px] font-normal text-slate-500">&middot; {revisions.length}x diedit</span>
        </span>
      }
    >
      <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
        {revisions.map((rev, i) => {
          const lines = describeChanges(rev.changes, indicatorConfig);
          if (lines.length === 0) return null;
          return (
            <div key={i} className="rounded-lg bg-[#F4FAFB] px-2.5 py-2 text-[11px] text-slate-600">
              <p className="font-medium text-[#17263D]">
                {formatShortDate(rev.created_at)}
                {rev.actor_name ? ` · oleh ${rev.actor_name}` : ""}
              </p>
              {lines.map((line, j) => (
                <p key={j} className="mt-0.5">
                  {line}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </AccordionItem>
  );
}

function CorrectionRequestForm({
  reportId,
  studentId,
  correctionAction,
}: {
  reportId: string;
  studentId: string;
  correctionAction: CorrectionAction;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-xl px-3 py-1.5 text-xs font-medium text-[#8a6900] ${GHOST_BUTTON}`}
      >
        Ajukan koreksi
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-xl border border-[#FFC800]/40 bg-[#FFF8E1]/60 p-3">
      <ToastForm action={correctionAction} resetOnSuccess className="flex flex-col gap-2">
        <input type="hidden" name="report_id" value={reportId} />
        <input type="hidden" name="student_id" value={studentId} />
        <label className="text-xs font-medium text-[#6b5200]">
          Apa yang tampaknya salah pada laporan ini?
        </label>
        <GlassTextarea name="reason" rows={2} required placeholder="Jelaskan singkat, admin akan meninjau." />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white/50"
          >
            Batal
          </button>
          <GlassButton type="submit" className="!bg-[#FFC800] px-3 py-1.5 text-xs font-semibold !text-[#4a3900] hover:!brightness-95">
            Kirim ke admin
          </GlassButton>
        </div>
      </ToastForm>
    </div>
  );
}

function ReportEntry({
  report,
  studentId,
  indicatorConfig,
  parentView,
  editable,
  viewerId,
  updateAction,
  deleteAction,
  correctionAction,
  cyclePosition,
  draftNarrativeDue,
}: {
  report: ReportRow;
  studentId: string;
  indicatorConfig: IndicatorConfig;
  parentView: boolean;
  editable: boolean;
  viewerId?: string | null;
  updateAction?: ReportAction;
  deleteAction?: ReportAction;
  correctionAction?: CorrectionAction;
  // Set when this report is a periodic narrative-cycle summary (e.g. the
  // 4th valid report since 2026-10-01) -- see src/lib/narrative-cycle.ts.
  cyclePosition?: number;
  // Whether the NEXT cycle position is due -- used as an approximation of
  // "would this draft need a narrative once finalized" (its exact position
  // isn't tracked until it's final; this matches the common case where the
  // draft is the most recent session).
  draftNarrativeDue?: boolean;
}) {
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // When viewerId is known (the pengajar's own history view), edit/delete is
  // scoped to reports THEY wrote -- RLS already enforces this at the
  // database, this only keeps the UI from offering a control that would
  // fail. Callers that never pass viewerId (admin, who may edit anything;
  // the parent's read-only latest-report card) keep the old blanket flag.
  const canEdit = editable && (viewerId == null || report.pelatih_id === viewerId);
  const isOthersReport = viewerId != null && report.pelatih_id != null && report.pelatih_id !== viewerId;

  const scores = (report.scores as Record<string, number>) ?? {};
  const type: AssessmentType = report.assessment_type ?? "score_5";
  const levels = levelsFor(type);
  // Snapshot first (how the report looked when written), then the current
  // structure, so a later rename/regroup never rewrites history.
  const resolved = resolveReportIndicators(scores, report.indicator_snapshot, indicatorConfig);
  const unlockedGroups = resolved.reduce<{ name: string; items: typeof resolved }[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && last.name === r.group) last.items.push(r);
    else acc.push({ name: r.group, items: [r] });
    return acc;
  }, []);
  // A missed session (izin/sakit) says nothing about what the child can do.
  const parentGroups =
    parentView && !isAbsent(report.attendance) && usesStars(type)
      ? summarizeReportGroups(scores, report.indicator_snapshot, indicatorConfig)
      : [];
  const parentLevelGroups =
    parentView && !isAbsent(report.attendance) && !usesStars(type)
      ? summarizeLevelGroups(scores, report.indicator_snapshot, indicatorConfig, type)
      : [];

  if (editing && canEdit && updateAction) {
    return (
      <div className="rounded-xl border border-[#35C5D0]/40 bg-white/50 px-4 py-3">
        <ToastForm action={updateAction} className="flex flex-col gap-3">
          <AttendanceProvider initial={report.attendance ?? "hadir"}>
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
              <AttendanceSelect initial={report.attendance ?? "hadir"} />
            </div>
          </div>

          <PresentOnly>
            {levels ? (
              <LevelScoresField
                groups={formGroups(indicatorConfig, Object.keys(scores))}
                levels={levels}
                legend={type === "observation" ? "Observasi sesi" : "Tingkat dukungan per indikator"}
                initialScores={scores}
                initiallyOpen={formGroups(indicatorConfig, Object.keys(scores))
                  .filter((g) => g.indicators.some((i) => (scores[i.key] ?? 0) > 0))
                  .map((g) => g.id)}
              />
            ) : (
              <SkillScoresField
                groups={formGroups(indicatorConfig, Object.keys(scores))}
                initialScores={scores}
                initiallyOpen={formGroups(indicatorConfig, Object.keys(scores))
                  .filter((g) => g.indicators.some((i) => (scores[i.key] ?? 0) > 0))
                  .map((g) => g.id)}
              />
            )}
          </PresentOnly>

          <NarrativeField
            required={report.status === "draft" ? (draftNarrativeDue ?? false) : cyclePosition != null}
            defaultValue={report.notes ?? ""}
          />

          {type !== "observation" && (
            <MediaFileInput label="Tambah Foto/Video (opsional, lampiran lama tetap tersimpan)" />
          )}

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
              name="intent"
              value="final"
              className="!bg-[#35C5D0] px-3 py-1.5 text-xs font-semibold !text-white hover:!bg-[#2bb0ba] active:!bg-[#2bb0ba]"
            >
              Simpan Perubahan
            </GlassButton>
          </div>
          </AttendanceProvider>
        </ToastForm>
      </div>
    );
  }

  const longNotes = (report.notes?.length ?? 0) > 140;

  return (
    <div className="rounded-2xl border border-white/60 bg-white/55 p-4 shadow-[0_2px_10px_rgba(23,38,61,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">
            Sesi {report.session_number ?? "-"}
          </p>
          <p className="text-xs text-slate-500">{formatShortDate(report.session_date)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {report.status === "draft" && (
            <span className="rounded-full bg-[#FFF3C4] px-2.5 py-0.5 text-xs font-semibold text-[#7a5c00]">Draft</span>
          )}
          {cyclePosition != null && (
            <span className="rounded-full bg-[#E9E5FF] px-2.5 py-0.5 text-xs font-semibold text-[#4b3a9e]">
              Rangkuman laporan ke-{cyclePosition}
            </span>
          )}
          {isOthersReport && report.author_name && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              oleh {report.author_name}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              ATTENDANCE_COLOR[report.attendance ?? ""] ??
              "bg-slate-200 text-slate-700"
            }`}
          >
            {ATTENDANCE_LABEL[report.attendance ?? ""] ?? report.attendance}
          </span>
        </div>
      </div>

      {report.substitute_for && (
        <div className="mt-2">
          <span className="rounded-full bg-[#FFC800]/20 px-2.5 py-0.5 text-xs font-medium text-[#8a6900]">
            Diajar pengajar pengganti (menggantikan {report.substitute_for})
          </span>
        </div>
      )}

      {report.notes && parentView && cyclePosition != null && (
        <div className="mt-3 rounded-xl border border-[#4b3a9e]/25 bg-[#E9E5FF]/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#4b3a9e]">Rangkuman Perkembangan</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#17263D]">{report.notes}</p>
          {report.author_name && <p className="mt-2 text-xs text-slate-500">oleh {report.author_name}</p>}
        </div>
      )}

      {report.notes && !(parentView && cyclePosition != null) && (
        <div className="mt-3">
          <p
            className={`whitespace-pre-line text-sm leading-relaxed text-slate-700 ${
              longNotes && !notesOpen ? "line-clamp-3" : ""
            }`}
          >
            {report.notes}
          </p>
          {longNotes && (
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-expanded={notesOpen}
              className={`mt-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-[#1597A3] ${GHOST_BUTTON}`}
            >
              {notesOpen ? "Ringkas catatan" : "Baca selengkapnya"}
            </button>
          )}
        </div>
      )}

      {!report.notes && parentView && resolved.length > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          Penilaian sesi tersimpan — Indikator latihan hari ini sudah diperbarui. Rangkuman perkembangan personal
          dibuat secara berkala oleh pengajar.
        </p>
      )}

      {report.next_focus && (
        <div className="mt-3 rounded-xl bg-[#EEF9FB] px-3 py-2">
          <p className="text-[11px] font-medium text-slate-500">
            Fokus sesi berikutnya
          </p>
          <p className="text-sm text-[#17263D]">{report.next_focus}</p>
        </div>
      )}

      {report.media_urls && report.media_urls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {report.media_urls.map((url: string, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full border border-[#35C5D0]/40 px-3 py-1 text-xs font-medium text-[#1597A3] ${GHOST_BUTTON}`}
            >
              Lampiran {i + 1}
            </a>
          ))}
        </div>
      )}

      {parentView && <ParentIndicatorSummary groups={parentGroups} />}
      {parentView && (
        <ParentLevelSummary
          groups={parentLevelGroups}
          title={type === "observation" ? "Catatan observasi" : "Penilaian dukungan & kemandirian"}
        />
      )}

      {!parentView && resolved.length > 0 && (
        <AccordionItem
          variant="ortu"
          chevronSize="sm"
          open={indicatorsOpen}
          onToggle={() => setIndicatorsOpen((v) => !v)}
          className="mt-3 rounded-xl border border-[#35C5D0]/25 bg-[#EEF9FB]/60"
          headerClassName="min-h-12 rounded-xl px-3 py-1.5"
          header={
            <span className="text-sm font-medium text-[#17263D]">
              Lihat Detail Penilaian
              <span className="ml-1.5 whitespace-nowrap text-xs font-normal text-slate-500">
                &middot; {resolved.length} indikator
              </span>
            </span>
          }
        >
          <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
            {unlockedGroups.map((group) => (
              <div key={group.name} className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.name}
                </p>
                {group.items.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">{r.label}</span>
                    {usesStars(type) ? (
                      <StarRating value={r.score} size={14} />
                    ) : (
                      <span className="text-xs font-medium text-[#0b5f8a]">{levelLabel(type, r.score)}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </AccordionItem>
      )}

      {canEdit && (
        <div className="mt-3 flex justify-end gap-2 border-t border-white/30 pt-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl border border-white/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-[#17263D] transition-colors hover:bg-white/60 active:bg-white/70"
          >
            Edit
          </button>
          {deleteAction && (
            <ToastForm action={deleteAction} pendingLabel="Menghapus...">
              <input type="hidden" name="report_id" value={report.id} />
              <input type="hidden" name="student_id" value={studentId} />
              <ConfirmSubmitButton
                message="Hapus laporan sesi ini? Tindakan ini tidak bisa dibatalkan."
                className="!border-red-300 !bg-red-500/10 px-3 py-1.5 text-xs !text-red-700 hover:!bg-red-500/20"
              >
                Hapus
              </ConfirmSubmitButton>
            </ToastForm>
          )}
        </div>
      )}

      {canEdit && report.revisions && (
        <RevisionHistory revisions={report.revisions} indicatorConfig={indicatorConfig} />
      )}

      {isOthersReport && correctionAction && (
        <div className="mt-3 flex justify-end border-t border-white/30 pt-2">
          <CorrectionRequestForm reportId={report.id} studentId={studentId} correctionAction={correctionAction} />
        </div>
      )}
    </div>
  );
}

export function ReportHistoryCard({
  reports,
  indicatorConfig,
  parentView = false,
  editable = false,
  viewerId,
  studentId = "",
  updateAction,
  deleteAction,
  correctionAction,
  cyclePositions,
  draftNarrativeDue,
  id,
  title = "Riwayat Laporan",
}: {
  reports: ReportRow[];
  indicatorConfig: IndicatorConfig;
  // anchor for deep links (e.g. #riwayat-laporan) and the card heading
  id?: string;
  title?: string;
  // Orang tua: read-only summary per indicator group (collapsed, with
  // averages) instead of the flat indicator list pelatih/admin see.
  parentView?: boolean;
  // Whether this viewer role may edit reports at all (admin: always; pengajar:
  // always, narrowed per-report below by viewerId; parent: never).
  editable?: boolean;
  // When set, edit/delete only shows on reports where report.pelatih_id
  // matches -- a pengajar reading a student's full history, including
  // reports written by a previous pengajar. Leave unset for admin (who may
  // edit any report) and the parent's read-only view.
  viewerId?: string | null;
  studentId?: string;
  updateAction?: ReportAction;
  deleteAction?: ReportAction;
  // Pengajar-only: files a lightweight correction request against a report
  // they can read but not edit (someone else's).
  correctionAction?: CorrectionAction;
  // report id -> position, for reports that landed on a required narrative
  // cycle position (src/lib/narrative-cycle.ts's cyclePositionsOf()).
  cyclePositions?: Map<string, number>;
  // Whether the pengajar's own next report (i.e. any draft shown here) would
  // currently land on a required cycle position.
  draftNarrativeDue?: boolean;
}) {
  const [page, setPage] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = reports.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function goTo(next: number) {
    setPage(next);
    headingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <GlassCard id={id} className={id ? "scroll-mt-20" : undefined}>
      <h2
        ref={headingRef}
        className="mb-4 scroll-mt-6 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]"
      >
        {title}
      </h2>
      <div className="flex flex-col gap-3">
        {reports.length === 0 && (
          <p className="text-sm text-slate-600">Belum ada laporan.</p>
        )}
        {visible.map((r) => (
          <ReportEntry
            key={r.id}
            report={r}
            studentId={studentId}
            indicatorConfig={indicatorConfig}
            parentView={parentView}
            editable={editable}
            viewerId={viewerId}
            updateAction={updateAction}
            deleteAction={deleteAction}
            correctionAction={correctionAction}
            cyclePosition={cyclePositions?.get(r.id)}
            draftNarrativeDue={draftNarrativeDue}
          />
        ))}
      </div>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onChange={goTo}
        />
      )}
    </GlassCard>
  );
}

const PAGE_SIZE = 5;
const PAGE_WINDOW = 5;

function pageWindow(current: number, total: number): number[] {
  const size = Math.min(PAGE_WINDOW, total);
  let start = Math.max(1, current - Math.floor(size / 2));
  start = Math.min(start, total - size + 1);
  return Array.from({ length: size }, (_, i) => start + i);
}

function Pagination({
  currentPage,
  totalPages,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const base = `min-h-10 rounded-xl px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${GHOST_BUTTON}`;

  return (
    <nav
      aria-label="Halaman riwayat laporan"
      className="mt-4 flex flex-wrap items-center justify-center gap-1"
    >
      <button
        type="button"
        disabled={currentPage === 1}
        onClick={() => onChange(currentPage - 1)}
        className={`${base} text-[#17263D]`}
      >
        Sebelumnya
      </button>
      {pageWindow(currentPage, totalPages).map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === currentPage ? "page" : undefined}
          onClick={() => onChange(p)}
          className={`${base} min-w-8 ${
            p === currentPage
              ? "!bg-[#35C5D0] text-white shadow-[0_2px_8px_rgba(53,197,208,0.4)]"
              : "text-[#17263D]"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        disabled={currentPage === totalPages}
        onClick={() => onChange(currentPage + 1)}
        className={`${base} text-[#17263D]`}
      >
        Selanjutnya
      </button>
    </nav>
  );
}

// The newest report, shown on its own at the top of the parent's report tab.
// `#laporan-terbaru` deep links land here.
export function LatestReportCard({
  report,
  indicatorConfig,
  title = "Laporan Terbaru",
  anchorId = "laporan-terbaru",
  cyclePosition,
}: {
  report: ReportRow;
  indicatorConfig: IndicatorConfig;
  title?: string;
  anchorId?: string;
  cyclePosition?: number;
}) {
  return (
    <GlassCard id={anchorId} className="scroll-mt-20">
      <h2 className="mb-3 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        {title}
      </h2>
      <ReportEntry
        report={report}
        studentId=""
        indicatorConfig={indicatorConfig}
        parentView
        editable={false}
        cyclePosition={cyclePosition}
      />
    </GlassCard>
  );
}
