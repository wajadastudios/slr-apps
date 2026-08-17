import { createClient } from "@/lib/supabase/server";

export async function getUserWithRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name, title")
    .eq("id", user.id)
    .single();

  return {
    user,
    role: profile?.role as "admin" | "pelatih" | "ortu" | undefined,
    fullName: profile?.full_name as string | undefined,
    title: profile?.title as string | undefined,
  };
}
