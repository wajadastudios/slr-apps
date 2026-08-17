import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { updateSkillTemplateAction } from "./actions";

export default async function ProgramPage() {
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, description, badge, skill_template")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      {programs?.map((program) => (
        <GlassCard key={program.id}>
          <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            {program.name}
          </h2>
          {program.description && (
            <p className="mt-1 text-sm text-slate-600">
              {program.description}
            </p>
          )}

          <form
            action={updateSkillTemplateAction}
            className="mt-4 flex flex-col gap-2"
          >
            <input type="hidden" name="id" value={program.id} />
            <label className="text-sm text-slate-800">
              Badge singkat (opsional, tampil di landing page)
            </label>
            <GlassInput
              name="badge"
              placeholder="Contoh: Ibu hamil trimester 2-3"
              defaultValue={program.badge ?? ""}
            />
            <label className="mt-2 text-sm text-slate-800">
              Checklist skill (satu per baris)
            </label>
            <GlassTextarea
              name="skill_template"
              rows={5}
              defaultValue={(
                (program.skill_template as unknown as string[]) ?? []
              ).join("\n")}
            />
            <GlassButton
              type="submit"
              className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
            >
              Simpan
            </GlassButton>
          </form>
        </GlassCard>
      ))}
    </div>
  );
}
