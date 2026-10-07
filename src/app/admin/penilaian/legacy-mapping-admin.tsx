"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassSelect } from "@/components/ui/glass-select";
import { ToastForm } from "@/components/ui/toast-form";
import { ImpactConfirm } from "@/components/admin/impact-confirm";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { applyAutoMappingAction, setLegacyMappingAction, setSkillLevelMappingAction } from "./legacy-actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export type MapOption = { id: string; label: string; skillName: string; level: number | null };

export type MapItem = {
  key: string;
  label: string;
  group: string | null;
  scores: number;
  zeros: number;
  // stored decision (null = none yet)
  status: "auto" | "manual" | "review" | "skipped" | null;
  targetId: string | null;
  // what the system would propose
  proposalAuto: boolean;
  proposalTargetId: string | null;
  reason: string;
  needsLevel: boolean;
  skillId: string | null;
  candidateIds: string[];
};

export type MapSkill = { id: string; name: string; hasLevels: boolean };

export type MapStats = {
  keys: number;
  done: number;
  auto: number;
  manual: number;
  skipped: number;
  pendingAuto: number;
  needsReview: number;
  scores: number;
  scoresDone: number;
  nonZeroDone: number;
};

function describe(o: MapOption | undefined) {
  return o ? `${o.skillName}${o.level ? ` · Level ${o.level}` : ""} › ${o.label}` : "-";
}

function Stat({ value, label, tone = "" }: { value: number; label: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border border-white/60 px-3.5 py-2.5 ${tone || "bg-white/60"}`}>
      <p className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  );
}

// the select + save for one old indicator
function ChooseTarget({
  programId,
  item,
  options,
  preferred,
  label,
}: {
  programId: string;
  item: MapItem;
  options: MapOption[];
  preferred: string[];
  label: string;
}) {
  const bySkill = new Map<string, MapOption[]>();
  for (const o of options) bySkill.set(o.skillName, [...(bySkill.get(o.skillName) ?? []), o]);
  const preferredOptions = options.filter((o) => preferred.includes(o.id));

  return (
    <ToastForm action={setLegacyMappingAction} pendingLabel="Menyimpan..." className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="program_id" value={programId} />
      <input type="hidden" name="legacy_key" value={item.key} />
      <label className="flex min-w-[220px] flex-1 flex-col gap-1">
        <span className="text-xs text-slate-600">{label}</span>
        <GlassSelect name="target" defaultValue={item.targetId ?? ""} required className="text-sm" glassChevron>
          <option value="" disabled>
            Pilih indikator tujuan
          </option>
          {preferredOptions.length > 0 && (
            <optgroup label="Paling sesuai">
              {preferredOptions.map((o) => (
                <option key={`p-${o.id}`} value={o.id}>
                  {describe(o)}
                </option>
              ))}
            </optgroup>
          )}
          {[...bySkill.entries()].map(([skill, list]) => (
            <optgroup key={skill} label={skill}>
              {list.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.level ? `Level ${o.level} · ` : ""}
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </GlassSelect>
      </label>
      <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-4 py-2 text-sm`}>
        Simpan pemetaan
      </GlassButton>
    </ToastForm>
  );
}

function SkipButtons({ programId, item, skipped }: { programId: string; item: MapItem; skipped: boolean }) {
  return (
    <ToastForm action={setLegacyMappingAction} pendingLabel="Menyimpan..." className="inline">
      <input type="hidden" name="program_id" value={programId} />
      <input type="hidden" name="legacy_key" value={item.key} />
      <input type="hidden" name="target" value={skipped ? "reset" : "skip"} />
      <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-1.5 text-xs`}>
        {skipped ? "Tinjau lagi" : "Jangan dipetakan"}
      </GlassButton>
    </ToastForm>
  );
}

export function LegacyMappingAdmin({
  programId,
  programName,
  ready,
  stats,
  items,
  options,
  skills,
}: {
  programId: string;
  programName: string;
  ready: boolean;
  stats: MapStats;
  items: MapItem[];
  options: MapOption[];
  skills: MapSkill[];
}) {
  const optionById = new Map(options.map((o) => [o.id, o]));
  const done = items.filter((i) => i.status === "auto" || i.status === "manual");
  const skipped = items.filter((i) => i.status === "skipped");
  const waiting = items.filter((i) => i.status !== "auto" && i.status !== "manual" && i.status !== "skipped");
  const readyToApply = waiting.filter((i) => i.proposalAuto);
  const review = waiting.filter((i) => !i.proposalAuto);
  const bySkill = new Map<string, MapItem[]>();
  for (const i of review) bySkill.set(i.skillId ?? "?", [...(bySkill.get(i.skillId ?? "?") ?? []), i]);

  if (!ready) {
    return (
      <GlassCard>
        <h2 className={HEADING}>Riwayat Lama</h2>
        <p className="mt-1 text-sm text-slate-700">
          Tabel pemetaan belum ada di database. Jalankan migrasi <code>0050_legacy_indicator_map.sql</code> di Supabase SQL Editor terlebih dahulu.
        </p>
      </GlassCard>
    );
  }

  if (items.length === 0) {
    return (
      <GlassCard>
        <h2 className={HEADING}>Riwayat Lama</h2>
        <p className="mt-1 text-sm text-slate-600">{programName} tidak punya nilai dari indikator lama yang perlu dipetakan.</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassCard>
        <h2 className={HEADING}>Riwayat Lama &rarr; Kurikulum Baru</h2>
        <p className="mt-1 text-sm text-slate-600">
          Laporan dan nilai dari sebelum kurikulum level <strong>tidak diubah sedikit pun</strong>. Di sini Anda hanya menentukan indikator baru mana yang
          menampilkan nilai lama itu pada grafik dan riwayat. Nilai tetap memakai tanggal sesi aslinya. Indikator yang belum punya padanan tetap tampil di
          &ldquo;Riwayat kurikulum sebelumnya&rdquo;.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={stats.keys} label="indikator lama" />
          <Stat value={stats.done} label="sudah dipetakan" tone="bg-[#E9FBF3]" />
          <Stat value={stats.pendingAuto} label="siap diterapkan otomatis" tone="bg-[#EEF9FB]" />
          <Stat value={stats.needsReview} label="perlu ditinjau" tone="bg-[#FFF8E1]" />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {stats.scoresDone} dari {stats.scores} nilai tersimpan sudah punya padanan ({stats.nonZeroDone} bernilai di atas 0 dan tampil di grafik). Nilai 0 pada data
          lama tidak digambar karena tidak bisa dibedakan dari &ldquo;belum dinilai&rdquo;.
        </p>

        {stats.pendingAuto > 0 && (
          <ToastForm action={applyAutoMappingAction} pendingLabel="Menerapkan..." className="mt-3">
            <input type="hidden" name="program_id" value={programId} />
            <ImpactConfirm
              primary
              label={`Terapkan ${stats.pendingAuto} pemetaan otomatis`}
              title="Terapkan pemetaan otomatis?"
              impacts={[
                "Hanya menyimpan pasangan indikator lama dan baru yang artinya jelas sama.",
                "Laporan, nilai bintang, tanggal, catatan, dan pengajar lama tidak diubah.",
                "Pilihan yang sudah Anda tetapkan sendiri tidak ditimpa. Aman dijalankan ulang.",
              ]}
              confirmLabel="Ya, terapkan"
            />
          </ToastForm>
        )}
      </GlassCard>

      {readyToApply.length > 0 && (
        <GlassCard>
          <h2 className={HEADING}>Siap diterapkan otomatis</h2>
          <p className="text-xs text-slate-500">Pasangan yang artinya jelas sama. Belum tersimpan sampai Anda menekan tombol di atas.</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {readyToApply.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-[#17263D]">{i.label}</span>
                  <span className="text-xs text-slate-500"> ({i.group ?? "-"})</span>
                </span>
                <span className="text-xs text-[#0B6470]">{describe(optionById.get(i.proposalTargetId ?? ""))}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {review.length > 0 && (
        <GlassCard>
          <h2 className={HEADING}>Perlu ditinjau admin</h2>
          <p className="text-xs text-slate-500">
            Sistem tidak menebak bila satu indikator lama bisa berarti lebih dari satu indikator baru (misalnya indikator gaya yang kini ada di tiga level).
          </p>
          <div className="mt-3 flex flex-col gap-5">
            {[...bySkill.entries()].map(([skillId, list]) => {
              const skill = skills.find((s) => s.id === skillId);
              return (
                <section key={skillId} aria-label={skill?.name ?? "Lainnya"} className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <h3 className="text-sm font-semibold text-[#17263D]">{skill?.name ?? "Kelompok tidak dikenal"}</h3>
                  {skill?.hasLevels && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-[#EEF9FB] px-3 py-2">
                      <span className="text-xs text-slate-700">Petakan semua indikator {skill.name} yang menunggu ke level:</span>
                      {[1, 2, 3].map((l) => (
                        <ToastForm key={l} action={setSkillLevelMappingAction} pendingLabel="Menyimpan..." className="inline">
                          <input type="hidden" name="program_id" value={programId} />
                          <input type="hidden" name="skill_id" value={skill.id} />
                          <input type="hidden" name="level" value={l} />
                          <ImpactConfirm
                            label={`Level ${l}`}
                            title={`Petakan ${list.length} indikator ${skill.name} ke Level ${l}?`}
                            impacts={[
                              `Nilai lama ${skill.name} akan ditampilkan sebagai Level ${l} pada grafik anak.`,
                              "Pilih level yang sesuai dengan kemampuan anak saat nilai itu dicatat.",
                              "Anda masih bisa mengubah tiap indikator satu per satu.",
                            ]}
                            confirmLabel={`Ya, Level ${l}`}
                          />
                        </ToastForm>
                      ))}
                    </div>
                  )}
                  <ul className="mt-2 flex flex-col gap-3">
                    {list.map((i) => (
                      <li key={i.key} className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#17263D]">{i.label}</p>
                            <p className="text-xs text-slate-500">
                              {i.group ?? "-"} &middot; {i.scores} nilai ({i.scores - i.zeros} di atas 0)
                            </p>
                            <p className="mt-0.5 text-xs text-[#6b5200]">{i.reason}</p>
                          </div>
                          <SkipButtons programId={programId} item={i} skipped={false} />
                        </div>
                        <ChooseTarget programId={programId} item={i} options={options} preferred={i.candidateIds} label="Tampilkan nilai lama ini sebagai" />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </GlassCard>
      )}

      {done.length > 0 && (
        <GlassCard>
          <details>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <span className={HEADING}>
                Sudah dipetakan <span className="text-sm font-normal text-slate-500">({done.length})</span>
              </span>
              <span className="text-xs text-slate-400">Lihat</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {done.map((i) => (
                <li key={i.key} className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-[#17263D]">
                      <span className="font-medium">{i.label}</span> <span className="text-xs text-slate-500">({i.group ?? "-"})</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-[#0B6470]">
                      {describe(optionById.get(i.targetId ?? ""))}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{i.status === "manual" ? "dipilih admin" : "otomatis"}</span>
                    </span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-[#1597A3]">Ubah pemetaan</summary>
                    <ChooseTarget programId={programId} item={i} options={options} preferred={i.candidateIds} label="Ganti indikator tujuan" />
                    <div className="mt-1.5">
                      <SkipButtons programId={programId} item={i} skipped={false} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        </GlassCard>
      )}

      {skipped.length > 0 && (
        <GlassCard>
          <details>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <span className={HEADING}>
                Tidak dipetakan <span className="text-sm font-normal text-slate-500">({skipped.length})</span>
              </span>
              <span className="text-xs text-slate-400">Lihat</span>
            </summary>
            <p className="mt-1 text-xs text-slate-500">Riwayatnya tetap tampil di &ldquo;Riwayat kurikulum sebelumnya&rdquo; pada akun orang tua.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {skipped.map((i) => (
                <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span>
                    {i.label} <span className="text-xs text-slate-500">({i.group ?? "-"})</span>
                  </span>
                  <SkipButtons programId={programId} item={i} skipped />
                </li>
              ))}
            </ul>
          </details>
        </GlassCard>
      )}
    </div>
  );
}
