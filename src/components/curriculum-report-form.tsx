"use client";

import { useMemo, useState } from "react";
import { ToastForm } from "@/components/ui/toast-form";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { StarRating } from "@/components/ui/star-rating";
import { MediaFileInput } from "@/components/media-file-input";
import { NarrativeField } from "@/components/narrative-field";
import { AttendanceProvider, AttendanceSelect, LateNoticeField, PresentOnly, useIsAbsent } from "@/components/report-attendance";
import { coverageLabel } from "@/lib/curriculum/summary";
import { indicatorStatus, skillStarted } from "@/lib/curriculum/status";
import { currentLevel } from "@/lib/curriculum/levels";
import { HALF_POINT_NOTE, STAR_MEANING, starText } from "@/lib/curriculum/stars";
import { LEVEL_NAMES, levelLabel, type CurriculumData, type CurriculumIndicator, type CurriculumSkill, type Level, type TestType } from "@/lib/curriculum/types";
import {
  liveIndicators,
  previewForm,
  skillLevel,
  skillTests,
  toPayload,
  validateForm,
  type FormState,
  type ItemMode,
  type ItemState,
  type SkillPreview,
  type TestState,
} from "@/lib/curriculum/form-state";
import { formatShortDate } from "@/lib/format-date";
import type { ActionState } from "@/lib/action-result";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export type CurriculumFormEditing = {
  reportId: string;
  sessionDate: string;
  sessionNumber: number | null;
  attendance: string | null;
  lateNotice: boolean;
  notes: string | null;
  nextFocus: string | null;
  isDraft: boolean;
};

const CARD = "rounded-2xl border border-white/60 bg-white/55 p-3 shadow-[0_2px_10px_rgba(23,38,61,0.05)]";
const LABEL = "text-xs font-medium text-slate-600";
const CHIP = "inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors";

// ---------- one indicator ----------
const MODES: { value: ItemMode; label: string }[] = [
  { value: "dinilai", label: "Dinilai" },
  { value: "unset", label: "Tidak dinilai" },
  { value: "na", label: "Tidak berlaku" },
];

function IndicatorRow({
  indicator,
  item,
  previous,
  onChange,
}: {
  indicator: CurriculumIndicator;
  item: ItemState;
  previous: string | null;
  onChange: (next: ItemState) => void;
}) {
  const [rubric, setRubric] = useState(false);
  const mode = item.mode;

  return (
    <li className={`${CARD} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#17263D]">
            {indicator.label}
            {!indicator.required && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">tidak wajib</span>}
          </p>
          {indicator.description && <p className="text-xs text-slate-500">{indicator.description}</p>}
          {previous && <p className="mt-0.5 text-[11px] text-slate-400">Terakhir: {previous} (hanya rujukan, bukan penilaian hari ini)</p>}
        </div>
        <button
          type="button"
          onClick={() => setRubric((v) => !v)}
          aria-expanded={rubric}
          className="min-h-10 rounded-lg px-2 text-xs font-semibold text-[#1597A3] hover:bg-[#35C5D0]/15"
        >
          {rubric ? "Tutup rubrik" : "Lihat rubrik"}
        </button>
      </div>

      {rubric && (
        <div className="rounded-xl bg-[#EEF9FB] px-3 py-2 text-xs text-slate-700">
          {indicator.rubric && <p className="mb-1.5">{indicator.rubric}</p>}
          <ul className="flex flex-col gap-0.5">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <li key={n}>
                <strong>{n} ★ {STAR_MEANING[n].label}:</strong> {STAR_MEANING[n].description}
              </li>
            ))}
            <li>
              <strong>0:</strong> {STAR_MEANING[0].description}
            </li>
          </ul>
          <p className="mt-1 text-slate-500">{HALF_POINT_NOTE}</p>
        </div>
      )}

      <div role="radiogroup" aria-label={`Status penilaian ${indicator.label}`} className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => onChange({ mode: m.value, score: m.value === "dinilai" ? item.score : null, reason: m.value === "na" ? item.reason : "" })}
            className={`${CHIP} ${mode === m.value ? "bg-[#35C5D0] text-white shadow-[0_2px_8px_rgba(53,197,208,0.4)]" : "border border-white/70 bg-white/70 text-slate-700 hover:bg-[#35C5D0]/15"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "dinilai" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <StarRating value={item.score ?? 0} size={30} label={indicator.label} onChange={(v) => onChange({ mode: "dinilai", score: v === 0 ? null : v, reason: "" })} />
            <button
              type="button"
              onClick={() => onChange({ mode: "dinilai", score: 0, reason: "" })}
              aria-pressed={item.score === 0}
              className={`${CHIP} ${item.score === 0 ? "bg-slate-700 text-white" : "border border-white/70 bg-white/70 text-slate-700"}`}
            >
              0 &middot; Belum mampu
            </button>
          </div>
          <p className={`text-xs ${item.score === null ? "font-medium text-[#A3183C]" : "text-slate-600"}`}>
            {item.score === null ? "Pilih bintang (atau 0) untuk menyimpan penilaian ini." : starText(item.score)}
          </p>
        </div>
      )}

      {mode === "na" && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Alasan tidak berlaku (wajib)</span>
          <GlassInput value={item.reason} onChange={(e) => onChange({ mode: "na", score: null, reason: e.target.value })} placeholder="mis. kolam tidak punya tangga" className="text-sm" />
        </label>
      )}
    </li>
  );
}

// ---------- tests ----------
function TestFields({
  type,
  state,
  onChange,
  targetText,
}: {
  type: TestType;
  state: TestState;
  onChange: (next: TestState) => void;
  targetText: string | null;
}) {
  const set = (patch: Partial<TestState>) => onChange({ ...state, ...patch });
  const yesNo = (value: boolean | null, onPick: (v: boolean) => void, name: string) => (
    <div role="radiogroup" aria-label={name} className="flex gap-1.5">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onPick(v)}
          className={`${CHIP} ${value === v ? "bg-[#35C5D0] text-white" : "border border-white/70 bg-white/70 text-slate-700"}`}
        >
          {v ? "Ya" : "Tidak"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/50 p-3">
      {targetText && <p className="text-xs font-medium text-[#0B6470]">{targetText}</p>}

      {type.measure === "distance_m" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Hasil aktual (meter)</span>
            <GlassInput inputMode="decimal" value={state.distance} onChange={(e) => set({ distance: e.target.value })} className="text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Waktu tempuh, detik (opsional)</span>
            <GlassInput inputMode="decimal" value={state.time} onChange={(e) => set({ time: e.target.value })} className="text-sm" />
          </label>
        </div>
      )}
      {type.measure === "duration_s" && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Durasi (detik)</span>
          <GlassInput inputMode="decimal" value={state.duration} onChange={(e) => set({ duration: e.target.value })} className="max-w-xs text-sm" />
        </label>
      )}
      {type.measure === "checklist" && (
        <fieldset className="flex flex-col gap-1">
          <legend className={LABEL}>Langkah rangkaian yang terpenuhi</legend>
          {(type.steps ?? []).map((step, i) => (
            <label key={step} className="flex min-h-10 items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={state.steps[i] ?? false}
                onChange={(e) => set({ steps: state.steps.map((v, n) => (n === i ? e.target.checked : v)) })}
                className="h-5 w-5"
              />
              {i + 1}. {step}
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Bantuan / alat</span>
        <div role="radiogroup" aria-label="Bantuan atau alat" className="flex flex-wrap gap-1.5">
          {[
            { v: false, label: "Tanpa alat/bantuan fisik" },
            { v: true, label: "Dengan alat/bantuan" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={state.assisted === o.v}
              onClick={() => set({ assisted: o.v })}
              className={`${CHIP} ${state.assisted === o.v ? "bg-[#35C5D0] text-white" : "border border-white/70 bg-white/70 text-slate-700"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {state.assisted && (
          <GlassInput value={state.assistanceNote} onChange={(e) => set({ assistanceNote: e.target.value })} placeholder="Sebutkan alat/bantuan (mis. papan, pelampung)" className="text-sm" />
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Kondisi pelaksanaan</span>
        <GlassInput value={state.conditions} onChange={(e) => set({ conditions: e.target.value })} placeholder="mis. kolam 25 m, tenang" className="text-sm" />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={state.comparable} onChange={(e) => set({ comparable: e.target.checked })} className="h-5 w-5" />
        Kondisi sebanding dengan tes sebelumnya
      </label>

      {type.measure !== "checklist" && (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>Syarat teknik / pelaksanaan terpenuhi</span>
          {yesNo(state.techniqueMet, (v) => set({ techniqueMet: v }), "Syarat teknik terpenuhi")}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Status validasi pengajar</span>
        <select
          value={state.validation}
          onChange={(e) => set({ validation: e.target.value as TestState["validation"] })}
          className="min-h-11 max-w-xs rounded-xl border border-white/60 bg-white/70 px-3 text-sm"
        >
          <option value="divalidasi">Divalidasi</option>
          <option value="belum_divalidasi">Belum divalidasi</option>
          <option value="tidak_valid">Tidak valid</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Catatan tes</span>
        <GlassTextarea rows={2} value={state.notes} onChange={(e) => set({ notes: e.target.value })} className="text-sm" />
      </label>
    </div>
  );
}

// ---------- preview ----------
function PreviewBox({ preview }: { preview: SkillPreview }) {
  const { summary, tests, eligibility, level, skill } = preview;
  const bullets: string[] = [];
  if (summary && summary.percent !== null) bullets.push(`Ringkasan teknik: ${summary.percent}% · ${coverageLabel(summary)}`);
  for (const t of tests) {
    if (t.type.measure === "checklist") {
      bullets.push(`${t.type.label}: ${t.target?.met ? "lulus" : "belum lulus"}`);
      continue;
    }
    bullets.push(
      t.newPersonalRecord
        ? `Rekor pribadi ${t.type.label.replace(/^Tes /, "")} akan diperbarui${t.previousBest !== null ? ` (sebelumnya ${String(t.previousBest).replace(".", ",")})` : ""}.`
        : `Rekor pribadi tidak berubah${t.previousBest !== null ? ` (terbaik ${String(t.previousBest).replace(".", ",")})` : ""}.`
    );
    if (t.target) bullets.push(t.target.met ? "Target standar tercapai." : `Target standar belum tercapai: ${t.target.reasons.join("; ")}.`);
  }
  if (eligibility && level) {
    bullets.push(
      eligibility.eligible
        ? `Memenuhi syarat lulus ${levelLabel(level)}. Konfirmasi kelulusan dilakukan pengajar setelah laporan tersimpan.`
        : `${levelLabel(level)} belum lulus (${eligibility.checks.filter((c) => !c.ok).length} syarat belum terpenuhi).`
    );
  }
  if (bullets.length === 0) return null;
  return (
    <div className="rounded-xl bg-[#F4FAFB] px-3 py-2 text-xs text-slate-700" aria-label={`Pratinjau ${skill.name}`}>
      <p className="mb-1 font-semibold text-[#17263D]">Pratinjau setelah disimpan</p>
      <ul className="list-disc pl-4">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------- one skill ----------
function SkillPanel({
  data,
  skill,
  state,
  setState,
  preview,
  editingReportId,
}: {
  data: CurriculumData;
  skill: CurriculumSkill;
  state: FormState;
  setState: (updater: (s: FormState) => FormState) => void;
  preview: SkillPreview | undefined;
  editingReportId: string | null;
}) {
  const ss = state.skills[skill.id];
  const level = skillLevel(data, skill, state);
  const recorded = currentLevel(skill.id, data.levelEvents);
  const indicators = level === null && skill.hasLevels ? [] : liveIndicators(data, skill.id, level);
  const history = useMemo(() => data.reports.filter((r) => r.id !== editingReportId), [data.reports, editingReportId]);
  const started = skillStarted(skill.id, data.indicators.filter((i) => i.skillId === skill.id).map((i) => i.key), history, data.levelEvents);
  const tests = level === null && skill.hasLevels ? [] : skillTests(data, skill.id).filter((t) => !t.levelSpecific || level !== null);

  const assessed = indicators.filter((i) => ss.items[i.key]?.mode === "dinilai" && ss.items[i.key].score !== null).length;

  function setItem(key: string, next: ItemState) {
    setState((s) => ({
      ...s,
      skills: { ...s.skills, [skill.id]: { ...s.skills[skill.id], items: { ...s.skills[skill.id].items, [key]: next } } },
    }));
  }
  function setTest(id: string, next: TestState) {
    setState((s) => ({ ...s, tests: { ...s.tests, [id]: next } }));
  }

  function previousFor(ind: CurriculumIndicator): string | null {
    const st = indicatorStatus(ind, history, started);
    return st.state === "dinilai" ? `${String(st.score).replace(".", ",")} ★ pada ${formatShortDate(st.date)}` : null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-[#35C5D0]/30 bg-white/40 p-3 sm:p-4" aria-label={skill.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">{skill.name}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {level !== null && <span className="rounded-full bg-[#DDF3F6] px-2.5 py-1 font-semibold text-[#0B6470]">{levelLabel(level)}</span>}
          <span className="rounded-full bg-white/70 px-2.5 py-1 font-medium text-slate-600">
            Dinilai {assessed}/{indicators.length}
          </span>
        </div>
      </div>

      {skill.hasLevels && !recorded && (
        <div className="flex flex-col gap-2 rounded-xl bg-[#FFF8E1] p-3">
          <p className="text-sm font-semibold text-[#6b5200]">Asesmen penempatan: pilih level awal anak untuk {skill.name}</p>
          <p className="text-xs text-[#6b5200]">Level tercatat setelah laporan disimpan, dan hanya berlaku untuk gaya ini.</p>
          <div role="radiogroup" aria-label={`Level awal ${skill.name}`} className="flex flex-wrap gap-1.5">
            {([1, 2, 3] as Level[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={ss.placementLevel === l}
                onClick={() =>
                  setState((s) => ({ ...s, skills: { ...s.skills, [skill.id]: { ...s.skills[skill.id], placementLevel: l } } }))
                }
                className={`${CHIP} ${ss.placementLevel === l ? "bg-[#35C5D0] text-white" : "border border-white/70 bg-white/80 text-slate-700"}`}
              >
                Level {l} &mdash; {LEVEL_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
      )}

      {indicators.length > 0 && (
        <ul className="flex flex-col gap-2">
          {indicators.map((ind) => (
            <IndicatorRow
              key={ind.key}
              indicator={ind}
              item={ss.items[ind.key] ?? { mode: "unset", score: null, reason: "" }}
              previous={previousFor(ind)}
              onChange={(next) => setItem(ind.key, next)}
            />
          ))}
        </ul>
      )}
      {indicators.length === 0 && (!skill.hasLevels || level !== null) && (
        <p className="text-sm text-slate-500">Belum ada indikator aktif untuk skill ini.</p>
      )}

      {tests.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-[#17263D]">Tes kemampuan</h4>
          {tests.map((t) => {
            const ts = state.tests[t.id];
            const target = data.targets.find((g) => g.testTypeId === t.id && g.active && g.level === (t.levelSpecific ? level : null));
            const unit = t.measure === "distance_m" ? "m" : "detik";
            const targetText = target
              ? `Target: ${String(target.value).replace(".", ",")} ${unit}${target.requiresUnassisted ? " tanpa bantuan" : ""}${target.requiresTechnique ? ", sesuai syarat teknik" : ""}`
              : t.measure === "checklist"
                ? "Lulus bila seluruh langkah terpenuhi."
                : "Belum ada target standar untuk tes ini; hasil tetap tercatat.";
            return (
              <div key={t.id} className={CARD}>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[#17263D]">
                  <input
                    type="checkbox"
                    checked={ts.enabled}
                    onChange={(e) => setTest(t.id, { ...ts, enabled: e.target.checked })}
                    className="h-5 w-5"
                  />
                  Catat {t.label}
                </label>
                {ts.enabled && <TestFields type={t} state={ts} onChange={(next) => setTest(t.id, next)} targetText={targetText} />}
              </div>
            );
          })}
        </div>
      )}

      {preview && <PreviewBox preview={preview} />}
    </section>
  );
}

// ---------- submit bar (reads attendance so izin/sakit is never blocked) ----------
function SubmitBar({ blocking, isObservation, editing }: { blocking: string[]; isObservation: boolean; editing: boolean }) {
  const absent = useIsAbsent();
  const blocked = !absent && blocking.length > 0;
  return (
    <div className="flex flex-col gap-2">
      {blocked && (
        <div role="alert" className="rounded-xl bg-[#FFF0F3] px-3 py-2 text-xs text-[#7A1B36]">
          <p className="font-semibold">Lengkapi dulu sebelum menyimpan:</p>
          <ul className="list-disc pl-4">
            {blocking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <GlassButton
        type="submit"
        name="intent"
        value="final"
        disabled={blocked}
        className="w-fit !bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
      >
        {editing ? "Simpan Perubahan" : isObservation ? "Simpan Catatan" : "Simpan Laporan"}
      </GlassButton>
    </div>
  );
}

export function CurriculumReportForm({
  studentId,
  enrollmentId,
  data,
  defaultDate,
  defaultSessionNumber,
  editing,
  narrativeDue,
  action,
  initialState,
  error,
}: {
  studentId: string;
  enrollmentId: string;
  data: CurriculumData;
  defaultDate: string;
  defaultSessionNumber: number;
  editing: CurriculumFormEditing | null;
  narrativeDue: boolean;
  action: Action;
  initialState: FormState;
  error?: string | null;
}) {
  const [state, setStateRaw] = useState<FormState>(initialState);
  const [date, setDate] = useState(editing?.sessionDate ?? defaultDate);
  const setState = (updater: (s: FormState) => FormState) => setStateRaw((s) => updater(s));

  const skills = useMemo(() => [...data.skills].sort((a, b) => a.sortOrder - b.sortOrder), [data.skills]);
  const issues = useMemo(() => validateForm(data, state), [data, state]);
  const payload = useMemo(() => toPayload(data, state), [data, state]);
  const previews = useMemo(
    () => previewForm(data, state, { date, editingReportId: editing?.reportId ?? null }),
    [data, state, date, editing?.reportId]
  );

  function toggleSkill(id: string) {
    setState((s) => ({ ...s, skills: { ...s.skills, [id]: { ...s.skills[id], selected: !s.skills[id].selected } } }));
  }
  const selectedCount = skills.filter((s) => state.skills[s.id]?.selected).length;

  return (
    <ToastForm action={action} resetOnSuccess={!editing} className="flex flex-col gap-4">
      <AttendanceProvider initial={editing?.attendance ?? "hadir"}>
        {editing && <input type="hidden" name="report_id" value={editing.reportId} />}
        <input type="hidden" name="student_id" value={studentId} />
        <input type="hidden" name="enrollment_id" value={enrollmentId} />
        <input type="hidden" name="scores_json" value={JSON.stringify(payload.scores)} />
        <input type="hidden" name="assessment_json" value={JSON.stringify(payload.assessment)} />
        <input type="hidden" name="tests_json" value={JSON.stringify(payload.tests)} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Tanggal</label>
            <GlassInput name="session_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nomor Sesi</label>
            <GlassInput name="session_number" type="number" min={1} defaultValue={editing?.sessionNumber ?? defaultSessionNumber} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Kehadiran</label>
            <AttendanceSelect initial={editing?.attendance ?? "hadir"} />
            <LateNoticeField initial={editing?.lateNotice === true} />
          </div>
        </div>

        <PresentOnly note="Sesi izin/sakit tidak memuat penilaian atau tes. Catatan tetap boleh diisi.">
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-slate-800">Skill yang dinilai hari ini</legend>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => {
                  const on = state.skills[s.id]?.selected;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSkill(s.id)}
                      className={`${CHIP} min-h-11 ${on ? "bg-[#35C5D0] text-white shadow-[0_2px_8px_rgba(53,197,208,0.4)]" : "border border-white/70 bg-white/70 text-slate-700 hover:bg-[#35C5D0]/15"}`}
                    >
                      {on ? "✓ " : ""}
                      {s.name}
                    </button>
                  );
                })}
              </div>
              {selectedCount === 0 && (
                <p className="text-xs text-slate-500">
                  Belum ada skill dipilih. Membuka atau memilih skill tidak menilai apa pun; hanya indikator yang Anda tandai &ldquo;Dinilai&rdquo; yang tersimpan.
                </p>
              )}
            </fieldset>

            {skills
              .filter((s) => state.skills[s.id]?.selected)
              .map((s) => (
                <SkillPanel
                  key={s.id}
                  data={data}
                  skill={s}
                  state={state}
                  setState={setState}
                  preview={previews.find((p) => p.skill.id === s.id)}
                  editingReportId={editing?.reportId ?? null}
                />
              ))}

            {issues.warnings.length > 0 && (
              <ul className="list-disc rounded-xl bg-[#FFF8E1] px-6 py-2 text-xs text-[#6b5200]">
                {issues.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </PresentOnly>

        <NarrativeField required={narrativeDue} defaultValue={editing?.notes ?? ""} />

        <MediaFileInput label={editing ? "Tambah Foto/Video (opsional, lampiran lama tetap tersimpan)" : "Foto/Video (opsional)"} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Fokus Sesi Berikutnya</label>
          <GlassTextarea name="next_focus" rows={2} defaultValue={editing?.nextFocus ?? ""} />
        </div>

        {error && <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>}

        <SubmitBar blocking={issues.errors} isObservation={false} editing={!!editing && !editing.isDraft} />
      </AttendanceProvider>
    </ToastForm>
  );
}
