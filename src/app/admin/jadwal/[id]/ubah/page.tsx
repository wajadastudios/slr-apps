import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, PageHeader } from "@/components/admin/ui";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { parseSlotInput, planSlot } from "@/lib/admin/slot-service";
import { blocking, warnings } from "@/lib/admin/schedule-rules";
import { dayName, formatClock, formatRange } from "@/lib/admin/format";
import { applySlotChangeAction } from "../../actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const FIELDS = ["program_id", "pelatih_id", "label", "location", "day_of_week", "start_time", "duration_minutes", "capacity"] as const;

// Step 2 of changing a session that has participants (or that shares a pool):
// show exactly what is affected and let the admin choose how to proceed.
export default async function ConfirmSlotChangePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const fd = new FormData();
  for (const f of FIELDS) fd.set(f, sp[f] ?? "");
  const parsed = parseSlotInput(fd);
  if (!parsed.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-red-700">
          {parsed.error}
        </p>
        <Link href={`/admin/jadwal/${id}`} className={`inline-flex min-h-10 w-fit items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
          Kembali ke sesi
        </Link>
      </div>
    );
  }

  const plan = await planSlot(supabase, id, parsed.value);
  if (!plan.before) notFound();
  const before = plan.before;
  const next = parsed.value;

  const hard = blocking(plan.conflicts);
  const soft = warnings(plan.conflicts);
  const people = plan.affected;
  const stuck = people.filter((p) => p.issues.length > 0);
  const summary = `Perubahan ini memengaruhi ${people.length} peserta, ${plan.names.pelatihName}${next.location ? `, dan ${next.location}` : ""}.`;

  const changes: string[] = [];
  if (before.day_of_week !== next.day_of_week || before.start_time.slice(0, 5) !== next.start_time.slice(0, 5) || before.duration_minutes !== next.duration_minutes) {
    changes.push(
      `Waktu: ${dayName(before.day_of_week)} ${formatRange(before.start_time, before.duration_minutes)} → ${dayName(next.day_of_week)} ${formatRange(next.start_time, next.duration_minutes)}`
    );
  }
  if ((before.location ?? "") !== (next.location ?? "")) changes.push(`Lokasi: ${before.location ?? "kosong"} → ${next.location ?? "kosong"}`);
  if (before.pelatih_id !== next.pelatih_id) changes.push(`Pengajar: ${before.pelatihName} → ${plan.names.pelatihName}`);
  if (before.capacity !== next.capacity) changes.push(`Kapasitas: ${before.capacity} → ${next.capacity}`);

  const carried = (
    <>
      <input type="hidden" name="slot_id" value={id} />
      {FIELDS.map((f) => (
        <input key={f} type="hidden" name={f} value={sp[f] ?? ""} />
      ))}
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Konfirmasi perubahan sesi"
        subtitle={`${before.programName} · ${dayName(before.day_of_week)} ${formatClock(before.start_time)} · ${before.location ?? "tanpa lokasi"}`}
      />
      {sp.error && (
        <p role="alert" className="text-sm text-red-700">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      <GlassCard className="flex flex-col gap-3">
        <h2 className={HEADING}>Yang berubah</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-slate-700">
          {changes.length ? changes.map((c) => <li key={c}>{c}</li>) : <li>Tidak ada perubahan pada jam, lokasi, atau pengajar.</li>}
        </ul>
        {people.length > 0 && (
          <p className="rounded-xl bg-[#DDF3F6] px-3 py-2 text-sm font-semibold text-[#0B6470]">{summary}</p>
        )}
      </GlassCard>

      {hard.length > 0 && (
        <GlassCard className="!border-[#F2A7B8]/70 !bg-[#FFF0F3]/90">
          <h2 className="text-sm font-bold text-[#7A1B36]">Tidak dapat disimpan</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-[#7A1B36]">
            {hard.map((c) => (
              <li key={c.message}>{c.message}</li>
            ))}
          </ul>
        </GlassCard>
      )}

      {hard.length === 0 && (
        <ToastForm action={applySlotChangeAction} className="flex flex-col gap-4" pendingLabel="Menyimpan...">
          {carried}

          {soft.length > 0 && (
            <GlassCard className="!border-[#FFC800]/50 !bg-[#FFF8E1]/90">
              <h2 className="text-sm font-bold text-[#6b5200]">Peringatan</h2>
              <ul className="mt-1 list-disc pl-5 text-sm text-[#6b5200]">
                {soft.map((c) => (
                  <li key={c.message}>{c.message}</li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-sm text-[#6b5200]">
                <input type="checkbox" name="confirm_warnings" className="mt-0.5 h-4 w-4" />
                <span>Saya mengerti peringatan di atas dan tetap ingin melanjutkan.</span>
              </label>
            </GlassCard>
          )}

          {people.length > 0 && (
            <GlassCard className="flex flex-col gap-3">
              <h2 className={HEADING}>Peserta di sesi ini ({people.length})</h2>

              <label className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${stuck.length ? "border-white/40 bg-white/30 text-slate-400" : "border-[#0E7C89]/50 bg-[#DDF3F6]/70 text-[#17263D]"}`}>
                <input type="radio" name="mode" value="all" defaultChecked={stuck.length === 0} disabled={stuck.length > 0} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-semibold">Lanjutkan dan pindahkan semua peserta</span>
                  <span className="block text-xs font-normal">Semua peserta ikut ke jadwal baru; sesi yang sama diperbarui.</span>
                  {stuck.map((s) => (
                    <span key={s.schedule_id} className="mt-1 block text-xs font-normal text-[#A3183C]">
                      {s.issues[0].message}
                    </span>
                  ))}
                </span>
              </label>

              <fieldset className="flex flex-col gap-2 rounded-2xl border border-white/50 bg-white/40 px-4 py-3">
                <label className="flex items-start gap-2.5 text-sm text-[#17263D]">
                  <input type="radio" name="mode" value="some" defaultChecked={stuck.length > 0} className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="font-semibold">Pilih peserta tertentu</span>
                    <span className="block text-xs text-slate-600">
                      Peserta yang dicentang pindah ke sesi baru dengan detail di atas; sesi lama tetap untuk peserta lain.
                    </span>
                  </span>
                </label>
                <ul className="flex flex-col gap-1.5 pl-6">
                  {people.map((p) => (
                    <li key={p.schedule_id}>
                      <label className={`flex items-center gap-2 text-sm ${p.issues.length ? "text-slate-400" : "text-slate-800"}`}>
                        <input type="checkbox" name="schedule_ids" value={p.schedule_id} disabled={p.issues.length > 0} className="h-4 w-4" />
                        {p.name}
                        {p.issues.length > 0 && <Badge tone="danger">Bentrok jadwal</Badge>}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </GlassCard>
          )}

          {people.length === 0 && <input type="hidden" name="mode" value="all" />}

          <div className="flex flex-wrap items-center gap-3">
            <GlassButton type="submit" className={`${ADMIN_CTA} px-6 py-2.5 text-sm`}>
              Simpan perubahan
            </GlassButton>
            <Link href={`/admin/jadwal/${id}`} className={`inline-flex min-h-11 items-center rounded-2xl border px-5 text-sm font-semibold ${SECONDARY_BUTTON}`}>
              Batalkan
            </Link>
          </div>
        </ToastForm>
      )}

      {hard.length > 0 && (
        <Link href={`/admin/jadwal/${id}`} className={`inline-flex min-h-11 w-fit items-center rounded-2xl border px-5 text-sm font-semibold ${SECONDARY_BUTTON}`}>
          Kembali ke sesi
        </Link>
      )}
    </div>
  );
}
