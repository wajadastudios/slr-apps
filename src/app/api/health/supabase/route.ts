import { createClient } from "@supabase/supabase-js";
import { handleHealthRequest } from "@/lib/health-check";

export const dynamic = "force-dynamic";

// Daily keep-alive target (.github/workflows/supabase-healthcheck.yml). Runs
// one constant-returning database function with the PUBLIC anon key -- no
// service-role key, no table access, no student/report/billing data.
export async function GET(request: Request) {
  return handleHealthRequest(request, {
    secret: process.env.SLR_HEALTHCHECK_SECRET,
    probe: async () => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      return supabase.rpc("health_check").abortSignal(AbortSignal.timeout(8000));
    },
  });
}
