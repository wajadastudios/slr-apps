import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { updateOwnProfileAction, updateChildProfileAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function OrtuPengaturanPage() {
  const session = await getUserWithRole();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, phone, address, avatar_url")
    .eq("id", session?.user.id ?? "")
    .single();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, nickname, avatar_url")
    .order("full_name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Pengaturan
      </h1>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Profil Saya</h2>
        <form
          action={updateOwnProfileAction}
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="current_avatar_url"
            value={profile?.avatar_url ?? ""}
          />
          <div className="flex items-center gap-4">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EEF9FB] text-2xl">
                👤
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Foto (opsional)</label>
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#35C5D0] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Nama Lengkap</label>
              <GlassInput
                name="full_name"
                defaultValue={profile?.full_name ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                Nomor WhatsApp
              </label>
              <GlassInput name="phone" defaultValue={profile?.phone ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Alamat</label>
            <GlassTextarea
              name="address"
              rows={2}
              defaultValue={profile?.address ?? ""}
            />
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
          >
            Simpan Profil
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Data Anak</h2>
        <div className="flex flex-col gap-4">
          {(!children || children.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada data anak.</p>
          )}
          {children?.map((child) => (
            <form
              key={child.id}
              action={updateChildProfileAction}
              className="flex flex-col gap-3 rounded-xl border border-white/30 bg-white/40 p-4"
            >
              <input type="hidden" name="student_id" value={child.id} />
              <input
                type="hidden"
                name="current_avatar_url"
                value={child.avatar_url ?? ""}
              />
              <div className="flex items-center gap-4">
                {child.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={child.avatar_url}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF9FB] text-xl">
                    🧒
                  </div>
                )}
                <input
                  type="file"
                  name="photo"
                  accept="image/*"
                  className="text-xs text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-[#35C5D0] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">
                    Nama Lengkap
                  </label>
                  <GlassInput
                    name="full_name"
                    defaultValue={child.full_name}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">
                    Nama Panggilan
                  </label>
                  <GlassInput
                    name="nickname"
                    placeholder="Contoh: Kayla"
                    defaultValue={child.nickname ?? ""}
                  />
                </div>
              </div>
              <GlassButton type="submit" className="w-fit px-4 py-2 text-sm">
                Simpan
              </GlassButton>
            </form>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
