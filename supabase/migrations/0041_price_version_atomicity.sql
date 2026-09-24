-- Audit tahap 2, T2-03: price-version creation (close old version, insert
-- new version, refresh program_packages.price cache) was three separate
-- requests from admin/paket-harga/actions.ts. If the insert failed, the
-- close of the old version had already committed, leaving the package with
-- no open version at all; the cache-refresh request's own error was never
-- even checked. All three steps now run inside one function, so either the
-- whole thing lands or none of it does -- and a retry that resubmits the
-- exact same price as the currently open version is a no-op instead of a
-- second (duplicate) version.
--
-- security invoker (not definer): the caller is already required to be an
-- admin (requireAdmin() in the calling action), and the existing RLS
-- policies on both tables already grant admin full access -- no need to
-- bypass RLS here.
create or replace function public.create_package_price_version(
  p_package_id uuid,
  p_price numeric,
  p_note text,
  p_effective_from timestamptz,
  p_created_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_open_id uuid;
  v_open_price numeric;
  v_new_id uuid;
begin
  if p_price is null or p_price < 0 then
    raise exception 'Harga tidak boleh negatif';
  end if;

  select id, price into v_open_id, v_open_price
  from public.package_price_versions
  where program_package_id = p_package_id and effective_until is null
  order by effective_from desc
  limit 1
  for update;

  if v_open_id is not null and v_open_price = p_price then
    return v_open_id;
  end if;

  if v_open_id is not null then
    update public.package_price_versions
      set effective_until = p_effective_from
      where id = v_open_id;
  end if;

  insert into public.package_price_versions (program_package_id, price, effective_from, note, created_by)
  values (p_package_id, p_price, p_effective_from, p_note, p_created_by)
  returning id into v_new_id;

  -- Only advance the "current price" cache if this version takes effect now
  -- or in the past -- a future-dated version stays purely historical/planned
  -- until its date arrives (see resolveCurrentPackagePrices/resolveInvoicePrice,
  -- which both resolve the effective-dated version directly rather than
  -- trusting this cache).
  if p_effective_from <= now() then
    update public.program_packages set price = p_price where id = p_package_id;
  end if;

  return v_new_id;
end;
$$;

grant execute on function public.create_package_price_version(uuid, numeric, text, timestamptz, uuid) to authenticated;
