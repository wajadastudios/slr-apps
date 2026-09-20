"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { PRIMARY_BUTTON } from "@/lib/ui-classes";
import {
  ACK_INTRO,
  ACK_STATEMENT,
  GENDER_OPTIONS,
  RELATIONSHIPS,
  programSuitsGender,
  unsuitableProgramMessage,
  type Gender,
  type ParticipantKind,
} from "@/lib/registration-input";
import type { RegistrationProgram } from "@/lib/registration-data";

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

const CARD_BASE =
  "rounded-2xl border px-4 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]";

// The whole "who / which program / when" part of the registration form, shared
// by the public page and the signed-in "Daftarkan Diri ke Kelas" accordion.
// It renders fields only: the parent supplies the <form> (plain or ToastForm).
// Every choice lives in state here, so what the person picked is always what
// is shown and what is submitted -- nothing is guessed or swapped for them.
export function EnrollmentRequestFields({
  programs,
  loadError,
  initialProgramId,
  initialGender,
  submitLabel = "Kirim Pendaftaran",
}: {
  programs: RegistrationProgram[];
  loadError: boolean;
  initialProgramId?: string;
  // the account holder's own saved gender, if any (only used for "Saya sendiri")
  initialGender?: Gender | null;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [who, setWho] = useState<ParticipantKind>("self");
  const [programId, setProgramId] = useState(
    programs.some((p) => p.id === initialProgramId) ? (initialProgramId ?? "") : ""
  );
  const [gender, setGender] = useState<Gender | "">(initialGender ?? "");
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState("");

  const selected = programs.find((p) => p.id === programId);
  const slot = selected?.slots.find((s) => s.id === slotId);
  const blocked = !!selected && !programSuitsGender(selected.intended_gender, gender || null);

  const preferredSchedule = slot ? (note.trim() ? `${slot.text} — ${note.trim()}` : slot.text) : note.trim();
  const preferredLocation = slot?.location ?? "";

  // Gender belongs to the person taking the class: switching between "me" and
  // someone else never carries one person's gender over to the other.
  function changeWho(next: ParticipantKind) {
    if (next === who) return;
    setWho(next);
    setGender(next === "self" ? (initialGender ?? "") : "");
  }

  function pickProgram(id: string) {
    setProgramId(id);
    setSlotId(""); // a slot of another program must never stay selected
  }

  // ---------- program list could not be loaded / is empty ----------
  if (loadError || programs.length === 0) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[#FFC800]/50 bg-[#FFF8E1] p-4">
        <p className="text-sm font-semibold text-[#6b5200]">
          {loadError ? "Daftar program belum dapat dimuat." : "Belum ada program yang dibuka untuk pendaftaran mandiri."}
        </p>
        <p className="text-sm text-[#6b5200]">
          {loadError
            ? "Periksa koneksi Anda lalu coba lagi."
            : "Silakan hubungi admin melalui WhatsApp untuk informasi jadwal dan program."}
        </p>
        <GlassButton type="button" onClick={() => router.refresh()} className="w-fit px-4 py-2 text-sm">
          Coba lagi
        </GlassButton>
      </div>
    );
  }

  const genderRadios = (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm text-slate-800">
        Jenis kelamin peserta{who === "other" ? "" : " (opsional)"}
      </legend>
      <div className="flex flex-wrap gap-2">
        {GENDER_OPTIONS.map((g) => (
          <label
            key={g.value}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border px-4 text-sm ${
              gender === g.value
                ? "border-[#35C5D0] bg-[#35C5D0]/15 font-medium text-[#17263D]"
                : "border-white/40 bg-white/40 text-slate-700"
            }`}
          >
            <input
              type="radio"
              name="gender"
              value={g.value}
              checked={gender === g.value}
              onChange={() => setGender(g.value)}
              required={who === "other"}
              className="h-4 w-4"
            />
            {g.label}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- 1. who is taking the class ---------- */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-[#17263D]">Siapa yang akan mengikuti kelas?</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(
            [
              ["self", "Saya sendiri"],
              ["other", "Pasangan / anggota keluarga"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-12 flex-1 cursor-pointer items-center gap-2.5 rounded-2xl border px-4 text-sm ${
                who === value
                  ? "border-[#35C5D0] bg-[#35C5D0]/15 font-medium text-[#17263D]"
                  : "border-white/40 bg-white/40 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="for"
                value={value}
                checked={who === value}
                onChange={() => changeWho(value)}
                className="h-4 w-4"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {who === "other" ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-white/50 bg-white/40 p-4">
          <p className="text-sm font-semibold text-[#17263D]">Data peserta</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800" htmlFor="participant-name">
                Nama lengkap peserta
              </label>
              <GlassInput id="participant-name" name="participant_name" required autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800" htmlFor="participant-phone">
                Nomor WhatsApp peserta
              </label>
              <GlassInput
                id="participant-phone"
                name="participant_phone"
                type="tel"
                required
                placeholder="08xxxxxxxxxx"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800" htmlFor="participant-birth">
                Tanggal lahir (opsional)
              </label>
              <GlassInput id="participant-birth" name="birth_date" type="date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Hubungan dengan Anda</label>
              <GlassSelect name="relationship" required defaultValue="" glassChevron>
                <option value="" disabled>
                  Pilih hubungan
                </option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </GlassSelect>
            </div>
          </div>
          {genderRadios}
          <p className="text-xs text-slate-500">
            Peserta akan diundang lewat WhatsApp untuk membuat akunnya sendiri. Jadwal dan laporan kelas hanya dapat
            dilihat peserta, kecuali peserta mengizinkan Anda.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/50 bg-white/40 p-4">{genderRadios}</div>
      )}

      {/* ---------- 2. which program ---------- */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-[#17263D]">Pilih program</legend>
        <input type="hidden" name="program_id" value={programId} />
        <div role="radiogroup" aria-label="Pilih program" className="grid gap-2 sm:grid-cols-2">
          {programs.map((p) => {
            const isSelected = p.id === programId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => pickProgram(p.id)}
                className={`${CARD_BASE} ${
                  isSelected
                    ? "border-[#35C5D0] bg-[#35C5D0]/15 shadow-[0_0_0_3px_rgba(53,197,208,0.18)]"
                    : "border-white/50 bg-white/50 hover:bg-[#35C5D0]/10"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#17263D]">{p.name}</span>
                  {isSelected && (
                    <span className="rounded-full bg-[#35C5D0] px-2 py-0.5 text-[11px] font-semibold text-white">
                      Dipilih
                    </span>
                  )}
                </span>
                {p.description && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{p.description}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ---------- program specific: gender notice, packages, schedule ---------- */}
      {selected && blocked && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[#FFC800]/50 bg-[#FFF8E1] p-4">
          <p className="text-sm font-semibold text-[#6b5200]">{unsuitableProgramMessage(selected.name, who)}</p>
          <div className="flex flex-wrap gap-2">
            {who === "self" ? (
              <GlassButton type="button" onClick={() => changeWho("other")} className="px-4 py-2 text-sm">
                Ubah jenis peserta
              </GlassButton>
            ) : (
              <GlassButton type="button" onClick={() => pickProgram("")} className="px-4 py-2 text-sm">
                Pilih program lain
              </GlassButton>
            )}
          </div>
        </div>
      )}

      {selected && !blocked && (
        <div className="flex flex-col gap-4 rounded-2xl border border-white/50 bg-white/40 p-4">
          {selected.packages.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-[#17263D]">Paket {selected.name}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-700">
                {selected.packages.map((k) => (
                  <li key={k.id}>
                    {k.name} &middot; {k.sessions_count} sesi &middot; {rupiah(k.price)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate-500">Paket dipilih dan ditagihkan admin setelah jadwal dikonfirmasi.</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Pilihan jadwal &amp; lokasi (opsional)</label>
              <GlassSelect
                key={programId}
                name="schedule_choice"
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                glassChevron
              >
                <option value="">
                  {selected.slots.length > 0 ? "Belum memilih — admin akan mencarikan" : "Belum ada slot kosong"}
                </option>
                {selected.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.text}
                  </option>
                ))}
              </GlassSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800" htmlFor="schedule-note">
                Catatan jadwal/lokasi lain (opsional)
              </label>
              <GlassInput
                id="schedule-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Sabtu pagi"
                maxLength={160}
              />
            </div>
          </div>
          <input type="hidden" name="preferred_schedule" value={preferredSchedule} />
          <input type="hidden" name="preferred_location" value={preferredLocation} />

          {selected.requires_acknowledgement && (
            <fieldset className="flex flex-col gap-2 rounded-2xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-4">
              <legend className="px-1 text-sm font-semibold text-[#17263D]">Konfirmasi program</legend>
              <p className="text-sm text-slate-700">{ACK_INTRO}</p>
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input type="checkbox" name="acknowledged" required className="mt-1 h-4 w-4" />
                <span>{ACK_STATEMENT}</span>
              </label>
              <p className="text-xs text-slate-500">
                Kami tidak meminta data medis. Bila ada penyesuaian yang perlu diketahui instruktur, admin akan
                membicarakannya langsung.
              </p>
            </fieldset>
          )}
        </div>
      )}

      {/* ---------- submit ---------- */}
      <div className="flex flex-col gap-1.5">
        <GlassButton
          type="submit"
          disabled={!selected || blocked}
          className={`${PRIMARY_BUTTON} w-fit px-5 py-2.5 text-sm`}
        >
          {submitLabel}
        </GlassButton>
        {!selected && <p className="text-xs text-slate-600">Pilih program terlebih dahulu untuk melanjutkan.</p>}
        {selected && blocked && (
          <p className="text-xs text-slate-600">Ubah jenis peserta atau program agar pendaftaran dapat dilanjutkan.</p>
        )}
      </div>
    </div>
  );
}
