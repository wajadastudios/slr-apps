import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { PortalSidebar } from "@/components/portal-sidebar";

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: "/ortu", label: "Ringkasan" },
      { href: "/ortu/tagihan", label: "Tagihan" },
      { href: "/ortu/pengaturan", label: "Pengaturan" },
    ],
  },
];

export default async function OrtuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRole();

  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
      <PortalSidebar
        navGroups={NAV_GROUPS}
        homeHref="/ortu"
        userLabel={session.fullName ?? session.user.email ?? ""}
      />
      <main className="mx-auto w-full max-w-6xl flex-1">{children}</main>
    </div>
  );
}
