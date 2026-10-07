"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassSelect } from "@/components/ui/glass-select";
import { AccordionItem } from "@/components/ui/accordion";
import { ToastForm } from "@/components/ui/toast-form";
import { DeleteConfirm } from "@/components/admin/impact-confirm";
import { MoveButtons } from "@/components/move-buttons";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import {
  createGroupAction,
  createIndicatorAction,
  deleteIndicatorAction,
  moveGroupAction,
  moveIndicatorAction,
  renameGroupAction,
  toggleGroupActiveAction,
  toggleIndicatorActiveAction,
  updateIndicatorAction,
} from "@/app/admin/program/indicator-actions";

export type IndItem = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  active: boolean;
  // how many saved reports scored it / how many OLD indicators are shown under it
  usedCount: number;
  mappedFrom: number;
  level: number | null;
  description: string | null;
  rubric: string | null;
  required: boolean;
  // part of the level curriculum (false = an indicator of the old model)
  seeded: boolean;
};
export type IndGroup = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  hasLevels: boolean;
  // a skill of the level curriculum (has a slug)
  curriculum: boolean;
  indicators: IndItem[];
};

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const UNSAVED_WARNING = "Perubahan belum disimpan. Simpan atau batalkan sebelum berpindah.";
const FIELD = "text-xs text-slate-600";

// g:<id> group, i:<id> indicator, "new-group", "new-indicator"
type Selection = string | null;

function BackArrow() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12.5 5.5L8 10l4.5 4.5" />
    </svg>
  );
}

function StatusPill({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active ? "bg-[#55D6A6]/20 text-[#0f6b52]" : "bg-slate-200 text-slate-600"
      }`}
    >
      {label ?? (active ? "Aktif" : "Nonaktif")}
    </span>
  );
}

const levelText = (l: number | null) => (l ? `Level ${l}` : "");

// The group editor: a name (and, for a new skill, whether it has levels).
function GroupForm({
  action,
  programId,
  id,
  initialName,
  submitLabel,
  askLevels,
  onDirtyChange,
  onCancel,
}: {
  action: (prev: null, formData: FormData) => Promise<never> | Promise<unknown>;
  programId: string;
  id?: string;
  initialName: string;
  submitLabel: string;
  askLevels?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const dirty = name !== initialName;
  return (
    <ToastForm action={action as never} resetOnSuccess={!id} className="flex flex-col gap-4">
      <input type="hidden" name="program_id" value={programId} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="flex flex-col gap-1">
        <label className={FIELD} htmlFor="group-name">
          Nama kelompok
        </label>
        <GlassInput
          id="group-name"
          name="name"
          value={name}
          required
          onChange={(e) => {
            setName(e.target.value);
            onDirtyChange(e.target.value !== initialName);
          }}
          className="text-sm"
        />
      </div>
      {askLevels && (
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="has_levels" className="h-5 w-5" />
          Skill ini memakai Level 1&ndash;3 (seperti gaya renang)
        </label>
      )}
      <SaveBar submitLabel={submitLabel} dirty={dirty} onCancel={onCancel} />
    </ToastForm>
  );
}

function SaveBar({ submitLabel, dirty, onCancel }: { submitLabel: string; dirty: boolean; onCancel: () => void }) {
  return (
    <div className="sticky bottom-2 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-[0_4px_16px_rgba(23,38,61,0.08)] lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
      <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-5 py-2 text-sm`}>
        {submitLabel}
      </GlassButton>
      <button
        type="button"
        onClick={onCancel}
        disabled={!dirty}
        className="min-h-10 rounded-xl px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Batalkan perubahan
      </button>
      {dirty && <span className="text-xs text-[#8a6900]">Belum disimpan</span>}
    </div>
  );
}

// The indicator editor (new or existing). Level-curriculum indicators also have
// a description, a rubric and a "required to pass" flag.
function IndicatorForm({
  action,
  programId,
  item,
  group,
  groups,
  curriculumMode,
  submitLabel,
  onDirtyChange,
  onCancel,
}: {
  action: (prev: null, formData: FormData) => Promise<never> | Promise<unknown>;
  programId: string;
  item?: IndItem;
  group?: IndGroup;
  groups: IndGroup[];
  curriculumMode: boolean;
  submitLabel: string;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
}) {
  const initial = {
    label: item?.label ?? "",
    groupId: group?.id ?? "",
    level: item?.level ?? null,
    description: item?.description ?? "",
    rubric: item?.rubric ?? "",
    required: item?.required ?? true,
  };
  const [label, setLabel] = useState(initial.label);
  const [groupId, setGroupId] = useState(initial.groupId);
  const [level, setLevel] = useState<number | null>(initial.level);
  const [description, setDescription] = useState(initial.description);
  const [rubric, setRubric] = useState(initial.rubric);
  const [required, setRequired] = useState(initial.required);

  const target = groups.find((g) => g.id === groupId);
  // a curriculum indicator carries the extra fields; so does a new one placed in a curriculum skill
  const curriculum = item ? item.seeded : curriculumMode && !!target?.curriculum;
  // an existing curriculum indicator can only move between skills of the same kind
  const choices = item?.seeded ? groups.filter((g) => g.curriculum && g.hasLevels === group?.hasLevels) : groups;
  const needsLevel = !item && curriculum && !!target?.hasLevels;

  const dirty =
    label !== initial.label ||
    groupId !== initial.groupId ||
    description !== initial.description ||
    rubric !== initial.rubric ||
    required !== initial.required ||
    (!item && needsLevel && level !== initial.level);
  const touch = (patch: Partial<{ label: string; groupId: string; description: string; rubric: string; required: boolean }>) => {
    const next = { label, groupId, description, rubric, required, ...patch };
    onDirtyChange(
      next.label !== initial.label ||
        next.groupId !== initial.groupId ||
        next.description !== initial.description ||
        next.rubric !== initial.rubric ||
        next.required !== initial.required
    );
  };

  return (
    <ToastForm action={action as never} resetOnSuccess={!item} className="flex flex-col gap-4">
      <input type="hidden" name="program_id" value={programId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="group_id" value={groupId} />
      {curriculum && <input type="hidden" name="curriculum" value="1" />}
      {needsLevel && <input type="hidden" name="level" value={level ?? ""} />}

      <div className="flex flex-col gap-1">
        <label className={FIELD} htmlFor="item-name">
          Nama indikator
        </label>
        <GlassInput
          id="item-name"
          name="label"
          value={label}
          required
          onChange={(e) => {
            setLabel(e.target.value);
            touch({ label: e.target.value });
          }}
          className="text-sm"
        />
        {item && item.usedCount > 0 && (
          <p className="text-[11px] text-slate-500">
            Nama baru berlaku untuk tampilan ke depan dan riwayat. Nilai dan tanggal laporan lama tidak berubah; nama sebelumnya tetap tercatat di jejak
            perubahan.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className={FIELD}>Kelompok</label>
        <GlassSelect
          value={groupId}
          required
          onChange={(e) => {
            setGroupId(e.target.value);
            touch({ groupId: e.target.value });
          }}
          className="text-sm"
          glassChevron
        >
          <option value="" disabled>
            Pilih kelompok
          </option>
          {choices.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
              {g.active ? "" : " (nonaktif)"}
            </option>
          ))}
        </GlassSelect>
        {item?.seeded && <p className="text-[11px] text-slate-500">Indikator kurikulum hanya bisa dipindah antar skill yang sejenis (sama-sama memakai level atau tidak).</p>}
      </div>

      {needsLevel && (
        <div className="flex flex-col gap-1">
          <label className={FIELD}>Level</label>
          <GlassSelect value={level ?? ""} required onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : null)} className="text-sm" glassChevron>
            <option value="" disabled>
              Pilih level
            </option>
            {[1, 2, 3].map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </GlassSelect>
        </div>
      )}
      {item?.seeded && item.level && <p className="text-xs text-slate-600">Level: {levelText(item.level)} (tidak bisa diubah; buat indikator baru untuk level lain)</p>}

      {curriculum && (
        <>
          <div className="flex flex-col gap-1">
            <label className={FIELD} htmlFor="item-desc">
              Deskripsi singkat
            </label>
            <GlassTextarea
              id="item-desc"
              name="description"
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                touch({ description: e.target.value });
              }}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={FIELD} htmlFor="item-rubric">
              Petunjuk penilaian (rubrik)
            </label>
            <GlassTextarea
              id="item-rubric"
              name="rubric"
              rows={4}
              value={rubric}
              onChange={(e) => {
                setRubric(e.target.value);
                touch({ rubric: e.target.value });
              }}
              className="text-sm"
            />
            <p className="text-[11px] text-slate-500">Tampil untuk pengajar lewat tombol &ldquo;Lihat rubrik&rdquo;. Perubahan tidak mengubah arti nilai lama.</p>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="required"
              checked={required}
              onChange={(e) => {
                setRequired(e.target.checked);
                touch({ required: e.target.checked });
              }}
              className="h-5 w-5"
            />
            Wajib untuk lulus level / dihitung dalam ringkasan
          </label>
        </>
      )}

      <SaveBar submitLabel={submitLabel} dirty={dirty} onCancel={onCancel} />
    </ToastForm>
  );
}

// Master-detail editor for one program's indicator groups and indicators.
export function IndicatorWorkspace({
  programId,
  groups,
  focus,
  mode,
}: {
  programId: string;
  groups: IndGroup[];
  focus?: string;
  mode: "legacy" | "levels_v1";
}) {
  const levelsMode = mode === "levels_v1";
  const [selected, setSelected] = useState<Selection>(focus ?? null);
  const [lastFocus, setLastFocus] = useState(focus);
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<string[]>(() => {
    const focusGroup = focus?.startsWith("g:")
      ? focus.slice(2)
      : focus?.startsWith("i:")
        ? groups.find((g) => g.indicators.some((i) => i.id === focus.slice(2)))?.id
        : undefined;
    const first = [...groups].sort((x, y) => x.sort_order - y.sort_order)[0]?.id;
    const open = focusGroup ?? first;
    return groups.filter((g) => g.id !== open).map((g) => g.id);
  });
  const [dirtyState, setDirtyState] = useState<{ key: string; dirty: boolean }>({ key: "", dirty: false });
  const [resetCount, setResetCount] = useState(0);
  const [warn, setWarn] = useState(false);

  if (focus !== lastFocus) {
    setLastFocus(focus);
    if (focus) {
      setSelected(focus);
      setWarn(false);
    }
  }

  // What the admin manages here: the curriculum's indicators once the program is
  // on levels (the old ones move to "Arsip kurikulum lama"); before that only the
  // old model, because curriculum indicators are still dormant.
  const managed = (i: IndItem) => (levelsMode ? i.seeded : !i.seeded);
  const archived = (i: IndItem) => levelsMode && !i.seeded;

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const indicatorById = new Map(groups.flatMap((g) => g.indicators.map((i) => [i.id, { item: i, group: g }] as const)));

  const kind = selected?.startsWith("g:")
    ? "group"
    : selected?.startsWith("i:")
      ? "indicator"
      : selected === "new-group" || selected === "new-indicator"
        ? selected
        : null;
  const selGroup = kind === "group" ? groupById.get(selected!.slice(2)) : undefined;
  const selInd = kind === "indicator" ? indicatorById.get(selected!.slice(2)) : undefined;
  const editing: Selection =
    kind === "group" ? (selGroup ? selected : null) : kind === "indicator" ? (selInd ? selected : null) : kind;

  const editorKey = editing
    ? `${editing}:${selGroup?.name ?? ""}:${selInd?.item.label ?? ""}:${selInd?.group.id ?? ""}:${resetCount}`
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
  const onDirty = (d: boolean) => {
    setDirtyState({ key: editorKey, dirty: d });
    if (!d) setWarn(false);
  };

  const query = search.trim().toLowerCase();
  const matches = (i: IndItem, g: IndGroup) => !query || i.label.toLowerCase().includes(query) || g.name.toLowerCase().includes(query);
  const visible = groups
    .map((g) => ({
      group: g,
      shown: g.indicators.filter((i) => managed(i) && matches(i, g)),
      old: g.indicators.filter((i) => archived(i) && matches(i, g)),
    }))
    .filter(({ group, shown, old }) => !query || shown.length > 0 || old.length > 0 || group.name.toLowerCase().includes(query));

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);
  // a skill can take new indicators of the new curriculum; a plain group only old-model ones
  const groupChoices = levelsMode ? sortedGroups.filter((g) => g.curriculum) : sortedGroups;

  const renderRow = (ind: IndItem, group: IndGroup, siblings: IndItem[]) => {
    const index = siblings.findIndex((x) => x.id === ind.id);
    const isSel = editing === `i:${ind.id}`;
    return (
      <li key={ind.id} className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(`i:${ind.id}`)}
          aria-current={isSel ? "true" : undefined}
          className={`min-h-12 min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]/70 ${
            isSel ? "bg-[#35C5D0]/15 ring-2 ring-[#35C5D0]/50" : "hover:bg-[#35C5D0]/10 active:bg-[#35C5D0]/20"
          } ${ind.active ? "" : "opacity-70"}`}
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${ind.active ? "bg-[#55D6A6]" : "bg-slate-300"}`} />
            <span className="truncate text-sm font-medium text-[#17263D]">{ind.label}</span>
            {!ind.active && <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Nonaktif</span>}
            {!ind.required && ind.seeded && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">tidak wajib</span>}
            {ind.usedCount > 0 && (
              <span className="shrink-0 rounded-full bg-[#EEF9FB] px-1.5 py-0.5 text-[10px] font-medium text-[#1597A3]">Terpakai {ind.usedCount}</span>
            )}
          </span>
        </button>
        {!query && !archived(ind) && (
          <div className="flex shrink-0 gap-1">
            <MoveButtons
              action={moveIndicatorAction}
              id={ind.id}
              fields={{ program_id: programId, group_id: group.id, level: ind.level === null ? "" : String(ind.level), scope: ind.seeded ? "seeded" : "old" }}
              canUp={index > 0}
              canDown={index < siblings.length - 1}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      {/* ---------- list ---------- */}
      <GlassCard className={editing ? "hidden lg:block" : ""}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={HEADING}>Kelompok &amp; Indikator</h2>
          <div className="flex flex-wrap gap-1.5">
            <GlassButton type="button" onClick={() => go("new-group")} className={`${SECONDARY_BUTTON} px-3 py-1.5 text-xs`}>
              + Kelompok
            </GlassButton>
            <GlassButton
              type="button"
              onClick={() => go("new-indicator")}
              disabled={groupChoices.length === 0}
              className={`${PRIMARY_BUTTON} px-3 py-1.5 text-xs`}
            >
              + Indikator
            </GlassButton>
          </div>
        </div>

        {levelsMode && (
          <p className="mb-3 rounded-xl bg-[#EEF9FB] px-3 py-2 text-xs text-slate-700">
            Program ini memakai kurikulum level. Indikator lama tidak hilang: semuanya ada di &ldquo;Arsip kurikulum lama&rdquo; di tiap kelompok, dan nilainya tetap tampil
            di riwayat.
          </p>
        )}

        <GlassInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari indikator atau kelompok..."
          aria-label="Cari indikator"
          className="mb-3 text-sm"
        />

        {groups.length === 0 && (
          <p className="text-sm text-slate-600">Belum ada kelompok indikator untuk program ini. Mulai dengan &ldquo;+ Kelompok&rdquo;.</p>
        )}

        <div className="flex flex-col gap-2">
          {visible.map(({ group, shown, old }) => {
            const open = !!query || !closed.includes(group.id);
            const groupIndex = sortedGroups.findIndex((g) => g.id === group.id);
            const sortedAll = [...group.indicators.filter(managed)].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.sort_order - b.sort_order);
            const levelsPresent = group.hasLevels && levelsMode ? ([1, 2, 3] as const) : ([null] as const);
            return (
              <AccordionItem
                key={group.id}
                variant="ortu"
                chevronSize="sm"
                open={open}
                onToggle={() =>
                  setClosed((cur) => (cur.includes(group.id) ? cur.filter((x) => x !== group.id) : [...cur, group.id]))
                }
                className={`rounded-2xl border border-white/60 bg-white/50 ${group.active ? "" : "opacity-75"}`}
                headerClassName="min-h-12 rounded-2xl px-3 py-1.5"
                header={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#17263D]">{group.name}</span>
                    <span className="rounded-full bg-[#35C5D0]/15 px-2 py-0.5 text-xs font-medium text-[#1597A3]">{sortedAll.length}</span>
                    {group.hasLevels && levelsMode && (
                      <span className="rounded-full bg-[#DDF3F6] px-1.5 py-0.5 text-[10px] font-medium text-[#0B6470]">Level 1–3</span>
                    )}
                    {!group.active && (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Nonaktif</span>
                    )}
                  </span>
                }
              >
                <ul className="flex flex-col gap-1 px-2 pb-2 pt-0.5">
                  <li className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => go(`g:${group.id}`)}
                      aria-current={editing === `g:${group.id}` ? "true" : undefined}
                      className={`min-h-11 min-w-0 flex-1 rounded-xl px-3 py-1.5 text-left text-xs font-medium text-[#1597A3] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]/70 ${
                        editing === `g:${group.id}` ? "bg-[#35C5D0]/15 ring-2 ring-[#35C5D0]/50" : "hover:bg-[#35C5D0]/10"
                      }`}
                    >
                      Ubah kelompok ini
                    </button>
                    {!query && (
                      <div className="flex shrink-0 gap-1">
                        <MoveButtons
                          action={moveGroupAction}
                          id={group.id}
                          fields={{ program_id: programId }}
                          canUp={groupIndex > 0}
                          canDown={groupIndex < sortedGroups.length - 1}
                        />
                      </div>
                    )}
                  </li>

                  {levelsPresent.map((lv) => {
                    const siblings = sortedAll.filter((i) => i.level === lv);
                    const rows = shown.filter((i) => i.level === lv).sort((a, b) => a.sort_order - b.sort_order);
                    if (rows.length === 0) return null;
                    return (
                      <li key={String(lv)} className="flex flex-col gap-1">
                        {lv && <p className="mt-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Level {lv}</p>}
                        <ul className="flex flex-col gap-1">
                          {rows.map((ind) => renderRow(ind, group, siblings))}
                        </ul>
                      </li>
                    );
                  })}

                  {old.length > 0 && (
                    <li>
                      <details className="mt-1 rounded-xl border border-white/50 bg-white/40">
                        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
                          <span>Arsip kurikulum lama ({old.length})</span>
                          <span className="text-slate-400">Lihat</span>
                        </summary>
                        <ul className="flex flex-col gap-1 px-1 pb-1">
                          {old.map((ind) => renderRow(ind, group, []))}
                        </ul>
                      </details>
                    </li>
                  )}
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
              <p className={HEADING}>Pilih indikator</p>
              <p className="mt-1 text-sm text-slate-600">
                Pilih indikator atau kelompok di daftar untuk mengubahnya, atau tambah yang baru.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => go(null)}
                className="-ml-1 mb-3 flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-medium text-[#1597A3] transition-colors hover:bg-[#35C5D0]/10 lg:hidden"
              >
                <BackArrow />
                Kembali ke daftar
              </button>

              {warn && dirty && (
                <div
                  role="alert"
                  className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FFC800]/50 bg-[#FFF8E1] px-3 py-2 text-sm text-[#6b5200]"
                >
                  <span>{UNSAVED_WARNING}</span>
                  <button type="button" onClick={() => setWarn(false)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-[#FFC800]/20">
                    Mengerti
                  </button>
                </div>
              )}

              {editing === "new-group" && (
                <>
                  <h2 className={`mb-4 ${HEADING}`}>Kelompok baru</h2>
                  <GroupForm
                    key={editorKey}
                    action={createGroupAction as never}
                    programId={programId}
                    initialName=""
                    submitLabel="Tambah Kelompok"
                    askLevels={levelsMode}
                    onDirtyChange={onDirty}
                    onCancel={discard}
                  />
                </>
              )}

              {editing === "new-indicator" && (
                <>
                  <h2 className={`mb-4 ${HEADING}`}>Indikator baru</h2>
                  <IndicatorForm
                    key={editorKey}
                    action={createIndicatorAction as never}
                    programId={programId}
                    groups={groupChoices}
                    group={groupChoices.find((g) => g.active) ?? groupChoices[0]}
                    curriculumMode={levelsMode}
                    submitLabel="Tambah Indikator"
                    onDirtyChange={onDirty}
                    onCancel={discard}
                  />
                </>
              )}

              {selGroup && (
                <>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className={HEADING}>{selGroup.name}</h2>
                      <p className="text-xs text-slate-600">{selGroup.indicators.filter(managed).length} indikator</p>
                    </div>
                    <StatusPill active={selGroup.active} />
                  </div>
                  <GroupForm
                    key={editorKey}
                    action={renameGroupAction as never}
                    programId={programId}
                    id={selGroup.id}
                    initialName={selGroup.name}
                    submitLabel="Simpan Perubahan"
                    onDirtyChange={onDirty}
                    onCancel={discard}
                  />
                  <div className="mt-4 flex flex-col gap-2 border-t border-white/40 pt-3">
                    <ToastForm action={toggleGroupActiveAction} pendingLabel="Memproses...">
                      <input type="hidden" name="program_id" value={programId} />
                      <input type="hidden" name="id" value={selGroup.id} />
                      <input type="hidden" name="next_active" value={(!selGroup.active).toString()} />
                      <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-1.5 text-sm`}>
                        {selGroup.active ? "Nonaktifkan Kelompok" : "Aktifkan Kelompok"}
                      </GlassButton>
                    </ToastForm>
                    <p className="text-xs text-slate-500">
                      Menonaktifkan kelompok menyembunyikannya dari laporan baru. Indikator dan seluruh riwayat nilai tetap aman dan tetap tampil di
                      riwayat anak.
                    </p>
                  </div>
                </>
              )}

              {selInd && (
                <>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className={HEADING}>{selInd.item.label}</h2>
                      <p className="text-xs text-slate-600">
                        {selInd.group.name}
                        {selInd.item.level ? ` · ${levelText(selInd.item.level)}` : ""}
                        {archived(selInd.item) ? " · kurikulum lama (arsip)" : ""}
                      </p>
                    </div>
                    <StatusPill active={selInd.item.active} label={archived(selInd.item) ? "Arsip" : undefined} />
                  </div>

                  {selInd.item.usedCount > 0 || selInd.item.mappedFrom > 0 ? (
                    <div className="mb-4 rounded-xl bg-[#FFF8E1] px-3 py-2 text-xs text-[#6b5200]" role="note">
                      <p className="font-semibold">Indikator ini punya riwayat</p>
                      <ul className="mt-0.5 list-disc pl-4">
                        {selInd.item.usedCount > 0 && <li>Sudah dipakai pada {selInd.item.usedCount} laporan.</li>}
                        {selInd.item.mappedFrom > 0 && <li>Menampilkan nilai lama dari {selInd.item.mappedFrom} indikator lama.</li>}
                        <li>Mengubah nama atau urutan tidak mengubah nilai dan tanggal lama. Untuk berhenti memakainya, gunakan Nonaktifkan.</li>
                      </ul>
                    </div>
                  ) : (
                    <p className="mb-4 text-xs text-slate-500">Belum pernah dipakai pada laporan.</p>
                  )}

                  <IndicatorForm
                    key={editorKey}
                    action={updateIndicatorAction as never}
                    programId={programId}
                    item={selInd.item}
                    group={selInd.group}
                    groups={sortedGroups}
                    curriculumMode={levelsMode}
                    submitLabel="Simpan Perubahan"
                    onDirtyChange={onDirty}
                    onCancel={discard}
                  />

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/40 pt-3">
                    {archived(selInd.item) ? (
                      <span className="text-xs text-slate-500">
                        Indikator kurikulum lama disimpan sebagai arsip dan tidak dipakai untuk laporan baru. Nilainya tetap ada di riwayat.
                      </span>
                    ) : (
                      <>
                        <ToastForm action={toggleIndicatorActiveAction} pendingLabel="Memproses...">
                          <input type="hidden" name="program_id" value={programId} />
                          <input type="hidden" name="id" value={selInd.item.id} />
                          <input type="hidden" name="next_active" value={(!selInd.item.active).toString()} />
                          <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-1.5 text-sm`}>
                            {selInd.item.active ? "Nonaktifkan (arsipkan)" : "Aktifkan"}
                          </GlassButton>
                        </ToastForm>
                        {selInd.item.usedCount > 0 || selInd.item.mappedFrom > 0 ? (
                          <span className="text-xs text-slate-500">
                            Tidak bisa dihapus permanen karena punya riwayat. Nonaktifkan agar tidak muncul di laporan baru; riwayat tetap tampil.
                          </span>
                        ) : (
                          <ToastForm action={deleteIndicatorAction} pendingLabel="Menghapus...">
                            <input type="hidden" name="program_id" value={programId} />
                            <input type="hidden" name="id" value={selInd.item.id} />
                            <DeleteConfirm message={`Hapus indikator "${selInd.item.label}" secara permanen? Indikator ini belum pernah dipakai. Tindakan ini tidak bisa dibatalkan.`}>
                              Hapus
                            </DeleteConfirm>
                          </ToastForm>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
