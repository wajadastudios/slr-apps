"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { AccordionItem } from "@/components/ui/accordion";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { MoveButtons } from "@/components/move-buttons";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { METRIC_LABELS } from "@/lib/performance";
import { formatMilestoneTargets, type Milestone } from "@/lib/milestones";
import { MilestoneForm } from "./milestone-form";
import {
  createMilestoneAction,
  updateMilestoneAction,
  toggleMilestoneActiveAction,
  moveMilestoneAction,
  deleteMilestoneAction,
} from "./actions";

export type MilestoneItem = Milestone & { used: number };

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const UNSAVED_WARNING = "Perubahan belum disimpan. Simpan atau batalkan sebelum berpindah.";

type Selection = string | "new" | null;

function fingerprint(m: Milestone) {
  return [m.label, m.level, m.metric_type, m.stroke, m.distance_m, m.bronze, m.silver, m.gold].join("|");
}

function describe(m: Milestone) {
  return `${METRIC_LABELS[m.metric_type]}${m.stroke ? ` · ${m.stroke}` : ""}${
    m.distance_m ? ` · ${Number(m.distance_m)} m` : ""
  }`;
}

function BackArrow() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12.5 5.5L8 10l4.5 4.5" />
    </svg>
  );
}

// Master-detail: list on the left, editor on the right (desktop). On a phone
// only one of them shows at a time: the list first, then the editor as a full
// page with a way back.
export function MilestoneWorkspace({
  milestones,
  levels,
  focusId,
  programId,
}: {
  milestones: MilestoneItem[];
  levels: string[];
  focusId?: string;
  programId: string;
}) {
  const [selected, setSelected] = useState<Selection>(focusId ?? null);
  const [lastFocus, setLastFocus] = useState(focusId);
  const [search, setSearch] = useState("");
  const [closedLevels, setClosedLevels] = useState<string[]>([]);
  // dirty is only trusted for the editor it was reported by
  const [dirtyState, setDirtyState] = useState<{ key: string; dirty: boolean }>({ key: "", dirty: false });
  const [resetCount, setResetCount] = useState(0);
  const [warn, setWarn] = useState(false);

  // a freshly created milestone arrives as ?sel=<id>: open it
  if (focusId !== lastFocus) {
    setLastFocus(focusId);
    if (focusId) {
      setSelected(focusId);
      setWarn(false);
    }
  }

  const current =
    selected && selected !== "new" ? (milestones.find((m) => m.id === selected) ?? null) : null;
  const editing: Selection = selected === "new" ? "new" : current ? current.id : null;

  const editorKey =
    editing === "new"
      ? `new:${resetCount}`
      : current
        ? `${current.id}:${fingerprint(current)}:${resetCount}`
        : "";
  const dirty = dirtyState.key === editorKey && dirtyState.dirty;

  function go(next: Selection) {
    if (dirty && next !== editing) {
      setWarn(true);
      return;
    }
    setWarn(false);
    setSelected(next);
  }

  function discard() {
    setResetCount((c) => c + 1);
    setDirtyState({ key: "", dirty: false });
    setWarn(false);
  }

  const query = search.trim().toLowerCase();
  const matches = (m: MilestoneItem) =>
    !query ||
    [m.label, m.level, METRIC_LABELS[m.metric_type], m.stroke ?? ""].some((t) =>
      t.toLowerCase().includes(query)
    );

  const levelOrder = [...new Set([...milestones].sort((a, b) => a.sort_order - b.sort_order).map((m) => m.level))];
  const groups = levelOrder.map((level) => {
    const all = milestones.filter((m) => m.level === level).sort((a, b) => a.sort_order - b.sort_order);
    return { level, all, shown: all.filter(matches) };
  });
  const visibleGroups = groups.filter((g) => g.shown.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      {/* ---------- list ---------- */}
      <GlassCard className={editing ? "hidden lg:block" : ""}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className={HEADING}>Daftar Milestone</h2>
          <GlassButton
            type="button"
            onClick={() => go("new")}
            className={`${PRIMARY_BUTTON} px-3.5 py-2 text-sm`}
          >
            + Tambah Milestone
          </GlassButton>
        </div>

        <GlassInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari milestone..."
          aria-label="Cari milestone"
          className="mb-3 text-sm"
        />

        {milestones.length === 0 && (
          <p className="text-sm text-slate-600">Belum ada milestone. Tambahkan yang pertama.</p>
        )}
        {milestones.length > 0 && visibleGroups.length === 0 && (
          <p className="text-sm text-slate-600">Tidak ada milestone yang cocok dengan &ldquo;{search}&rdquo;.</p>
        )}

        <div className="flex flex-col gap-2">
          {visibleGroups.map(({ level, all, shown }) => {
            const open = !!query || !closedLevels.includes(level);
            return (
              <AccordionItem
                key={level}
                variant="ortu"
                chevronSize="sm"
                open={open}
                onToggle={() =>
                  setClosedLevels((cur) =>
                    cur.includes(level) ? cur.filter((l) => l !== level) : [...cur, level]
                  )
                }
                className="rounded-2xl border border-white/60 bg-white/50"
                headerClassName="min-h-12 rounded-2xl px-3 py-1.5"
                header={
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#17263D]">{level}</span>
                    <span className="rounded-full bg-[#35C5D0]/15 px-2 py-0.5 text-xs font-medium text-[#1597A3]">
                      {query ? `${shown.length}/${all.length}` : all.length}
                    </span>
                  </span>
                }
              >
                <ul className="flex flex-col gap-1 px-2 pb-2 pt-0.5">
                  {shown.map((m) => {
                    const index = all.findIndex((x) => x.id === m.id);
                    const isSelected = editing === m.id;
                    return (
                      <li key={m.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => go(m.id)}
                          aria-current={isSelected ? "true" : undefined}
                          className={`min-h-14 min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]/70 ${
                            isSelected
                              ? "bg-[#35C5D0]/15 ring-2 ring-[#35C5D0]/50"
                              : "hover:bg-[#35C5D0]/10 active:bg-[#35C5D0]/20"
                          } ${m.active ? "" : "opacity-70"}`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 shrink-0 rounded-full ${m.active ? "bg-[#55D6A6]" : "bg-slate-300"}`}
                            />
                            <span className="truncate text-sm font-medium text-[#17263D]">{m.label}</span>
                            {!m.active && (
                              <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                Nonaktif
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate pl-4 text-xs text-slate-500">
                            {m.level} &middot; {formatMilestoneTargets(m)}
                          </span>
                        </button>
                        {!query && (
                          <div className="flex shrink-0 gap-1">
                            <MoveButtons
                              action={moveMilestoneAction}
                              id={m.id}
                              fields={{ program_id: programId }}
                              canUp={index > 0}
                              canDown={index < all.length - 1}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </AccordionItem>
            );
          })}
        </div>
      </GlassCard>

      {/* ---------- editor ---------- */}
      <div className={`lg:sticky lg:top-4 ${editing ? "" : "hidden lg:block"}`}>
        <GlassCard>
          {!editing ? (
            <div className="py-8 text-center">
              <p className={HEADING}>Pilih milestone</p>
              <p className="mt-1 text-sm text-slate-600">
                Pilih milestone di daftar untuk mengubahnya, atau tambah milestone baru.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => go(null)}
                className="-ml-1 mb-3 flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-medium text-[#1597A3] transition-colors hover:bg-[#35C5D0]/10 active:bg-[#35C5D0]/20 lg:hidden"
              >
                <BackArrow />
                Kembali ke daftar milestone
              </button>

              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className={HEADING}>{current ? current.label : "Milestone baru"}</h2>
                  {current && (
                    <p className="text-xs text-slate-600">
                      {describe(current)} &middot;{" "}
                      {current.used > 0 ? `${current.used} lencana sudah terbuka` : "belum ada lencana"}
                    </p>
                  )}
                </div>
                {current && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      current.active ? "bg-[#55D6A6]/20 text-[#1a8f6f]" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {current.active ? "Aktif" : "Nonaktif"}
                  </span>
                )}
              </div>

              {warn && dirty && (
                <div
                  role="alert"
                  className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FFC800]/50 bg-[#FFF8E1] px-3 py-2 text-sm text-[#6b5200]"
                >
                  <span>{UNSAVED_WARNING}</span>
                  <button
                    type="button"
                    onClick={() => setWarn(false)}
                    className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-[#FFC800]/20"
                  >
                    Mengerti
                  </button>
                </div>
              )}

              <MilestoneForm
                key={editorKey}
                action={current ? updateMilestoneAction : createMilestoneAction}
                milestone={current ?? undefined}
                programId={programId}
                definitionLocked={(current?.used ?? 0) > 0}
                levels={levels}
                submitLabel={current ? "Simpan Perubahan" : "Tambah Milestone"}
                onDirtyChange={(d) => {
                  setDirtyState({ key: editorKey, dirty: d });
                  if (!d) setWarn(false);
                }}
                onCancel={discard}
              />

              {current && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/40 pt-3">
                  <ToastForm action={toggleMilestoneActiveAction} pendingLabel="Memproses...">
                    <input type="hidden" name="id" value={current.id} />
                    <input type="hidden" name="program_id" value={programId} />
                    <input type="hidden" name="next_active" value={(!current.active).toString()} />
                    <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-1.5 text-sm`}>
                      {current.active ? "Nonaktifkan" : "Aktifkan"}
                    </GlassButton>
                  </ToastForm>
                  {current.used === 0 ? (
                    <ToastForm action={deleteMilestoneAction} pendingLabel="Menghapus...">
                      <input type="hidden" name="id" value={current.id} />
                      <input type="hidden" name="program_id" value={programId} />
                      <ConfirmSubmitButton
                        message={`Hapus milestone "${current.label}"? Tindakan ini tidak bisa dibatalkan.`}
                        className="!border-red-300 !bg-red-500/10 px-3 py-1.5 text-sm !text-red-700 hover:!bg-red-500/20"
                      >
                        Hapus
                      </ConfirmSubmitButton>
                    </ToastForm>
                  ) : (
                    <span className="text-xs text-slate-500">
                      Tidak bisa dihapus karena sudah menghasilkan lencana &mdash; nonaktifkan saja.
                    </span>
                  )}
                </div>
              )}
              {!current && (
                <p className="mt-3 text-xs text-slate-500">
                  Milestone baru dievaluasi satu kali terhadap rekor yang sudah ada, lalu targetnya
                  tidak lagi mengubah lencana lama.
                </p>
              )}
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
