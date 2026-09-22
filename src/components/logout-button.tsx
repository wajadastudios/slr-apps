"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearRememberCookie } from "@/lib/supabase/remember";
import { GlassButton } from "@/components/ui/glass-button";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearRememberCookie();
    router.replace("/login");
    router.refresh();
  }

  return (
    <GlassButton onClick={handleLogout} className="px-4 py-2 text-sm">
      Keluar
    </GlassButton>
  );
}
