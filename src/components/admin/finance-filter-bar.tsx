import { FilterBar, FIELD_CLASS } from "@/components/admin/ui";
import { GlassButton } from "@/components/ui/glass-button";

// Shared period + program + location filter for every Keuangan page. A GET
// form (state lives in the URL), same convention as FilterBar elsewhere in
// admin/tagihan.
export function FinanceFilterBar({
  action,
  from,
  to,
  program,
  location,
  programs,
  locations,
  extraHidden,
}: {
  action: string;
  from: string;
  to: string;
  program?: string;
  location?: string;
  programs: { id: string; name: string }[];
  locations: string[];
  extraHidden?: Record<string, string | undefined>;
}) {
  return (
    <FilterBar action={action}>
      {extraHidden &&
        Object.entries(extraHidden)
          .filter(([, v]) => v)
          .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Dari tanggal
        <input type="date" name="from" defaultValue={from} className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Sampai tanggal
        <input type="date" name="to" defaultValue={to} className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Program
        <select name="program" defaultValue={program ?? ""} className={FIELD_CLASS}>
          <option value="">Semua program</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Lokasi
        <select name="location" defaultValue={location ?? ""} className={FIELD_CLASS}>
          <option value="">Semua lokasi</option>
          {locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>
      <GlassButton type="submit" className="!bg-[#35C5D0] px-5 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">
        Terapkan
      </GlassButton>
    </FilterBar>
  );
}
