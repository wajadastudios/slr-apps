import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { CopyButton } from "@/components/ui/copy-button";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import {
  STATUS_LABEL,
  STATUS_TONE,
  adminCanMove,
  remainingSeats,
  type EnrollmentStatus,
} from "@/lib/enrollment";
import { DAYS } from "@/lib/days";
import {
  offerScheduleAction,
  saveAdjustmentNoteAction,
  setEnrollmentStatusAction,
} from "../actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

type SlotRow = {
  id: string;
  label: string | null;
  location: string | null;
  day_of_week: number;
  start_time: string;
  capacity: number;
};

function StatusForm({
  id,
  to,
  children,
  withNote = false,
  confirm,
  primary = false,
}: {
  id: string;
  to: EnrollmentStatus;
  children: React.ReactNode;
  withNote?: boolean;
  confirm?: string;
  primary?: boolean;
}) {
  return (
    <ToastForm
      action={setEnrollmentStatusAction}
      className="flex flex-wrap items-center gap-2"
      pendingLabel="Memproses..."
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      {withNote && <GlassInput name="note" placeholder="Alasan (opsional)" className="min-w-[180px] text-sm" />}
      {confirm ? (
        <ConfirmSubmitButton
          message={confirm}
          className="!border-red-300 !bg-red-500/10 px-3 py-1.5 text-sm !text-red-700 hover:!bg-red-500/20"
        >
          {children}
        </ConfirmSubmitButton>
      ) : (
        <GlassButton type="submit" className={`${primary ? PRIMARY_BUTTON : SECONDARY_BUTTON} px-4 py-2 text-sm`}>
          {children}
        </GlassButton>
      )}
    </ToastForm>
  );
}

export default async function EnrollmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: e } = await supabase
    .from("enrollments")
    .select(
      "id, status, source, program_id, student_id, slot_id, offered_slot_id, offer_token, offer_expires_at, preferred_schedule, preferred_location, decision_note, acknowledged_at, acknowledgement_version, adjustment_note, created_at, student:student_id(full_name, parent_id), program:program_id(name, requires_acknowledgement)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const student = e.student as unknown as { full_name: string; parent_id: string } | null;
  const program = e.program as unknown as { name: string; requires_acknowledgement: boolean } | null;
  const status = e.status as EnrollmentStatus;

  const [{ data: user }, { data: slots }, { data: availability }, origin] = await Promise.all([
    supabase.from("users").select("email, phone").eq("id", student?.parent_id ?? "").maybeSingle(),
    supabase
      .from("class_slots")
      .select("id, label, location, day_of_week, start_time, capacity")
      .eq("program_id", e.program_id)
      .order("day_of_week")
      .order("start_time"),
    supabase.rpc("get_slot_availability"),
    getSiteOrigin(),
  ]);

  const filled = new Map<string, number>();
  for (const a of (availability ?? []) as { slot_id: string; filled: number }[]) {
    filled.set(a.slot_id, Number(a.filled));
  }
  const slotList = (slots ?? []) as SlotRow[];
  const slotName = (s: SlotRow) =>
    `${DAYS[s.day_of_week]} · ${s.start_time.slice(0, 5).replace(":", ".")}${s.label ? ` · ${s.label}` : ""}${
      s.location ? ` · ${s.location}` : ""
    }`;
  const offerable = slotList.filter((s) => remainingSeats(s.capacity, filled.get(s.id) ?? 0) > 0);
  const offered = slotList.find((s) => s.id === e.offered_slot_id);
  const locked = slotList.find((s) => s.id === e.slot_id);
  const offerLink = e.offer_token ? `${origin}/jadwal/${e.offer_token}` : null;
  const phoneDigits = user?.phone?.replace(/[^0-9]/g, "") ?? "";

  const canOffer = status === "pending_review" || status === "waiting_schedule" || status === "schedule_offered";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/pendaftar" className="w-fit text-sm font-medium text-[#1597A3] hover:underline">
        &lsaquo; Semua pendaftar
      </Link>
      {error && <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>}

      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className={HEADING}>{student?.full_name ?? "Peserta"}</h1>
            <p className="text-sm text-slate-600">
              {program?.name} &middot; mendaftar{" "}
              {new Date(e.created_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">WhatsApp</dt>
            <dd className="font-medium text-[#17263D]">
              {user?.phone ?? "-"}
              {phoneDigits && (
                <a
                  href={`https://wa.me/${phoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs font-medium text-[#1597A3] hover:underline"
                >
                  Buka chat
                </a>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Email login</dt>
            <dd className="font-medium text-[#17263D]">{user?.email ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Pilihan jadwal / lokasi</dt>
            <dd className="font-medium text-[#17263D]">
              {[e.preferred_schedule, e.preferred_location].filter(Boolean).join(" · ") || "-"}
            </dd>
          </div>
          {program?.requires_acknowledgement && (
            <div>
              <dt className="text-xs text-slate-500">Konfirmasi peserta</dt>
              <dd className="font-medium text-[#17263D]">
                {e.acknowledged_at
                  ? `Disetujui ${new Date(e.acknowledged_at).toLocaleDateString("id-ID")}`
                  : "Belum ada"}
              </dd>
            </div>
          )}
          {e.decision_note && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Catatan</dt>
              <dd className="text-[#17263D]">{e.decision_note}</dd>
            </div>
          )}
        </dl>
      </GlassCard>

      {(locked || offered) && (
        <GlassCard tone="soft">
          {locked && (
            <p className="text-sm text-[#17263D]">
              <span className="font-semibold">Jadwal terkunci:</span> {slotName(locked)}
            </p>
          )}
          {offered && (
            <>
              <p className="text-sm text-[#17263D]">
                <span className="font-semibold">Jadwal ditawarkan:</span> {slotName(offered)}
              </p>
              {e.offer_expires_at && (
                <p className="text-xs text-slate-500">
                  Berlaku sampai {new Date(e.offer_expires_at).toLocaleString("id-ID")}
                </p>
              )}
              {offerLink && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="max-w-full truncate rounded-lg bg-white/60 px-2 py-1 text-xs">{offerLink}</code>
                  <CopyButton value={offerLink} />
                </div>
              )}
            </>
          )}
        </GlassCard>
      )}

      {canOffer && (
        <GlassCard>
          <h2 className={`mb-1 ${HEADING}`}>
            {status === "schedule_offered" ? "Tawarkan Jadwal Lain" : "Tawarkan Jadwal"}
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Peserta menerima WhatsApp berisi program, jadwal, lokasi, dan link untuk menyetujui. Kursi baru
            dikunci saat peserta menyetujui.
          </p>
          {offerable.length === 0 ? (
            <p className="text-sm text-slate-600">
              Belum ada slot dengan kursi kosong untuk {program?.name}. Buat slot di menu Slot Jadwal, atau tandai
              pendaftar ini &ldquo;Menunggu jadwal&rdquo;.
            </p>
          ) : (
            <ToastForm
              action={offerScheduleAction}
              className="flex flex-wrap items-end gap-3"
              pendingLabel="Mengirim..."
            >
              <input type="hidden" name="id" value={e.id} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Slot</label>
                <GlassSelect name="slot_id" required defaultValue="" className="min-w-[260px]" glassChevron>
                  <option value="" disabled>
                    Pilih slot
                  </option>
                  {offerable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {slotName(s)} — sisa {remainingSeats(s.capacity, filled.get(s.id) ?? 0)}
                    </option>
                  ))}
                </GlassSelect>
              </div>
              <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-4 py-2 text-sm`}>
                Kirim Penawaran
              </GlassButton>
            </ToastForm>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <h2 className={`mb-3 ${HEADING}`}>Ubah Status</h2>
        <div className="flex flex-col gap-3">
          {adminCanMove(status, "waiting_schedule") && (
            <StatusForm id={e.id} to="waiting_schedule">
              {status === "schedule_offered" ? "Kembalikan ke Menunggu Jadwal" : "Tandai Menunggu Jadwal"}
            </StatusForm>
          )}
          {adminCanMove(status, "active") && (
            <StatusForm id={e.id} to="active" primary>
              Tandai Kelas Aktif
            </StatusForm>
          )}
          {adminCanMove(status, "rejected") && (
            <StatusForm
              id={e.id}
              to="rejected"
              withNote
              confirm={`Tolak pendaftaran ${student?.full_name}? Hanya untuk data tidak valid, duplikat, atau pendaftaran yang memang tidak dapat dilanjutkan. Akun peserta tetap ada.`}
            >
              Tolak
            </StatusForm>
          )}
          {adminCanMove(status, "cancelled") && (
            <StatusForm
              id={e.id}
              to="cancelled"
              withNote
              confirm={`Batalkan pendaftaran ${student?.full_name} di ${program?.name}?${
                e.slot_id ? " Kursi yang terkunci akan dilepas." : ""
              }`}
            >
              Batalkan
            </StatusForm>
          )}
          {(status === "cancelled" || status === "rejected") && (
            <p className="text-sm text-slate-600">Pendaftaran ini sudah ditutup.</p>
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-1 ${HEADING}`}>Catatan Penyesuaian untuk Instruktur</h2>
        <p className="mb-3 text-sm text-slate-600">
          Singkat dan non-medis, misalnya &ldquo;perlu jeda lebih sering&rdquo;. Instruktur yang ditugaskan dapat
          membacanya. Jangan tulis diagnosis atau data kesehatan.
        </p>
        <ToastForm action={saveAdjustmentNoteAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={e.id} />
          <GlassTextarea name="adjustment_note" rows={2} maxLength={300} defaultValue={e.adjustment_note ?? ""} />
          <GlassButton type="submit" className={`${SECONDARY_BUTTON} w-fit px-4 py-2 text-sm`}>
            Simpan Catatan
          </GlassButton>
        </ToastForm>
      </GlassCard>
    </div>
  );
}
