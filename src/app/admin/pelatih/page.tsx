import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import {
  createPelatihAction,
  updatePelatihTitleAction,
  togglePelatihActiveAction,
  deletePelatihAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function PelatihPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: pelatihList } = await supabase
    .from("users")
    .select("id, full_name, email, title, active, created_at")
    .eq("role", "pelatih")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Tambah Pengajar</h2>
        <form action={createPelatihAction} className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama</label>
            <GlassInput name="full_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Sapaan (opsional)
            </label>
            <GlassInput name="title" placeholder="Ms / Mr / Coach" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Email</label>
            <GlassInput name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Password Awal</label>
            <GlassInput name="password" type="text" required minLength={6} />
          </div>
          {error && (
            <p className="text-sm text-red-700 sm:col-span-4">
              {decodeURIComponent(error)}
            </p>
          )}
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba] sm:col-span-4 sm:w-fit"
          >
            Tambah Pengajar
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Pengajar</h2>
        <div className="flex flex-col gap-2">
          {(!pelatihList || pelatihList.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada pengajar.</p>
          )}
          {pelatihList?.map((p) => (
            <DataRow
              key={p.id}
              muted={p.active === false}
              primary={
                <>
                  {p.title ? `${p.title} ${p.full_name}` : p.full_name}
                  {p.active === false && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Nonaktif
                    </span>
                  )}
                </>
              }
              secondary={p.email}
              action={
                <>
                  <form
                    action={updatePelatihTitleAction}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <GlassInput
                      name="title"
                      defaultValue={p.title ?? ""}
                      placeholder="Sapaan"
                      className="w-28 px-3 py-1.5 text-sm"
                    />
                    <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                      Simpan
                    </GlassButton>
                  </form>
                  <form action={togglePelatihActiveAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input
                      type="hidden"
                      name="next_active"
                      value={(p.active === false).toString()}
                    />
                    <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                      {p.active === false ? "Aktifkan" : "Nonaktifkan"}
                    </GlassButton>
                  </form>
                  <form action={deletePelatihAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmSubmitButton
                      message="Hapus akun pengajar ini? Hanya bisa untuk pengajar yang belum pernah menulis laporan. Untuk pengajar yang mengundurkan diri, gunakan Nonaktifkan agar riwayat laporan siswa tetap utuh."
                      className="!border-red-300 !bg-red-500/10 px-3 py-1.5 text-xs !text-red-700 hover:!bg-red-500/20"
                    >
                      Hapus
                    </ConfirmSubmitButton>
                  </form>
                </>
              }
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
