import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WaterBg } from "@/components/water-bg";
import { PortalSidebar } from "@/components/portal-sidebar";

export default async function OrtuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRole();

  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  // Until a class is scheduled (or an invoice was issued) a participant only
  // needs the registration status and account settings, so "Tagihan" stays
  // out of the menu.
  const supabase = await createClient();
  const [{ data: access }, { data: bills }] = await Promise.all([
    supabase.from("enrollments").select("id").in("status", ["scheduled", "active"]).limit(1),
    supabase.from("invoices").select("id").limit(1),
  ]);
  const showBilling = (access ?? []).length > 0 || (bills ?? []).length > 0;

  const navGroups = [
    {
      label: null,
      items: [
        { href: "/ortu", label: "Ringkasan", also: ["/ortu/anak"] },
        ...(showBilling ? [{ href: "/ortu/tagihan", label: "Tagihan" }] : []),
        { href: "/ortu/pengaturan", label: "Pengaturan" },
      ],
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
      <WaterBg variant="dashboard" />
      <PortalSidebar
        navGroups={navGroups}
        homeHref="/ortu"
        userLabel={session.fullName ?? session.user.email ?? ""}
      />
      <main className="mx-auto w-full max-w-6xl flex-1">{children}</main>
    </div>
  );
}
