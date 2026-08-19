import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { PortalSidebar } from "@/components/portal-sidebar";

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: "/pelatih", label: "Ringkasan" },
      { href: "/pelatih/gaji", label: "Gaji" },
      { href: "/pelatih/pengganti", label: "Pengajar Pengganti" },
      { href: "/pelatih/pengaturan", label: "Pengaturan" },
    ],
  },
];

export default async function PelatihLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRole();

  if (!session || session.role !== "pelatih") {
    redirect("/login");
  }

  const userLabel = session.fullName
    ? session.title
      ? `${session.title} ${session.fullName}`
      : session.fullName
    : session.user.email ?? "";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
      <PortalSidebar navGroups={NAV_GROUPS} homeHref="/pelatih" userLabel={userLabel} />
      <main className="mx-auto w-full max-w-6xl flex-1">{children}</main>
    </div>
  );
}
