import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, EmptyState, PageHeader, StatTile, type Tone } from "@/components/admin/ui";
import { ImpactConfirm } from "@/components/admin/impact-confirm";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { STATUS_LABEL, type EnrollmentStatus } from "@/lib/enrollment";
import { describeActivity, type ActivityRow } from "@/lib/admin/activity";
import { coachName, dayName, formatClock, formatDateTime, formatRange, slotFill, FILL_LABEL, type SlotFill } from "@/lib/admin/format";
import { DAYS } from "@/lib/days";
import { addParticipantAction, movePersonAction, removePersonAction, saveSlotChangeAction } from "../actions";
import { deleteSlotAction } from "../../slot-jadwal/actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const FILL_TONE: Record<SlotFill, Tone> = { penuh: "danger", hampir_penuh: "warn", terisi_sebagian: "info", tersedia: "ok" };
const ENROLL_TONE: Record<string, Tone> = { scheduled: "ok", active: "ok", waiting_schedule: "info", schedule_offered: "info", pending_review: "warn" };

export default async function SlotRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("class_slots")
    .select("id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes, programs:program_id(name), pelatih:pelatih_id(full_name, title)")
    .eq("id", id)
    .maybeSingle();
  if (!slot) notFound();

  const [
    { data: rosterRows },
    { data: siblings },
    { data: coaches },
    { data: enrollmentRows },
    { data: locations },
    { data: activityRows },
    { data: allSchedules },
  ] = await Promise.all([
    supabase.from("schedules").select("id, student_id, student:student_id(id, full_name)").eq("slot_id", id),
    supabase
      .from("class_slots")
      .select("id, day_of_week, start_time, location, capacity, duration_minutes, pelatih:pelatih_id(full_name, title)")
      .eq("program_id", slot.program_id)
      .neq("id", id)
      .order("day_of_week")
      .order("start_time"),
    supabase.from("users").select("id, full_name, title").eq("role", "pelatih").eq("active", true).order("full_name"),
    supabase
      .from("enrollments")
      .select("student_id, status, student:student_id(id, full_name)")
      .eq("program_id", slot.program_id)
      .not("status", "in", "(cancelled,rejected)"),
    supabase.from("pool_locations").select("name").order("name"),
    supabase
      .from("activity_log")
      .select("id, created_at, actor_name, entity_type, action, changes, note")
      .eq("slot_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("schedules").select("slot_id"),
  ]);

  const program = (slot.programs as unknown as { name: string } | null)?.name ?? "Program";
  const coach = coachName(slot.pelatih as unknown as { full_name: string; title: string | null } | null);
  const duration = slot.duration_minutes ?? 60;
  const roster = (rosterRows ?? []).map((r) => ({
    scheduleId: r.id as string,
    studentId: r.student_id as string,
    name: (r.student as unknown as { full_name: string } | null)?.full_name ?? "Peserta",
  }));
  const fill = slotFill(roster.length, slot.capacity);
  const statusOf = new Map((enrollmentRows ?? []).map((e) => [e.student_id as string, e.status as EnrollmentStatus]));

  const filledBySlot = new Map<string, number>();
  for (const s of allSchedules ?? []) filledBySlot.set(s.slot_id, (filledBySlot.get(s.slot_id) ?? 0) + 1);

  const inRoster = new Set(roster.map((r) => r.studentId));
  const candidates = (enrollmentRows ?? [])
    .map((e) => e.student as unknown as { id: string; full_name: string } | null)
    .filter((s): s is { id: string; full_name: string } => !!s && !inRoster.has(s.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const back = `/admin/jadwal/${id}`;
  const targets = (siblings ?? []).map((s) => ({
    id: s.id,
    full: (filledBySlot.get(s.id) ?? 0) >= s.capacity,
    text: `${dayName(s.day_of_week)} ${formatClock(s.start_time)} · ${s.location ?? "tanpa lokasi"} · ${coachName(s.pelatih as unknown as { full_name: string; title: string | null } | null)} · ${filledBySlot.get(s.id) ?? 0}/${s.capacity}`,
  }));

  const lookup = (kind: "user" | "slot", refId: string) => {
    if (kind === "user") return (coaches ?? []).map((c) => [c.id, coachName(c)] as const).find(([cid]) => cid === refId)?.[1];
    return undefined;
  };

  const hidden = (
    <>
      <input type="hidden" name="slot_id" value={id} />
      <input type="hidden" name="program_id" value={slot.program_id} />
      <input type="hidden" name="return" value={back} />
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/jadwal" className="w-fit text-sm font-semibold text-[#0B6470] hover:underline">
        &lsaquo; Semua sesi
      </Link>
      <PageHeader
        title={`${dayName(slot.day_of_week)} · ${formatRange(slot.start_time, duration)} · ${program}${slot.label ? ` ${slot.label}` : ""}`}
        subtitle={`${slot.location ?? "Lokasi belum diisi"} · ${coach}`}
        actions={<Badge tone={FILL_TONE[fill]}>{FILL_LABEL[fill]}</Badge>}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {decodeURIComponent(error)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Peserta" value={`${roster.length}/${slot.capacity}`} />
        <StatTile label="Pengajar" value={coach} />
        <StatTile label="Lokasi" value={slot.location ?? "-"} />
        <StatTile label="Durasi" value={`${duration} menit`} />
      </div>

      {/* ---------- roster ---------- */}
      <GlassCard className="flex flex-col gap-3">
        <h2 className={HEADING}>Roster peserta</h2>
        {roster.length === 0 ? (
          <EmptyState title="Belum ada peserta di sesi ini." hint="Tambahkan peserta dari daftar di bawah, atau tawarkan sesi ini dari halaman Pendaftar." />
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.map((p) => {
              const st = statusOf.get(p.studentId);
              return (
                <li key={p.scheduleId} className="flex flex-col gap-2 rounded-xl border border-white/60 bg-white/60 px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/murid/${p.studentId}?tab=jadwal`} className="text-sm font-semibold text-[#17263D] hover:underline">
                      {p.name}
                    </Link>
                    {st && <Badge tone={ENROLL_TONE[st] ?? "neutral"}>{STATUS_LABEL[st]}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {targets.length > 0 && (
                      <ToastForm action={movePersonAction} className="flex items-center gap-2" pendingLabel="Memindahkan...">
                        <input type="hidden" name="schedule_id" value={p.scheduleId} />
                        <input type="hidden" name="return" value={back} />
                        <GlassSelect name="to_slot_id" required defaultValue="" glassChevron className="min-w-56 text-sm">
                          <option value="" disabled>
                            Pindahkan ke sesi...
                          </option>
                          {targets.map((t) => (
                            <option key={t.id} value={t.id} disabled={t.full}>
                              {t.text}
                              {t.full ? " (penuh)" : ""}
                            </option>
                          ))}
                        </GlassSelect>
                        <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-2 text-sm`}>
                          Pindahkan
                        </GlassButton>
                      </ToastForm>
                    )}
                    <ToastForm action={removePersonAction} className="flex items-center" pendingLabel="Memproses...">
                      <input type="hidden" name="schedule_id" value={p.scheduleId} />
                      <input type="hidden" name="return" value={back} />
                      <ImpactConfirm
                        label="Keluarkan dari slot"
                        title={`Keluarkan ${p.name} dari sesi ini?`}
                        impacts={[
                          "Kursi peserta di sesi ini dilepas.",
                          st === "scheduled" ? "Pendaftaran kembali ke Menunggu Jadwal sampai diberi sesi baru." : "Status pendaftaran tidak berubah; beri sesi baru agar peserta tidak tanpa jadwal.",
                          "Laporan dan tagihan yang sudah ada tetap tersimpan.",
                        ]}
                        destructive
                        confirmLabel="Ya, keluarkan"
                      />
                    </ToastForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <ToastForm action={addParticipantAction} className="flex flex-wrap items-end gap-2 border-t border-white/50 pt-3" pendingLabel="Menambahkan...">
          <input type="hidden" name="slot_id" value={id} />
          <input type="hidden" name="return" value={back} />
          <div className="flex min-w-64 flex-col gap-1">
            <label className="text-xs text-slate-600">Tambah peserta ({program})</label>
            <GlassSelect name="student_id" required defaultValue="" glassChevron>
              <option value="" disabled>
                {candidates.length ? "Pilih peserta" : "Semua peserta program ini sudah ada di sesi"}
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton type="submit" disabled={candidates.length === 0 || roster.length >= slot.capacity} className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
            Tambah peserta
          </GlassButton>
          {roster.length >= slot.capacity && <p className="text-xs text-[#A3183C]">Sesi penuh. Naikkan kapasitas untuk menambah peserta.</p>}
        </ToastForm>
      </GlassCard>

      {/* ---------- change the session ---------- */}
      <GlassCard className="flex flex-col gap-3">
        <h2 className={HEADING}>Ubah sesi</h2>
        <p className="text-sm text-slate-600">
          Perubahan jam, lokasi, atau pengajar diperiksa dulu terhadap jadwal pengajar, kolam, dan peserta. Jika sesi sudah
          punya peserta, dampaknya ditampilkan sebelum disimpan.
        </p>

        <ToastForm action={saveSlotChangeAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" pendingLabel="Memeriksa...">
          {hidden}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Pengajar</label>
            <GlassSelect name="pelatih_id" required defaultValue={slot.pelatih_id} glassChevron>
              {(coaches ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {coachName(c)}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Hari</label>
            <GlassSelect name="day_of_week" required defaultValue={String(slot.day_of_week)} glassChevron>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Jam mulai</label>
            <GlassInput name="start_time" type="time" required defaultValue={slot.start_time.slice(0, 5)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Durasi (menit)</label>
            <GlassInput name="duration_minutes" type="number" min={15} max={240} step={5} required defaultValue={duration} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Lokasi kolam</label>
            <GlassInput name="location" list="lokasi-kolam" defaultValue={slot.location ?? ""} placeholder="Nama kolam" />
            <datalist id="lokasi-kolam">
              {(locations ?? []).map((l) => (
                <option key={l.name} value={l.name} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Tipe kelas</label>
            <GlassSelect name="label" defaultValue={slot.label ?? ""} glassChevron>
              <option value="">Tanpa label</option>
              <option value="Grup">Grup</option>
              <option value="Private">Private</option>
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Kapasitas</label>
            <GlassInput name="capacity" type="number" min={1} required defaultValue={slot.capacity} />
          </div>
          <div className="flex items-end">
            <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
              Periksa &amp; simpan
            </GlassButton>
          </div>
        </ToastForm>

        <ToastForm action={deleteSlotAction} className="flex flex-wrap items-center gap-3 border-t border-white/50 pt-3" pendingLabel="Menghapus...">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return" value="/admin/jadwal" />
          <ImpactConfirm
            label="Hapus sesi ini"
            title={`Hapus sesi ${dayName(slot.day_of_week)} ${formatClock(slot.start_time)} ${program}?`}
            impacts={
              roster.length > 0
                ? [`Sesi ini masih punya ${roster.length} peserta. Pindahkan atau keluarkan mereka lebih dulu; sesi tidak dapat dihapus selama masih berisi.`]
                : ["Sesi kosong ini dihapus dari jadwal.", "Riwayat perubahan sesi tetap tercatat.", "Tindakan ini tidak dapat dibatalkan."]
            }
            destructive
            confirmLabel={roster.length > 0 ? "Coba hapus" : "Ya, hapus sesi"}
          />
          {roster.length > 0 && <p className="text-xs text-slate-500">Sesi berisi peserta tidak dapat dihapus.</p>}
        </ToastForm>
      </GlassCard>

      {/* ---------- history ---------- */}
      <GlassCard className="flex flex-col gap-2">
        <h2 className={HEADING}>Riwayat perubahan</h2>
        {(activityRows ?? []).length === 0 ? (
          <EmptyState title="Belum ada riwayat." hint="Perubahan jam, pengajar, lokasi, dan peserta sesi ini akan tercatat beserta siapa yang mengubahnya." />
        ) : (
          <div className="flex flex-col divide-y divide-white/50">
            {((activityRows ?? []) as ActivityRow[]).map((row) => {
              const d = describeActivity(row, lookup);
              return (
                <div key={row.id} className="flex flex-col gap-0.5 py-2">
                  <p className="text-sm font-semibold text-[#17263D]">{d.title}</p>
                  {d.detail.map((line) => (
                    <p key={line} className="text-xs text-slate-600">
                      {line}
                    </p>
                  ))}
                  <p className="text-xs text-slate-500">
                    {row.actor_name ?? "Sistem"} · {formatDateTime(row.created_at)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
