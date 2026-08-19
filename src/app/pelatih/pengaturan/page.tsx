import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { PengajarProfileForm } from "./profile-form";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function PelatihPengaturanPage() {
  const session = await getUserWithRole();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, phone, bank_info, birth_place, birth_date, address, avatar_url")
    .eq("id", session?.user.id ?? "")
    .single();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Pengaturan
      </h1>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Profil Saya</h2>
        <PengajarProfileForm userId={session!.user.id} profile={profile} />
      </GlassCard>
    </div>
  );
}
