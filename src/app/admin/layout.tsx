import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/admin", label: "Ringkasan" },
  { href: "/admin/pelatih", label: "Pelatih" },
  { href: "/admin/orang-tua", label: "Orang Tua" },
  { href: "/admin/murid", label: "Murid" },
  { href: "/admin/program", label: "Program" },
  { href: "/admin/slot-jadwal", label: "Slot Jadwal" },
  { href: "/admin/jadwal", label: "Jadwal Murid" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRole();

  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/30 bg-white/20 px-5 py-4 shadow-[0_8px_32px_rgba(31,38,135,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <nav className="flex flex-wrap gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/40 dark:text-slate-200 dark:hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {session.fullName ?? session.user.email}
          </span>
          <LogoutButton />
        </div>
      </div>

      {children}
    </div>
  );
}
