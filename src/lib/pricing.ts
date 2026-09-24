import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Single source of truth for "what price applies right now" -- every place
// that creates or previews an invoice amount (admin/tagihan/actions.ts today;
// anywhere else in the future) calls this instead of reading
// program_packages.price directly, so the lookup order in the pricing policy
// (Kebijakan F) can never drift between call sites.
//
//   1. an active price lock for this exact (enrollment, package) pair --
//      "harga yang disepakati" for a participant who has billed this package
//      before, unaffected by a later price-list change.
//   2. otherwise the package's current price (package_price_versions row with
//      effective_until is null) -- a brand new enrollment, or a package this
//      enrollment has never been billed under before.
//
// This never writes anything -- see lockEnrollmentPriceIfMissing for the one
// place a lock is created.

export type ResolvedPrice = {
  price: number;
  currency: string;
  source: "enrollment_lock" | "package";
  packagePriceVersionId: string | null;
  enrollmentPriceLockId: string | null;
  effectiveFrom: string | null;
};

export async function resolveInvoicePrice(
  supabase: SupabaseClient,
  enrollmentId: string,
  programPackageId: string
): Promise<ResolvedPrice> {
  const { data: lock } = await supabase
    .from("enrollment_price_locks")
    .select("id, price, currency, package_price_version_id, effective_from")
    .eq("enrollment_id", enrollmentId)
    .eq("program_package_id", programPackageId)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lock) {
    return {
      price: Number(lock.price),
      currency: lock.currency,
      source: "enrollment_lock",
      packagePriceVersionId: lock.package_price_version_id,
      enrollmentPriceLockId: lock.id,
      effectiveFrom: lock.effective_from,
    };
  }

  const { data: pkg } = await supabase
    .from("program_packages")
    .select("price, currency")
    .eq("id", programPackageId)
    .single();

  // The version whose effective_from has actually arrived, latest first --
  // not just "the open one" (effective_until is null), because a
  // future-dated version an admin has already scheduled is open too but
  // must not apply before its date.
  const { data: currentVersion } = await supabase
    .from("package_price_versions")
    .select("id, effective_from")
    .eq("program_package_id", programPackageId)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    price: Number(pkg?.price ?? 0),
    currency: pkg?.currency ?? "IDR",
    source: "package",
    packagePriceVersionId: currentVersion?.id ?? null,
    enrollmentPriceLockId: null,
    effectiveFrom: currentVersion?.effective_from ?? null,
  };
}

// Batch version of the same effective-dated lookup above, for
// participant-facing pages that list several packages' prices at once
// (landing page, self-registration form) instead of resolving one invoice.
// program_packages.price/currency is only a cache, refreshed when an admin
// re-saves after a scheduled version's date arrives (Kebijakan C) -- reading
// it directly would show a stale price to a prospect right up until that
// next save, while an actual invoice (via resolveInvoicePrice) would already
// be charging the new one. Falls back to the package's own cached price for
// any id with no version row at all (should not happen after 0038's
// backfill, but a prospect must never see no price at all).
export async function resolveCurrentPackagePrices(
  supabase: SupabaseClient,
  packages: { id: string; price: number; currency?: string | null }[]
): Promise<Map<string, { price: number; currency: string }>> {
  const result = new Map<string, { price: number; currency: string }>();
  for (const p of packages) result.set(p.id, { price: Number(p.price), currency: p.currency ?? "IDR" });
  if (packages.length === 0) return result;

  const { data } = await supabase
    .from("package_price_versions")
    .select("program_package_id, price, currency, effective_from")
    .in("program_package_id", packages.map((p) => p.id))
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false });

  const resolved = new Set<string>();
  for (const v of data ?? []) {
    if (resolved.has(v.program_package_id)) continue;
    resolved.add(v.program_package_id);
    result.set(v.program_package_id, { price: Number(v.price), currency: v.currency ?? "IDR" });
  }
  return result;
}

// Called right after an invoice is created from the package's current price
// (resolved.source === "package"): locks that price in for this
// enrollment+package pair so its *next* invoice reuses it even if the
// package's price changes in the meantime. A no-op if a lock already exists
// (never overwrites one an admin set deliberately).
export async function lockEnrollmentPriceIfMissing(
  supabase: SupabaseClient,
  enrollmentId: string,
  programPackageId: string,
  resolved: ResolvedPrice,
  createdBy: string | null
): Promise<void> {
  if (resolved.source === "enrollment_lock") return;
  const { count } = await supabase
    .from("enrollment_price_locks")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("program_package_id", programPackageId);
  if ((count ?? 0) > 0) return;

  await supabase.from("enrollment_price_locks").insert({
    enrollment_id: enrollmentId,
    program_package_id: programPackageId,
    package_price_version_id: resolved.packagePriceVersionId,
    price: resolved.price,
    currency: resolved.currency,
    created_by: createdBy,
  });
}

export type PriceSource = "package" | "enrollment_lock" | "override";

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  package: "Harga terbaru",
  enrollment_lock: "Harga peserta",
  override: "Override admin",
};

export const DISCOUNT_TYPE_LABEL: Record<string, string> = {
  percent: "Persen",
  fixed: "Nominal tetap",
  unknown: "Riwayat, rincian tidak diketahui",
};
