import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import {
  STATUS_LABEL,
  STATUS_TONE,
  participantCanCancel,
  participantStatusCopy,
  slotDescription,
  type EnrollmentStatus,
} from "@/lib/enrollment";
import { cancelEnrollmentAction, respondScheduleOfferAction } from "@/app/ortu/actions";

// What a participant sees while a class is not active yet: where the
// registration stands, what the admin is doing, and -- once a schedule is
// offered -- the choice to approve it. No reports, progress or records here.
export function EnrollmentStatusCard({
  enrollmentId,
  name,
  programName,
  status,
  preferred,
  offeredSlot,
  full = false,
}: {
  enrollmentId: string;
  name: string;
  programName: string;
  status: EnrollmentStatus;
  preferred: string | null;
  offeredSlot: { day_of_week: number; start_time: string; location: string | null; label: string | null } | null;
  // the detail-page version has a slightly larger heading
  full?: boolean;
}) {
  const copy = participantStatusCopy(status, programName);

  return (
    <GlassCard className="flex flex-col gap-3 !bg-white/85">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">Pendaftaran Kelas</p>
          <h2
            className={`font-[family-name:var(--font-quicksand)] font-bold leading-tight text-[#17263D] ${
              full ? "text-xl" : "text-lg"
            }`}
          >
            {name}
            <span className="font-medium text-slate-500"> · {programName}</span>
          </h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3">
        <p className="text-sm font-semibold text-[#17263D]">Status: {copy.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{copy.body}</p>
        {preferred && (
          <p className="mt-2 text-xs text-slate-500">Pilihan Anda: {preferred}</p>
        )}
      </div>

      {status === "schedule_offered" && offeredSlot && (
        <div className="rounded-2xl border border-[#35C5D0]/40 bg-[#EEF9FB] px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Jadwal yang ditawarkan</p>
          <p className="text-base font-semibold text-[#17263D]">
            {slotDescription(offeredSlot)} WIB
            {offeredSlot.label ? ` · ${offeredSlot.label}` : ""}
          </p>
          <p className="text-sm text-slate-600">Lokasi: {offeredSlot.location || "-"}</p>

          <ToastForm action={respondScheduleOfferAction} pendingLabel="Menyimpan..." className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="enrollment_id" value={enrollmentId} />
            <GlassButton
              type="submit"
              name="decision"
              value="accept"
              className={`${PRIMARY_BUTTON} px-5 py-2 text-sm`}
            >
              Setujui Jadwal
            </GlassButton>
            <GlassButton
              type="submit"
              name="decision"
              value="decline"
              className={`${SECONDARY_BUTTON} px-5 py-2 text-sm`}
            >
              Belum Cocok
            </GlassButton>
          </ToastForm>
        </div>
      )}

      {participantCanCancel(status) && (
        <ToastForm action={cancelEnrollmentAction} pendingLabel="Memproses..." className="flex justify-end">
          <input type="hidden" name="enrollment_id" value={enrollmentId} />
          <ConfirmSubmitButton
            message={`Batalkan pendaftaran ${programName}? Jadwal yang sudah dikunci akan dilepas.`}
            className="px-3 py-1.5 text-xs"
          >
            Batalkan pendaftaran
          </ConfirmSubmitButton>
        </ToastForm>
      )}
    </GlassCard>
  );
}
