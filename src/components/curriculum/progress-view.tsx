import { GlassCard } from "@/components/ui/glass-card";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { StarRating } from "@/components/ui/star-rating";
import { AbilityChart, TechniqueChart, TechniqueLegend } from "@/components/curriculum/charts";
import { ProgressOverview, ProgressTrend } from "@/components/progress-trend";
import { overallSeries } from "@/lib/curriculum/overall";
import type { TrendReport } from "@/lib/curriculum/trend-adapter";
import type { IndicatorConfig } from "@/lib/indicators";
import { formatShortDate } from "@/lib/format-date";
import { buildProfile, currentAssessment, type SkillProfile } from "@/lib/curriculum/profile";
import { LEGACY_LABEL, hasLegacyHistory, legacyLatest, legacyRows, legacySeries, skillHasLegacy } from "@/lib/curriculum/legacy-view";
import { abilitySeries } from "@/lib/curriculum/series";
import { coverageLabel, techniqueSeries, techniqueSummary } from "@/lib/curriculum/summary";
import { achievementTimeline, formatMeasure, personalRecords } from "@/lib/curriculum/results";
import { currentLevel, levelEligibility } from "@/lib/curriculum/levels";
import { STATUS_LABEL } from "@/lib/curriculum/status";
import { HALF_POINT_NOTE, STAR_MEANING, formatStars } from "@/lib/curriculum/stars";
import { levelLabel, type CurriculumData, type CurriculumSkill, type Level } from "@/lib/curriculum/types";
import type { ActionState } from "@/lib/action-result";

export const WATER_DISCLAIMER =
  "Penilaian menunjukkan kemampuan dalam kondisi latihan yang dicatat. Anak tetap memerlukan pengawasan di sekitar air.";

type Audience = "parent" | "pelatih";
type ConfirmAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// ---------- the six skills side by side (no combined score) ----------
function ProfileCard({ p, legacy }: { p: SkillProfile; legacy: boolean }) {
  const { skill } = p;
  return (
    <li className="flex flex-col gap-1.5 rounded-2xl border border-white/60 bg-white/70 p-3.5 shadow-[0_2px_10px_rgba(23,38,61,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <p className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">{skill.name}</p>
        {p.level && (
          <span className="shrink-0 rounded-full bg-[#DDF3F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#0B6470]">
            {levelLabel(p.level.level).split(" — ")[0]}
          </span>
        )}
      </div>

      {!p.started ? (
        legacy ? (
          <p className="text-sm text-slate-600">{LEGACY_LABEL} tersedia</p>
        ) : (
          <p className="text-sm text-slate-500">{STATUS_LABEL.belum_dimulai}</p>
        )
      ) : p.mastery ? (
        <>
          <p className="text-sm text-[#17263D]">
            <span className="text-xl font-bold">{p.mastery.mastered}</span>
            <span className="text-slate-500"> / {p.mastery.total} kompetensi dikuasai</span>
          </p>
          {p.mastery.mastered === 0 && p.mastery.needsPractice.length + p.mastery.notAssessed.length > 0 && (
            <p className="text-xs text-slate-500">Belum ada yang mencapai batas &ldquo;dikuasai&rdquo;; latihan masih berjalan.</p>
          )}
        </>
      ) : (
        <>
          {p.level && <p className="text-xs text-slate-600">{levelLabel(p.level.level).split(" — ")[1]}</p>}
          {p.latestTest ? (
            <p className="text-sm text-[#17263D]">
              Jarak terakhir <span className="font-bold">{p.latestTest.value}</span>
              {p.latestTest.targetValue !== null && <span className="text-slate-500"> dari target {num(p.latestTest.targetValue)} m</span>}
              {p.latestTest.assisted && <span className="text-slate-500"> (dengan bantuan)</span>}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Belum ada tes jarak.</p>
          )}
          {p.bestDistance && <p className="text-xs text-slate-600">Rekor pribadi {num(p.bestDistance.value)} m</p>}
        </>
      )}
      {p.lastAssessed && <p className="text-[11px] text-slate-400">Terakhir dinilai {formatShortDate(p.lastAssessed)}</p>}
    </li>
  );
}

// "Nilai terakhir sebelum pembaruan: 4/5 · 6 Okt 2025" -- shown only where the
// new curriculum has no assessment of the indicator yet.
function LegacyNote({ data, indicatorKey }: { data: CurriculumData; indicatorKey: string }) {
  const last = legacyLatest(data, indicatorKey);
  if (!last) return null;
  return (
    <span className="block text-[11px] text-slate-400">
      Sebelumnya (sebelum pembaruan kurikulum): {formatStars(last.score)}/5 &middot; {formatShortDate(last.date)}
    </span>
  );
}

// ---------- one skill in detail ----------
function latestSummary(data: CurriculumData, skill: CurriculumSkill) {
  const ordered = [...data.reports]
    .filter((r) => r.curriculumVersion !== null && (r.context.skills?.[skill.id] !== undefined || data.indicators.some((i) => i.skillId === skill.id && typeof r.scores[i.key] === "number")))
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  const r = ordered[0];
  if (!r) return null;
  const lv = r.context.skills?.[skill.id]?.level;
  const level: Level | null = lv === 1 || lv === 2 || lv === 3 ? lv : null;
  const s = techniqueSummary(data.indicators, skill.id, level, r);
  return s.percent === null ? null : { summary: s, date: r.sessionDate, level };
}

function SkillSection({
  data,
  skill,
  profile,
  audience,
  studentId,
  enrollmentId,
  confirmAction,
}: {
  data: CurriculumData;
  skill: CurriculumSkill;
  profile: SkillProfile;
  audience: Audience;
  studentId?: string;
  enrollmentId?: string;
  confirmAction?: ConfirmAction;
}) {
  const level = currentLevel(skill.id, data.levelEvents)?.level ?? null;
  const current = currentAssessment(data, skill, skill.hasLevels ? level : null);
  const latest = latestSummary(data, skill);
  const series = [...legacySeries(data, skill), ...techniqueSeries(data.indicators, skill.id, data.reports)];
  const hasLegacy = skillHasLegacy(data, skill);
  const abilities = abilitySeries(data, skill.id);
  const records = personalRecords(data.results, data.testTypes).filter((r) =>
    data.testTypes.some((t) => t.id === r.testTypeId && t.skillId === skill.id)
  );
  const checklist = data.testTypes.find((t) => t.skillId === skill.id && t.measure === "checklist");
  const checklistResult = checklist
    ? [...data.results].filter((r) => r.testTypeId === checklist.id).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0]
    : undefined;
  const eligibility =
    audience === "pelatih" && skill.hasLevels && level
      ? levelEligibility({
          skill,
          level,
          indicators: data.indicators,
          reports: data.reports,
          results: data.results,
          testTypes: data.testTypes,
          targets: data.targets,
          rules: data.rules,
        })
      : null;

  return (
    <details className="group rounded-2xl border border-white/60 bg-white/55 shadow-[0_2px_10px_rgba(23,38,61,0.05)]" id={`skill-${skill.slug}`}>
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">{skill.name}</span>
          {level && <span className="rounded-full bg-[#DDF3F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#0B6470]">{levelLabel(level)}</span>}
        </span>
        <span className="text-xs text-slate-500">
          {!profile.started
            ? hasLegacy
              ? LEGACY_LABEL
              : STATUS_LABEL.belum_dimulai
            : latest
              ? `Ringkasan penilaian ${latest.summary.percent}% · ${coverageLabel(latest.summary)}`
              : "Sudah dimulai, belum dinilai"}
          <span className="ml-2 text-slate-400 group-open:hidden">Lihat</span>
          <span className="ml-2 hidden text-slate-400 group-open:inline">Tutup</span>
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-white/60 px-4 pb-4 pt-3">
        {/* current state of every indicator, each with its own date */}
        <div>
          <h3 className="text-sm font-semibold text-[#17263D]">Keadaan terkini</h3>
          {current.multipleSessions && (
            <p className="text-[11px] text-slate-500">Indikator dinilai pada sesi yang berbeda; tanggal ditampilkan di tiap indikator.</p>
          )}
          {current.items.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">{skill.hasLevels && !level ? "Level awal belum ditentukan." : "Belum ada indikator aktif."}</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {current.items.map(({ indicator, status }) => (
                <li key={indicator.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm text-slate-700">{indicator.label}</span>
                  {status.state === "dinilai" ? (
                    <span className="flex items-center gap-1.5">
                      <StarRating value={status.score} size={14} />
                      <span className="text-[11px] text-slate-500">
                        {formatStars(status.score)}/5 &middot; {formatShortDate(status.date)}
                      </span>
                    </span>
                  ) : status.state === "tidak_berlaku" ? (
                    <span className="text-xs text-slate-500">Tidak berlaku ({status.reason})</span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {legacyLatest(data, indicator.key) ? "Belum dinilai dengan kurikulum baru" : STATUS_LABEL[status.state]}
                      <LegacyNote data={data} indicatorKey={indicator.key} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* mastery lists for skills without levels */}
        {profile.mastery && profile.mastery.total > 0 && hasLegacy && (
          <p className="-mb-2 text-[11px] text-slate-500">Dihitung dari penilaian kurikulum baru. Riwayat sebelum pembaruan ada di grafik di bawah dan di &ldquo;Riwayat kurikulum sebelumnya&rdquo;.</p>
        )}
        {profile.mastery && profile.mastery.total > 0 && (
          <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
            <div className="rounded-xl bg-[#E9FBF3] px-3 py-2">
              <p className="font-semibold text-[#1a8f6f]">Dikuasai ({profile.mastery.mastered})</p>
              <p>{profile.mastery.masteredLabels.join(", ") || "-"}</p>
            </div>
            <div className="rounded-xl bg-[#FFF8E1] px-3 py-2">
              <p className="font-semibold text-[#8a6900]">Perlu dilatih ({profile.mastery.needsPractice.length})</p>
              <p>{profile.mastery.needsPractice.join(", ") || "-"}</p>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-2">
              <p className="font-semibold text-slate-600">Belum dinilai ({profile.mastery.notAssessed.length})</p>
              <p>{profile.mastery.notAssessed.join(", ") || "-"}</p>
            </div>
          </div>
        )}

        {series.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-semibold text-[#17263D]">Ringkasan penilaian teknik</h3>
            <TechniqueChart segments={series} name={skill.name} />
          </div>
        )}

        {(abilities.length > 0 || checklistResult) && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#17263D]">Kemampuan nyata</h3>
            {abilities.map((s) => (
              <div key={s.type.id}>
                <p className="mb-1 flex flex-wrap items-baseline gap-x-3 text-xs text-slate-600">
                  <span className="font-semibold text-[#17263D]">{s.type.label}</span>
                  {s.best !== null && (
                    <span>
                      Rekor pribadi {num(s.best)} {s.unit}
                    </span>
                  )}
                  {s.target && (
                    <span>
                      Target {num(s.target.value)} {s.unit}
                    </span>
                  )}
                </p>
                <AbilityChart series={s} name={s.type.label} />
              </div>
            ))}
            {checklist && checklistResult && (
              <p className="rounded-xl bg-[#EEF9FB] px-3 py-2 text-sm text-[#17263D]">
                <span className="font-semibold">{checklist.label}:</span>{" "}
                {checklistResult.stepsPassed?.every(Boolean) ? "semua langkah terpenuhi" : `${formatMeasure(checklistResult, checklist)} terpenuhi`}
                <span className="text-xs text-slate-500"> &middot; {formatShortDate(checklistResult.sessionDate)}</span>
              </p>
            )}
            {records.length === 0 && abilities.length > 0 && (
              <p className="text-xs text-slate-500">Belum ada rekor pribadi yang valid (tervalidasi dan kondisi sebanding).</p>
            )}
          </div>
        )}

        {eligibility && level && (
          <div className="rounded-xl border border-[#35C5D0]/30 bg-[#F4FAFB] p-3">
            <h3 className="text-sm font-semibold text-[#17263D]">
              Syarat lulus {levelLabel(level)} &mdash; {skill.name}
            </h3>
            <p className="text-[11px] text-slate-500">
              Bukan rata-rata: setiap indikator wajib dan tes wajib harus memenuhi syarat. Kenaikan level dikonfirmasi pengajar.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {eligibility.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-xs">
                  <span className={c.ok ? "text-[#1a8f6f]" : "text-[#A3183C]"} aria-hidden="true">
                    {c.ok ? "✓" : "✗"}
                  </span>
                  <span className="text-slate-700">
                    <span className="font-medium text-[#17263D]">{c.label}</span> &mdash; {c.detail}
                    <span className="sr-only">{c.ok ? " (terpenuhi)" : " (belum terpenuhi)"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {level < 3 ? (
              eligibility.eligible && confirmAction && studentId && enrollmentId ? (
                <ToastForm action={confirmAction} className="mt-3">
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="enrollment_id" value={enrollmentId} />
                  <input type="hidden" name="group_id" value={skill.id} />
                  <ConfirmSubmitButton
                    message={`Konfirmasi ${skill.name} lulus ${levelLabel(level)} dan naik ke Level ${level + 1}?`}
                    className="!bg-[#35C5D0] px-3 py-2 text-sm !text-white"
                  >
                    Konfirmasi lulus &amp; naik ke Level {level + 1}
                  </ConfirmSubmitButton>
                </ToastForm>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Belum memenuhi syarat untuk dikonfirmasi.</p>
              )
            ) : (
              eligibility.eligible && <p className="mt-2 text-xs font-medium text-[#1a8f6f]">Seluruh syarat Level 3 terpenuhi.</p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

// Old indicators with their history, grouped as they were. Mapped ones say where
// they are drawn now; the rest stay visible here instead of disappearing.
export function LegacyHistoryCard({ data }: { data: CurriculumData }) {
  if (!hasLegacyHistory(data)) return null;
  const rows = legacyRows(data);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.group ?? "Lainnya", [...(groups.get(r.group ?? "Lainnya") ?? []), r]);
  const unmapped = rows.filter((r) => !r.mappedTo).length;

  return (
    <GlassCard>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span>
            <span className={HEADING}>Riwayat kurikulum sebelumnya</span>
            <span className="block text-xs text-slate-500">
              {LEGACY_LABEL} &middot; {rows.length} indikator{unmapped > 0 ? `, ${unmapped} belum punya padanan di kurikulum baru` : ""}
            </span>
          </span>
          <span className="text-xs text-slate-400 group-open:hidden">Lihat</span>
          <span className="hidden text-xs text-slate-400 group-open:inline">Tutup</span>
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Penilaian ini dibuat dengan indikator sebelum pembaruan. Tanggal dan nilainya tetap seperti saat dicatat. Nilai 0 pada riwayat
          lama ditandai &ldquo;belum dapat dipastikan&rdquo; karena dulu semua indikator otomatis berisi 0.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {[...groups.entries()].map(([group, list]) => (
            <div key={group}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group}</p>
              <ul className="mt-1 flex flex-col gap-2">
                {list.map((r) => (
                  <li key={r.key} className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-[#17263D]">{r.label}</span>
                      <span className="text-[11px] text-slate-500">
                        {r.mappedTo
                          ? `Ditampilkan sebagai ${r.mappedTo.skillName}${r.mappedTo.level ? ` L${r.mappedTo.level}` : ""} \u203a ${r.mappedTo.label}`
                          : "Belum ada padanan di kurikulum baru"}
                      </span>
                    </div>
                    {r.entries.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {r.entries
                          .slice(-8)
                          .map((e) => `${formatShortDate(e.date)}: ${formatStars(e.score)}`)
                          .join(" \u00b7 ")}
                        {r.entries.length > 8 ? ` (${r.entries.length} penilaian, 8 terakhir)` : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Belum ada nilai di atas 0.</p>
                    )}
                    {r.zeros > 0 && <p className="text-[11px] text-slate-400">{r.zeros} catatan bernilai 0: belum dapat dipastikan (data lama)</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </GlassCard>
  );
}

// ---------- achievements, records, star meaning ----------
export function AchievementsCard({ data, limit }: { data: CurriculumData; limit?: number }) {
  const all = achievementTimeline({
    results: data.results,
    testTypes: data.testTypes,
    targets: data.targets,
    skills: data.skills,
    levelEvents: data.levelEvents,
  });
  const timeline = limit ? all.slice(0, limit) : all;
  return (
    <GlassCard>
      <h2 className={HEADING}>{limit ? "Pencapaian Terbaru" : "Semua Pencapaian"}</h2>
      {timeline.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Belum ada pencapaian. Hasil tes dan kenaikan level akan muncul di sini.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {timeline.map((a, i) => (
            <li key={`${a.date}-${i}`} className="flex items-start gap-2.5 text-sm text-[#17263D]">
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  a.kind === "level" ? "bg-[#E9E5FF] text-[#4b3a9e]" : a.kind === "target" ? "bg-[#E9FBF3] text-[#1a8f6f]" : "bg-[#FFF3C4] text-[#8a6900]"
                }`}
                aria-hidden="true"
              >
                {a.kind === "level" ? "L" : a.kind === "target" ? "\u2713" : "\u2605"}
              </span>
              <span>
                {a.title}
                <span className="block text-[11px] text-slate-400">{formatShortDate(a.date)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

// Current personal records per test. Distance and duration stay in their own
// units; with-help results are listed apart and never replace the record.
export function PersonalRecordsCard({ data }: { data: CurriculumData }) {
  const records = personalRecords(data.results, data.testTypes);
  const rows = records
    .map((r) => {
      const type = data.testTypes.find((t) => t.id === r.testTypeId)!;
      const skill = data.skills.find((s) => s.id === type.skillId);
      const unit = r.kind === "waktu" || r.kind === "durasi" ? "detik" : "m";
      const label =
        r.kind === "waktu"
          ? `${skill?.name ?? type.label}: waktu ${num(r.distanceM ?? 0)} m`
          : r.kind === "durasi"
            ? type.label.replace(/^Tes /, "")
            : `${skill?.name ?? type.label}: jarak`;
      return { r, label, unit, order: skill?.sortOrder ?? 99 };
    })
    .sort((a, b) => a.order - b.order);
  return (
    <GlassCard>
      <h2 className={HEADING}>Rekor Pribadi</h2>
      <p className="mb-2 text-xs text-slate-500">
        Rekor hanya dari hasil yang divalidasi pengajar dengan kondisi sebanding. Hasil dengan bantuan/alat dicatat terpisah.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada rekor pribadi.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map(({ r, label, unit }) => (
            <li key={r.key} className="rounded-xl border border-[#35C5D0]/30 bg-[#EEF9FB] px-3 py-2.5">
              <p className="text-xs text-slate-600">
                {label}
                {r.assisted ? " (dengan bantuan)" : ""}
              </p>
              <p className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
                {num(r.value)} {unit}
              </p>
              <p className="text-[11px] text-slate-400">{formatShortDate(r.date)}</p>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

export function StarMeaningCard() {
  return (
    <GlassCard>
      <h2 className={HEADING}>Arti Bintang</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-700">
        {([5, 4, 3, 2, 1, 0] as const).map((n) => (
          <li key={n} className="flex items-start gap-2">
            <span className="w-10 shrink-0 font-semibold text-[#17263D]">{n === 0 ? "0" : `${n} \u2605`}</span>
            <span>
              <span className="font-medium text-[#17263D]">{STAR_MEANING[n].label}.</span> {STAR_MEANING[n].description}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{HALF_POINT_NOTE}</p>
    </GlassCard>
  );
}

// ---------- overall + per skill charts ----------
export function OverallCard({ data }: { data: CurriculumData }) {
  const segments = overallSeries(data);
  return (
    <GlassCard>
      <h2 className={HEADING}>Perkembangan Keseluruhan (Overall)</h2>
      <p className="mb-2 text-xs text-slate-500">
        Seluruh proses belajar dalam satu garis: tiap titik adalah rata-rata nilai semua indikator yang dinilai pada sesi itu. Menambah skill baru tidak menurunkan titik
        sebelumnya.
      </p>
      {segments.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada penilaian untuk digambarkan.</p>
      ) : (
        <TechniqueChart segments={segments} name="Overall" />
      )}
    </GlassCard>
  );
}

export function SkillChartsCard({ data }: { data: CurriculumData }) {
  const skills = [...data.skills].sort((a, b) => a.sortOrder - b.sortOrder);
  const skillSegments = (skill: CurriculumSkill) => [...legacySeries(data, skill), ...techniqueSeries(data.indicators, skill.id, data.reports)];
  const allSegments = skills.flatMap(skillSegments);
  return (
    <GlassCard>
      <h2 className={HEADING}>Perkembangan per Skill</h2>
      <p className="mb-3 text-xs text-slate-500">Ringkasan penilaian tiap skill. Riwayat sebelum pembaruan kurikulum ikut digambar bila sudah dipetakan.</p>
      <TechniqueLegend segments={allSegments} />
      <div className="mt-3 flex flex-col gap-4">
        {skills.map((skill) => {
          const segments = skillSegments(skill);
          const level = currentLevel(skill.id, data.levelEvents)?.level ?? null;
          return (
            <section key={skill.id} aria-label={skill.name} className="rounded-2xl border border-white/60 bg-white/55 p-3">
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#17263D]">
                {skill.name}
                {level && <span className="rounded-full bg-[#DDF3F6] px-2 py-0.5 text-[11px] font-semibold text-[#0B6470]">{levelLabel(level).split(" \u2014 ")[0]}</span>}
              </h3>
              {segments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Belum ada penilaian untuk skill ini.</p>
              ) : (
                <TechniqueChart segments={segments} name={skill.name} legend={false} />
              )}
            </section>
          );
        })}
      </div>
    </GlassCard>
  );
}

// The familiar per-indicator charts, folded away behind one dropdown.
export function IndicatorDetail({ trend }: { trend: { config: IndicatorConfig; reports: TrendReport[] } }) {
  return (
    <details className="group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 rounded-3xl border border-white/60 bg-white/70 px-5 py-3 shadow-[0_2px_10px_rgba(23,38,61,0.05)] [&::-webkit-details-marker]:hidden">
        <span>
          <span className={HEADING}>Lihat detail perkembangan</span>
          <span className="block text-xs text-slate-500">Grafik tiap indikator</span>
        </span>
        <span className="text-xs text-slate-400 group-open:hidden">Buka</span>
        <span className="hidden text-xs text-slate-400 group-open:inline">Tutup</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <ProgressTrend indicatorConfig={trend.config} reports={trend.reports} />
      </div>
    </details>
  );
}

// ---------- everything ----------
export function CurriculumProgress({
  data,
  audience,
  studentId,
  enrollmentId,
  confirmAction,
  hasPreCurriculum = false,
  trend,
}: {
  data: CurriculumData;
  audience: Audience;
  studentId?: string;
  enrollmentId?: string;
  confirmAction?: ConfirmAction;
  // reports written before the level curriculum exist for this child
  hasPreCurriculum?: boolean;
  // inputs for the familiar per-indicator charts (see trend-adapter)
  trend?: { config: IndicatorConfig; reports: TrendReport[] };
}) {
  const profiles = buildProfile(data);
  const lastNote = [...data.reports]
    .filter((r) => r.notes && r.curriculumVersion !== null)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0];

  return (
    <>
      <GlassCard>
        <h2 className={HEADING}>Profil Kemampuan</h2>
        <p className="mb-3 text-xs text-slate-500">
          Enam skill ditampilkan berdampingan. Tidak ada skor gabungan, karena tiap skill dinilai dengan cara dan standarnya sendiri.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <ProfileCard key={p.skill.id} p={p} legacy={skillHasLegacy(data, p.skill)} />
          ))}
        </ul>
        <p className="mt-3 rounded-xl bg-[#FFF8E1] px-3 py-2 text-xs text-[#6b5200]" role="note">
          {WATER_DISCLAIMER}
        </p>
        {hasPreCurriculum && (
          <p className="mt-2 text-xs text-slate-500">
            Laporan sebelum kurikulum level tetap ada di riwayat dengan label &ldquo;Penilaian sebelum kurikulum level&rdquo; dan tidak dipetakan ke Level 1&ndash;3.
          </p>
        )}
      </GlassCard>

      {lastNote && (
        <GlassCard>
          <h2 className={HEADING}>Catatan Pengajar</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{lastNote.notes}</p>
          <p className="mt-1 text-[11px] text-slate-400">{formatShortDate(lastNote.sessionDate)}</p>
        </GlassCard>
      )}

      <OverallCard data={data} />
      <SkillChartsCard data={data} />
      {trend && <ProgressOverview indicatorConfig={trend.config} reports={trend.reports} />}
      {trend && <IndicatorDetail trend={trend} />}

      <GlassCard id="level" className="scroll-mt-20">
        <h2 className={HEADING}>Rincian Per Skill</h2>
        <div className="mt-3 flex flex-col gap-3">
          {profiles.map((p) => (
            <SkillSection
              key={p.skill.id}
              data={data}
              skill={p.skill}
              profile={p}
              audience={audience}
              studentId={studentId}
              enrollmentId={enrollmentId}
              confirmAction={confirmAction}
            />
          ))}
        </div>
      </GlassCard>

      <AchievementsCard data={data} limit={8} />
      <LegacyHistoryCard data={data} />
    </>
  );
}
