import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassSelect } from "@/components/ui/glass-select";
import { loadMilestones } from "@/lib/milestone-loader";
import { computeAwards } from "@/lib/milestones";
import { buildIndicatorConfig } from "@/lib/indicators";
import {
  ASSESSMENT_LABEL,
  PROGRAM_SELECT,
  RECORDS_LABEL,
  levelsFor,
  normalizeProgram,
} from "@/lib/programs";
import { GOAL_UNITS } from "@/lib/personal-goals";
import { GHOST_BUTTON } from "@/lib/ui-classes";
import { MilestoneWorkspace } from "../milestone/milestone-workspace";
import { IndicatorWorkspace, type IndGroup } from "./indicator-workspace";
import { CurriculumAdmin, type AdminSkill } from "./curriculum-admin";
import { loadCurriculumMode } from "@/lib/curriculum/loader";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function PenilaianPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; tab?: string; sel?: string; error?: string }>;
}) {
  const { program: programParam, tab: tabParam, sel, error } = await searchParams;
  const supabase = await createClient();

  const { data: programRows } = await supabase
    .from("programs")
    .select(`${PROGRAM_SELECT}, active`)
    .order("name");
  const programs = (programRows ?? []).map((p) => ({ ...normalizeProgram(p), active: p.active !== false }));

  const program = programs.find((p) => p.id === programParam) ?? programs.find((p) => p.active) ?? programs[0];
  // The level-curriculum tab only appears once its content has been prepared
  // (migrations 0048 + 0049); a program without it behaves exactly as before.
  const { count: seededCount, error: seededError } = program
    ? await supabase
        .from("indicators")
        .select("id", { count: "exact", head: true })
        .eq("program_id", program.id)
        .not("seed_key", "is", null)
    : { count: 0, error: null };
  const hasCurriculum = !seededError && (seededCount ?? 0) > 0;
  const curriculumMode = program && hasCurriculum ? await loadCurriculumMode(supabase, program.id) : "legacy";
  const tab = tabParam === "rekor" ? "rekor" : tabParam === "kurikulum" && hasCurriculum ? "kurikulum" : "indikator";

  if (!program) {
    return (
      <GlassCard>
        <h1 className={HEADING}>Penilaian Program</h1>
        <p className="mt-1 text-sm text-slate-600">Belum ada program.</p>
      </GlassCard>
    );
  }

  const levels = levelsFor(program.assessment_type);
  const tabLink = (id: string, label: string) => (
    <Link
      href={`/admin/penilaian?program=${program.id}&tab=${id}`}
      replace
      aria-current={tab === id ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition-colors ${
        tab === id ? "bg-[#35C5D0] text-white shadow-[0_2px_10px_rgba(53,197,208,0.4)]" : `text-slate-600 ${GHOST_BUTTON}`
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <GlassCard>
        <h1 className={`mb-3 ${HEADING}`}>Penilaian Program</h1>

        <form className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800" htmlFor="program-select">
              Program
            </label>
            <GlassSelect
              id="program-select"
              name="program"
              defaultValue={program.id}
              className="min-w-[220px]"
              glassChevron
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.active ? "" : " (nonaktif)"}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton type="submit" className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">
            Tampilkan
          </GlassButton>
        </form>

        <p className="mt-3 text-sm text-slate-600">
          Jenis penilaian: <strong>{ASSESSMENT_LABEL[program.assessment_type]}</strong> &middot; Rekor:{" "}
          <strong>{RECORDS_LABEL[program.records_mode]}</strong> &middot; versi template {program.template_version}
        </p>

        {program.assessment_type === "support_level" && (
          <p className="mt-3 rounded-xl bg-[#DDF3F6] px-3 py-2 text-sm text-[#0B6470]">
            Indikator program ini menggambarkan kemampuan dan tingkat dukungan di air. Ini catatan pembelajaran renang,
            bukan diagnosis medis: jangan menulis diagnosis atau istilah klinis pada nama indikator, dan orang tua tidak
            melihatnya sebagai diagnosis.
          </p>
        )}

        <nav aria-label="Bagian penilaian" className="mt-3 inline-flex gap-1 rounded-2xl border border-white/60 bg-white/70 p-1">
          {tabLink("indikator", "Indikator")}
          {hasCurriculum && tabLink("kurikulum", "Kurikulum Level")}
          {tabLink("rekor", "Rekor & Milestone")}
        </nav>
        {error && <p className="mt-3 text-sm text-red-700">{decodeURIComponent(error)}</p>}
      </GlassCard>

      {tab === "kurikulum" && (
        <CurriculumTab programId={program.id} programName={program.name} mode={curriculumMode} />
      )}

      {tab === "indikator" && (
        <>
          {curriculumMode === "levels_v1" && (
            <GlassCard tone="soft">
              <p className="text-sm text-slate-700">
                Program ini memakai <strong>kurikulum level</strong>. Indikator di bawah adalah daftar lengkap termasuk indikator lama
                yang disembunyikan. Atur rubrik, level, dan target di tab <strong>Kurikulum Level</strong>.
              </p>
            </GlassCard>
          )}
          {levels && (
            <GlassCard tone="soft">
              <p className="text-sm font-semibold text-[#17263D]">Skala penilaian (tetap)</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Pengajar memilih salah satu dari tingkat berikut untuk setiap indikator. Skala ini dipakai
                untuk seluruh indikator {program.name} dan tidak diubah dari sini.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {levels.map((l) => (
                  <li key={l.value} className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-[#0b5f8a]">
                    {l.label}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
          <IndicatorTab programId={program.id} sel={sel} />
        </>
      )}

      {tab === "rekor" && (
        <RecordsTab
          programId={program.id}
          programName={program.name}
          mode={program.records_mode}
          sel={sel}
        />
      )}
    </div>
  );
}

async function CurriculumTab({
  programId,
  programName,
  mode,
}: {
  programId: string;
  programName: string;
  mode: "legacy" | "levels_v1";
}) {
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("indicator_groups")
    .select("id, name, slug, has_levels, sort_order")
    .eq("program_id", programId)
    .not("slug", "is", null)
    .order("sort_order");
  const ids = (groups ?? []).map((g) => g.id as string);
  const [indRes, ruleRes, typeRes] = await Promise.all([
    supabase
      .from("indicators")
      .select("id, group_id, level, label, description, rubric, required, active, sort_order")
      .eq("program_id", programId)
      .not("seed_key", "is", null),
    ids.length
      ? supabase.from("skill_rules").select("group_id, level, mastery_min_score, min_evidence_sessions, requires_test").in("group_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase.from("skill_test_types").select("id, group_id, label, measure, level_specific, active, sort_order").eq("program_id", programId),
  ]);
  const typeIds = (typeRes.data ?? []).map((t) => t.id as string);
  const { data: targetRows } = typeIds.length
    ? await supabase
        .from("skill_test_targets")
        .select("id, test_type_id, level, target_value, requires_unassisted, requires_technique, version, active")
        .in("test_type_id", typeIds)
    : { data: [] as Record<string, unknown>[] };

  const skills: AdminSkill[] = (groups ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    hasLevels: g.has_levels === true,
    rules: (ruleRes.data ?? [])
      .filter((r) => r.group_id === g.id)
      .map((r) => ({
        level: r.level === null ? null : Number(r.level),
        masteryMinScore: Number(r.mastery_min_score),
        minEvidenceSessions: Number(r.min_evidence_sessions),
        requiresTest: r.requires_test === true,
      })),
    indicators: (indRes.data ?? [])
      .filter((i) => i.group_id === g.id)
      .map((i) => ({
        id: i.id as string,
        level: i.level === null ? null : Number(i.level),
        label: i.label as string,
        description: (i.description as string | null) ?? null,
        rubric: (i.rubric as string | null) ?? null,
        required: i.required !== false,
        active: i.active === true,
        sortOrder: Number(i.sort_order ?? 0),
      })),
    tests: (typeRes.data ?? [])
      .filter((t) => t.group_id === g.id)
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map((t) => ({
        id: t.id as string,
        label: t.label as string,
        measure: t.measure as "distance_m" | "duration_s" | "checklist",
        levelSpecific: t.level_specific === true,
        active: t.active !== false,
        targets: (targetRows ?? [])
          .filter((x) => x.test_type_id === t.id)
          .map((x) => ({
            id: x.id as string,
            level: x.level === null ? null : Number(x.level),
            value: Number(x.target_value),
            requiresUnassisted: x.requires_unassisted !== false,
            requiresTechnique: x.requires_technique !== false,
            version: Number(x.version),
            active: x.active !== false,
          })),
      })),
  }));

  return <CurriculumAdmin key={programId} programId={programId} programName={programName} mode={mode} skills={skills} />;
}

async function IndicatorTab({ programId, sel }: { programId: string; sel?: string }) {
  const supabase = await createClient();
  const [groupsRes, indicatorsRes, usedRes] = await Promise.all([
    supabase.from("indicator_groups").select("id, name, sort_order, active").eq("program_id", programId),
    supabase.from("indicators").select("id, key, label, group_id, sort_order, active").eq("program_id", programId),
    supabase.rpc("used_indicator_keys"),
  ]);

  if (groupsRes.error) {
    return (
      <GlassCard>
        <p className="text-sm text-slate-700">
          Struktur indikator belum aktif di database. Jalankan migrasi <code>0030_indicator_groups.sql</code>{" "}
          terlebih dahulu.
        </p>
      </GlassCard>
    );
  }

  const config = buildIndicatorConfig(groupsRes.data ?? [], indicatorsRes.data ?? []);
  const used = new Set<string>(
    ((usedRes.data as unknown as (string | { used_indicator_keys?: string })[] | null) ?? []).map((k) =>
      typeof k === "string" ? k : String(k.used_indicator_keys ?? "")
    )
  );

  const groups: IndGroup[] = config.groups.map((g) => ({
    id: g.id,
    name: g.name,
    sort_order: g.sort_order,
    active: g.active,
    indicators: g.indicators.map((i) => ({
      id: i.id,
      key: i.key,
      label: i.label,
      sort_order: i.sort_order,
      active: i.active,
      used: used.has(i.key),
    })),
  }));

  // key={programId} forces a remount on program switch -- without it React
  // reuses the same component instance and its "closed" accordion state
  // (computed once, lazily, from the FIRST program's group ids) never gets
  // recomputed for the new program's completely different group ids, so
  // every group reads as "open" (none of them match the stale closed list).
  // This was exactly the audit's "halaman konfigurasi/penilaian admin masih
  // terasa panjang bila semua kelompok terbuka" finding.
  return <IndicatorWorkspace key={programId} programId={programId} groups={groups} focus={sel} />;
}

async function RecordsTab({
  programId,
  programName,
  mode,
  sel,
}: {
  programId: string;
  programName: string;
  mode: "medals" | "personal_goals" | "none";
  sel?: string;
}) {
  if (mode === "none") {
    return (
      <GlassCard>
        <h2 className={HEADING}>Tidak ada rekor</h2>
        <p className="mt-1 text-sm text-slate-600">
          {programName} tidak memakai rekor, medali, atau target jarak/waktu. Program ini hanya memakai catatan
          sesi.
        </p>
      </GlassCard>
    );
  }

  if (mode === "personal_goals") {
    return (
      <GlassCard>
        <h2 className={HEADING}>Target Pribadi</h2>
        <p className="mt-1 text-sm text-slate-600">
          {programName} tidak memakai medali perunggu, perak, atau emas. Target disusun per peserta oleh pengajar
          atau admin, dinilai dari baseline dan target peserta itu sendiri &mdash; tanpa perbandingan antarpeserta.
        </p>
        <p className="mt-3 text-sm font-semibold text-[#17263D]">Satuan target yang tersedia</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {GOAL_UNITS.map((u) => (
            <li key={u.id} className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-[#0b5f8a]">
              {u.label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-semibold text-[#17263D]">Status yang ditampilkan</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {["Target pribadi tercapai", "Personal best", "Lebih mandiri dari baseline"].map((label) => (
            <li key={label} className="rounded-full bg-[#DDF7EE] px-2.5 py-1 text-xs font-medium text-[#0f6b52]">
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Untuk menyusun target seorang peserta, buka Laporan &rarr; pilih peserta &rarr; Target Pribadi.
        </p>
      </GlassCard>
    );
  }

  const supabase = await createClient();
  const { error: tableError } = await supabase.from("milestones").select("id").limit(1);
  if (tableError) {
    return (
      <GlassCard>
        <p className="text-sm text-slate-700">
          Tabel milestone belum ada di database. Jalankan migrasi <code>0031_milestones_and_record_ownership.sql</code>{" "}
          terlebih dahulu.
        </p>
      </GlassCard>
    );
  }

  const milestones = await loadMilestones(supabase, programId);

  // Frozen awards count as-is; records saved before milestones were editable
  // (awards null) are evaluated against this program's current targets.
  const { data: recordRows } = await supabase.from("performance_records").select("*");
  const usage = new Map<string, number>();
  for (const row of recordRows ?? []) {
    if (row.program_id && row.program_id !== programId) continue;
    const awards =
      (row.awards as Record<string, string> | null) ??
      computeAwards(
        {
          metric_type: row.metric_type,
          stroke: row.stroke,
          distance_m: row.distance_m === null ? null : Number(row.distance_m),
          duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
        },
        milestones
      );
    for (const id of Object.keys(awards)) usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  const items = milestones.map((m) => ({ ...m, used: usage.get(m.id) ?? 0 }));
  const levels = [...new Set(milestones.map((m) => m.level))];

  return (
    <>
      <GlassCard tone="soft">
        <details className="text-sm text-slate-700">
          <summary className="cursor-pointer select-none font-semibold text-[#17263D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]/70">
            Aturan lencana
          </summary>
          <p className="mt-2">
            Lencana ditentukan <strong>saat rekor disimpan</strong>, berdasarkan target yang berlaku pada saat itu.
            Mengubah target hanya berlaku untuk rekor yang disimpan sesudahnya &mdash; lencana yang sudah diperoleh
            tidak akan hilang. Milestone yang sudah menghasilkan lencana tidak bisa dihapus (cukup dinonaktifkan) dan
            metrik, gaya, serta jaraknya terkunci. Milestone hanya berlaku untuk {programName}.
          </p>
        </details>
      </GlassCard>
      <MilestoneWorkspace milestones={items} levels={levels} focusId={sel} programId={programId} />
    </>
  );
}
