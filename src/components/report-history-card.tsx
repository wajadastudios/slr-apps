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
import { summarizeLevelGroups } from "@/lib/level-summary";
import { levelLabel, levelsFor, usesStars, type AssessmentType } from "@/lib/programs";
import { AccordionItem } from "@/components/ui/accordion";
import { formatShortDate } from "@/lib/format-date";
import {
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
};

type ReportAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function ReportEntry({
  report,
  studentId,
  indicatorConfig,
  parentView,
  editable,
  updateAction,
  deleteAction,
}: {
  report: ReportRow;
  studentId: string;
  indicatorConfig: IndicatorConfig;
  parentView: boolean;
  editable: boolean;
  updateAction?: ReportAction;
  deleteAction?: ReportAction;
}) {
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

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

  if (editing && editable && updateAction) {
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

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Catatan</label>
            <GlassTextarea name="notes" rows={3} defaultValue={report.notes ?? ""} />
          </div>

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
        <div className="mt-2">
          <span className="rounded-full bg-[#FFC800]/20 px-2.5 py-0.5 text-xs font-medium text-[#8a6900]">
            Diajar pengajar pengganti (menggantikan {report.substitute_for})
          </span>
        </div>
      )}

      {report.notes && (
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

      {editable && (
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
    </div>
  );
}

export function ReportHistoryCard({
  reports,
  indicatorConfig,
  parentView = false,
  editable = false,
  studentId = "",
  updateAction,
  deleteAction,
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
  // Pengajar-only: shows Edit/Hapus controls per report.
  editable?: boolean;
  studentId?: string;
  updateAction?: ReportAction;
  deleteAction?: ReportAction;
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
            updateAction={updateAction}
            deleteAction={deleteAction}
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
}: {
  report: ReportRow;
  indicatorConfig: IndicatorConfig;
  title?: string;
  anchorId?: string;
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
      />
    </GlassCard>
  );
}
