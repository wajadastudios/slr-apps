import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { LogoutButton } from "@/components/logout-button";

export default async function AdminPage() {
  const session = await getUserWithRole();

  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Admin Panel
        </h1>
        <LogoutButton />
      </div>

      <GlassCard>
        <p className="text-slate-800 dark:text-slate-200">
          Masuk sebagai <strong>{session.fullName ?? session.user.email}</strong>.
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Fondasi & auth sudah aktif. Modul kelola pelatih, murid, jadwal,
          tagihan, dan konten landing page akan dibangun di tahap berikutnya.
        </p>
      </GlassCard>
    </div>
  );
}
