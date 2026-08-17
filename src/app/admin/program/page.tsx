import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { EditableListField } from "@/components/ui/editable-list-field";
import {
  createProgramAction,
  updateSkillTemplateAction,
  toggleProgramActiveAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, description, badge, skill_template, active")
    .order("name");

  const selectedId = id || programs?.[0]?.id;
  const selected = programs?.find((p) => p.id === selectedId);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Tambah Kategori/Program</h2>
        <form action={createProgramAction} className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Kategori</label>
            <GlassInput name="name" placeholder="Contoh: Toddler Swim" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Deskripsi (opsional)
            </label>
            <GlassInput name="description" />
          </div>
          {error && (
            <p className="text-sm text-red-700 sm:col-span-2">
              {decodeURIComponent(error)}
            </p>
          )}
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba] sm:col-span-2"
          >
            Tambah Kategori
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Kelola Kategori</h2>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Pilih Kategori</label>
            <GlassSelect
              name="id"
              defaultValue={selectedId ?? ""}
              className="min-w-[220px]"
            >
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.active ? " (nonaktif)" : ""}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
          >
            Tampilkan
          </GlassButton>
        </form>

        {(!programs || programs.length === 0) && (
          <p className="mt-3 text-sm text-slate-600">Belum ada kategori.</p>
        )}
      </GlassCard>

      {selected && (
        <GlassCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className={HEADING}>
              {selected.name}
              {!selected.active && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  (nonaktif)
                </span>
              )}
            </h2>
            <form action={toggleProgramActiveAction}>
              <input type="hidden" name="id" value={selected.id} />
              <input
                type="hidden"
                name="next_active"
                value={(!selected.active).toString()}
              />
              <GlassButton type="submit" className="px-4 py-2 text-sm">
                {selected.active ? "Nonaktifkan" : "Aktifkan"}
              </GlassButton>
            </form>
          </div>

          <form
            action={updateSkillTemplateAction}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="id" value={selected.id} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Deskripsi</label>
              <GlassInput
                name="description"
                defaultValue={selected.description ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                Badge singkat (opsional, tampil di landing page)
              </label>
              <GlassInput
                name="badge"
                placeholder="Contoh: Ibu hamil trimester 2-3"
                defaultValue={selected.badge ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                Checklist Skill Penilaian
              </label>
              <EditableListField
                initialItems={
                  (selected.skill_template as unknown as string[]) ?? []
                }
                fieldName="skill_template"
                itemLabel="Skill"
                placeholder="Nama skill"
              />
            </div>
            <GlassButton
              type="submit"
              className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
            >
              Simpan
            </GlassButton>
          </form>
        </GlassCard>
      )}
    </div>
  );
}
