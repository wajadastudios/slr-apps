"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
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

export type IndItem = { id: string; key: string; label: string; sort_order: number; active: boolean; used: boolean };
export type IndGroup = { id: string; name: string; sort_order: number; active: boolean; indicators: IndItem[] };

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const UNSAVED_WARNING = "Perubahan belum disimpan. Simpan atau batalkan sebelum berpindah.";

// g:<id> group, i:<id> indicator, "new-group", "new-indicator"
type Selection = string | null;

function BackArrow() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12.5 5.5L8 10l4.5 4.5" />
    </svg>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active ? "bg-[#55D6A6]/20 text-[#0f6b52]" : "bg-slate-200 text-slate-600"
      }`}
    >
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );
}

// Single-purpose editor: a name, and optionally which group it belongs to.
// Reports unsaved changes so the workspace can stop the admin from walking
// away from them.
function ItemForm({
  action,
  programId,
  id,
  initialName,
  nameLabel,
  groups,
  initialGroupId,
  submitLabel,
  onDirtyChange,
  onCancel,
  resetOnSuccess,
}: {
  action: (prev: null, formData: FormData) => Promise<never> | Promise<unknown>;
  programId: string;
  id?: string;
  initialName: string;
  nameLabel: string;
  groups?: IndGroup[];
  initialGroupId?: string;
  submitLabel: string;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  resetOnSuccess?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [groupId, setGroupId] = useState(initialGroupId ?? "");
  const dirty = name !== initialName || groupId !== (initialGroupId ?? "");
  const nameField = groups ? "label" : "name";

  return (
    <ToastForm
      action={action as never}
      resetOnSuccess={resetOnSuccess}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="program_id" value={programId} />
      {id && <input type="hidden" name="id" value={id} />}
      {groups && <input type="hidden" name="group_id" value={groupId} />}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-600" htmlFor="item-name">
          {nameLabel}
        </label>
        <GlassInput
          id="item-name"
          name={nameField}
          value={name}
          required
          onChange={(e) => {
            setName(e.target.value);
            onDirtyChange(e.target.value !== initialName || groupId !== (initialGroupId ?? ""));
          }}
          className="text-sm"
        />
      </div>

      {groups && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">Kelompok</label>
          <GlassSelect
            value={groupId}
            required
            onChange={(e) => {
              setGroupId(e.target.value);
              onDirtyChange(name !== initialName || e.target.value !== (initialGroupId ?? ""));
            }}
            className="text-sm"
            glassChevron
          >
            <option value="" disabled>
              Pilih kelompok
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.active ? "" : " (nonaktif)"}
              </option>
            ))}
          </GlassSelect>
        </div>
      )}

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
    </ToastForm>
  );
}

// Master-detail editor for one program's indicator groups and indicators.
export function IndicatorWorkspace({
  programId,
  groups,
  focus,
}: {
  programId: string;
  groups: IndGroup[];
  focus?: string;
}) {
  const [selected, setSelected] = useState<Selection>(focus ?? null);
  const [lastFocus, setLastFocus] = useState(focus);
  const [search, setSearch] = useState("");
  // Only one group is open at first (the one being edited, else the first);
  // the rest stay folded so a long list never starts as a wall of indicators.
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
  // a selection that no longer exists (deleted) falls back to the list
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
  const visible = groups
    .map((g) => ({
      group: g,
      shown: g.indicators.filter((i) => !query || i.label.toLowerCase().includes(query) || g.name.toLowerCase().includes(query)),
    }))
    .filter(({ group, shown }) => !query || shown.length > 0 || group.name.toLowerCase().includes(query));

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
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
              disabled={groups.length === 0}
              className={`${PRIMARY_BUTTON} px-3 py-1.5 text-xs`}
            >
              + Indikator
            </GlassButton>
          </div>
        </div>

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
          {visible.map(({ group, shown }) => {
            const open = !!query || !closed.includes(group.id);
            const groupIndex = sortedGroups.findIndex((g) => g.id === group.id);
            const sortedInds = [...group.indicators].sort((a, b) => a.sort_order - b.sort_order);
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
                    <span className="rounded-full bg-[#35C5D0]/15 px-2 py-0.5 text-xs font-medium text-[#1597A3]">
                      {group.indicators.length}
                    </span>
                    {!group.active && (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        Nonaktif
                      </span>
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
                  {shown.map((ind) => {
                    const index = sortedInds.findIndex((x) => x.id === ind.id);
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
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 shrink-0 rounded-full ${ind.active ? "bg-[#55D6A6]" : "bg-slate-300"}`}
                            />
                            <span className="truncate text-sm font-medium text-[#17263D]">{ind.label}</span>
                            {!ind.active && (
                              <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                Nonaktif
                              </span>
                            )}
                            {ind.used && (
                              <span className="shrink-0 rounded-full bg-[#EEF9FB] px-1.5 py-0.5 text-[10px] font-medium text-[#1597A3]">
                                Terpakai
                              </span>
                            )}
                          </span>
                        </button>
                        {!query && (
                          <div className="flex shrink-0 gap-1">
                            <MoveButtons
                              action={moveIndicatorAction}
                              id={ind.id}
                              fields={{ program_id: programId, group_id: group.id }}
                              canUp={index > 0}
                              canDown={index < sortedInds.length - 1}
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
                  <ItemForm
                    key={editorKey}
                    action={createGroupAction as never}
                    programId={programId}
                    initialName=""
                    nameLabel="Nama kelompok"
                    submitLabel="Tambah Kelompok"
                    onDirtyChange={onDirty}
                    onCancel={discard}
                  />
                </>
              )}

              {editing === "new-indicator" && (
                <>
                  <h2 className={`mb-4 ${HEADING}`}>Indikator baru</h2>
                  <ItemForm
                    key={editorKey}
                    action={createIndicatorAction as never}
                    programId={programId}
                    initialName=""
                    nameLabel="Nama indikator"
                    groups={sortedGroups}
                    initialGroupId={sortedGroups.find((g) => g.active)?.id ?? sortedGroups[0]?.id}
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
                      <p className="text-xs text-slate-600">{selGroup.indicators.length} indikator</p>
                    </div>
                    <StatusPill active={selGroup.active} />
                  </div>
                  <ItemForm
                    key={editorKey}
                    action={renameGroupAction as never}
                    programId={programId}
                    id={selGroup.id}
                    initialName={selGroup.name}
                    nameLabel="Nama kelompok"
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
                      Menonaktifkan kelompok menyembunyikannya dari laporan baru. Indikator dan seluruh riwayat nilai
                      tetap aman.
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
                        {selInd.item.used ? " · sudah dipakai pada laporan" : " · belum pernah dipakai"}
                      </p>
                    </div>
                    <StatusPill active={selInd.item.active} />
                  </div>
                  <ItemForm
                    key={editorKey}
                    action={updateIndicatorAction as never}
                    programId={programId}
                    id={selInd.item.id}
                    initialName={selInd.item.label}
                    nameLabel="Nama indikator"
                    groups={sortedGroups}
                    initialGroupId={selInd.group.id}
                    submitLabel="Simpan Perubahan"
                    onDirtyChange={onDirty}
                    onCancel={discard}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/40 pt-3">
                    <ToastForm action={toggleIndicatorActiveAction} pendingLabel="Memproses...">
                      <input type="hidden" name="program_id" value={programId} />
                      <input type="hidden" name="id" value={selInd.item.id} />
                      <input type="hidden" name="next_active" value={(!selInd.item.active).toString()} />
                      <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-1.5 text-sm`}>
                        {selInd.item.active ? "Nonaktifkan" : "Aktifkan"}
                      </GlassButton>
                    </ToastForm>
                    {selInd.item.used ? (
                      <span className="text-xs text-slate-500">
                        Tidak bisa dihapus karena sudah dipakai pada laporan &mdash; nonaktifkan saja.
                      </span>
                    ) : (
                      <ToastForm action={deleteIndicatorAction} pendingLabel="Menghapus...">
                        <input type="hidden" name="program_id" value={programId} />
                        <input type="hidden" name="id" value={selInd.item.id} />
                        <DeleteConfirm
                          message={`Hapus indikator "${selInd.item.label}"? Tindakan ini tidak bisa dibatalkan.`}
                        >
                          Hapus
                        </DeleteConfirm>
                      </ToastForm>
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
