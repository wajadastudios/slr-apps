import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { PortalTopNav } from "@/components/portal-top-nav";

const NAV_ITEMS = [
  { href: "/ortu", label: "Ringkasan" },
  { href: "/ortu/tagihan", label: "Tagihan" },
  { href: "/ortu/pengaturan", label: "Pengaturan" },
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <PortalTopNav
        navItems={NAV_ITEMS}
        userLabel={session.fullName ?? session.user.email ?? ""}
        homeHref="/ortu"
      />
      {children}
    </div>
  );
}
