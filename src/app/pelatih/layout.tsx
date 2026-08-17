import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { PortalTopNav } from "@/components/portal-top-nav";

const NAV_ITEMS = [{ href: "/pelatih", label: "Ringkasan" }];

export default async function PelatihLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRole();

  if (!session || session.role !== "pelatih") {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <PortalTopNav
        navItems={NAV_ITEMS}
        userLabel={session.fullName ?? session.user.email ?? ""}
        homeHref="/pelatih"
      />
      {children}
    </div>
  );
}
