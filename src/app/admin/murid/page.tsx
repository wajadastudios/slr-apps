import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Badge, EmptyState, FIELD_CLASS, FilterBar, PageHeader } from "@/components/admin/ui";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { selectAll } from "@/lib/admin/load";
import { formatAge } from "@/lib/performance";
import { MuridForm } from "./murid-form";

const PAGE = 40;

type StudentRow = {
  id: string;
  full_name: string;
  nickname: string | null;
  birth_date: string | null;
  active: boolean;
  kind: string;
  phone: string | null;
  users: { full_name: string | null } | null;
};

export default async function MuridPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string; program?: string; status?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [students, enrollments, { data: parents }, { data: programs }] = await Promise.all([
    selectAll<StudentRow>(supabase, "students", "id, full_name, nickname, birth_date, active, kind, phone, users:parent_id(full_name)"),
    selectAll<{ student_id: string; program_id: string; status: string }>(supabase, "enrollments", "student_id, program_id, status"),
    supabase.from("users").select("id, full_name").eq("role", "ortu").order("full_name"),
    supabase.from("programs").select("id, name").order("name"),
  ]);

  const programName = new Map((programs ?? []).map((p) => [p.id, p.name]));
  const liveByStudent = new Map<string, { program_id: string; status: string }[]>();
  for (const e of enrollments) {
    if (e.status === "cancelled" || e.status === "rejected") continue;
    const list = liveByStudent.get(e.student_id) ?? [];
    list.push(e);
    liveByStudent.set(e.student_id, list);
  }

  const q = (sp.q ?? "").trim().toLowerCase();
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);
  const filtered = students
    .filter((s) => (sp.status === "nonaktif" ? !s.active : sp.status === "semua" ? true : s.active))
    .filter((s) => !sp.program || (liveByStudent.get(s.id) ?? []).some((e) => e.program_id === sp.program))
    .filter(
      (s) =>
        !q ||
        [s.full_name, s.nickname, s.phone, s.users?.full_name].some((v) => (v ?? "").toLowerCase().includes(q))
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const shown = filtered.slice(0, limit);
  const filtersActive = !!(q || sp.program || sp.status);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Siswa" subtitle="Buka satu peserta untuk melihat jadwal, tagihan, laporan, dan riwayatnya di satu tempat." />

      {sp.error && (
        <p role="alert" className="text-sm text-red-700">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      <FilterBar action="/admin/murid">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
          Cari
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Nama peserta, akun, atau WhatsApp" className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Program
          <select name="program" defaultValue={sp.program ?? ""} className={FIELD_CLASS}>
            <option value="">Semua program</option>
            {(programs ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Status
          <select name="status" defaultValue={sp.status ?? ""} className={FIELD_CLASS}>
            <option value="">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="semua">Semua</option>
          </select>
        </label>
        <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
          Terapkan
        </GlassButton>
        {filtersActive && (
          <Link href="/admin/murid" className="min-h-10 self-center text-sm font-semibold text-[#0B6470] hover:underline">
            Reset
          </Link>
        )}
      </FilterBar>

      {shown.length === 0 ? (
        <EmptyState
          title={filtersActive ? "Tidak ada siswa yang cocok." : "Belum ada siswa."}
          hint={filtersActive ? "Ubah atau reset filter." : "Siswa muncul saat orang tua mendaftar atau saat Anda menambahkannya di bawah."}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((s) => {
            const live = liveByStudent.get(s.id) ?? [];
            const age = formatAge(s.birth_date);
            return (
              <Link
                key={s.id}
                href={`/admin/murid/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 transition-colors hover:bg-[#0E7C89]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7C89]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#17263D]">
                    {s.full_name}
                    {s.nickname ? ` (${s.nickname})` : ""}
                    {age ? <span className="font-normal text-slate-500"> · {age}</span> : null}
                  </span>
                  <span className="block text-xs text-slate-500">Akun: {s.users?.full_name ?? "-"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {live.length === 0 ? (
                    <Badge>Belum ada kelas</Badge>
                  ) : (
                    live.map((e) => (
                      <Badge key={e.program_id} tone={e.status === "active" ? "ok" : "info"}>
                        {programName.get(e.program_id) ?? "Program"}
                      </Badge>
                    ))
                  )}
                  {!s.active && <Badge tone="danger">Nonaktif</Badge>}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length > shown.length && (
        <Link
          href={`/admin/murid?${new URLSearchParams({ q: sp.q ?? "", program: sp.program ?? "", status: sp.status ?? "", limit: String(limit + PAGE) }).toString()}`}
          className={`inline-flex min-h-11 w-fit items-center rounded-2xl border px-5 text-sm font-semibold ${SECONDARY_BUTTON}`}
        >
          Tampilkan lebih banyak ({filtered.length - shown.length} lagi)
        </Link>
      )}

      <GlassCard>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-[#17263D]">Tambah siswa baru</summary>
          <div className="mt-4">
            <MuridForm parents={parents ?? []} programs={programs ?? []} />
          </div>
        </details>
      </GlassCard>
    </div>
  );
}
