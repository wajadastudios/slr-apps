"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { submitRegistrationAction } from "@/app/daftar/actions";

type Mode = "anak" | "diri";
type PaymentMethod = "qris" | "transfer";

export function RegistrationForm({
  programs,
  qrisImageUrl,
  bankTransferInfo,
}: {
  programs: { id: string; name: string }[];
  qrisImageUrl?: string;
  bankTransferInfo?: string;
}) {
  const [mode, setMode] = useState<Mode>("anak");
  const [selfName, setSelfName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("qris");
  const [paid, setPaid] = useState(false);

  return (
    <form action={submitRegistrationAction} className="flex flex-col gap-4">
      <input type="hidden" name="registration_type" value={mode} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Mendaftar sebagai</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5">
            <input
              type="radio"
              name="mode_choice"
              checked={mode === "anak"}
              onChange={() => setMode("anak")}
            />
            <span className="text-sm text-slate-800">
              Orang tua, untuk anak saya
            </span>
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5">
            <input
              type="radio"
              name="mode_choice"
              checked={mode === "diri"}
              onChange={() => setMode("diri")}
            />
            <span className="text-sm text-slate-800">
              Untuk diri sendiri (remaja/dewasa)
            </span>
          </label>
        </div>
      </div>

      {mode === "anak" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Anak/Peserta</label>
            <GlassInput name="child_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Orang Tua</label>
            <GlassInput name="parent_name" required />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Nama Lengkap</label>
          <GlassInput
            name="child_name"
            required
            value={selfName}
            onChange={(e) => setSelfName(e.target.value)}
          />
          <input type="hidden" name="parent_name" value={selfName} />
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm text-slate-800">
            {mode === "anak" ? "Tempat Lahir Anak" : "Tempat Lahir"}
          </label>
          <GlassInput name="birth_place" required />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm text-slate-800">
            {mode === "anak" ? "Tanggal Lahir Anak" : "Tanggal Lahir"}
          </label>
          <GlassInput name="birth_date" type="date" required />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Email</label>
        <GlassInput name="parent_email" type="email" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">
          Nomor Telepon/WhatsApp
        </label>
        <GlassInput name="parent_phone" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Program</label>
        <GlassSelect name="program_id" required defaultValue="">
          <option value="" disabled>
            Pilih program
          </option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </GlassSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">
          Jadwal yang Diminati (opsional)
        </label>
        <GlassInput name="preferred_schedule" placeholder="Contoh: Sabtu pagi" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">
          Kode Referral (opsional)
        </label>
        <GlassInput
          name="referral_code"
          placeholder="Kode dari pengajar, jika ada"
          className="uppercase placeholder:normal-case"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-4">
        <p className="text-sm font-semibold text-[#17263D]">
          Biaya Pendaftaran Kelas Trial: Rp50.000
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/50 px-4 py-2.5">
            <input
              type="radio"
              name="payment_method"
              value="qris"
              checked={paymentMethod === "qris"}
              onChange={() => setPaymentMethod("qris")}
            />
            <span className="text-sm text-slate-800">QRIS</span>
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/50 px-4 py-2.5">
            <input
              type="radio"
              name="payment_method"
              value="transfer"
              checked={paymentMethod === "transfer"}
              onChange={() => setPaymentMethod("transfer")}
            />
            <span className="text-sm text-slate-800">Transfer Manual</span>
          </label>
        </div>

        {paymentMethod === "qris" ? (
          qrisImageUrl ? (
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrisImageUrl}
                alt="QRIS Sari Les Renang"
                className="w-48 rounded-xl border border-white/40 bg-white object-contain"
              />
              <p className="text-xs text-slate-600">
                Scan QRIS di atas untuk membayar Rp50.000.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              QRIS belum tersedia, silakan gunakan Transfer Manual.
            </p>
          )
        ) : bankTransferInfo ? (
          <p className="whitespace-pre-line text-sm text-slate-700">
            {bankTransferInfo}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Info transfer belum tersedia, silakan hubungi admin.
          </p>
        )}

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            required
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
          />
          <span className="text-sm text-slate-800">
            Saya sudah melakukan pembayaran
          </span>
        </label>
      </div>

      <GlassButton
        type="submit"
        className="!bg-[#35C5D0] mt-2 !text-white hover:!bg-[#2bb0ba]"
      >
        Kirim Pendaftaran
      </GlassButton>
    </form>
  );
}
