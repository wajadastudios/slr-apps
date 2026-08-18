import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import {
  createFaqAction,
  updateFaqAction,
  deleteFaqAction,
  moveFaqAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { error, edit } = await searchParams;
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("faq_items")
    .select("id, question, answer, sort_order")
    .order("sort_order")
    .order("created_at");

  const editingItem = edit ? items?.find((i) => i.id === edit) : undefined;
  const isEditing = Boolean(editingItem);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>
          {isEditing ? "Edit FAQ" : "Tambah FAQ"}
        </h2>
        <form
          action={isEditing ? updateFaqAction : createFaqAction}
          className="flex flex-col gap-4"
        >
          {isEditing && (
            <input type="hidden" name="faq_id" value={editingItem!.id} />
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Pertanyaan</label>
            <GlassInput
              name="question"
              defaultValue={editingItem?.question ?? ""}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Jawaban</label>
            <GlassTextarea
              name="answer"
              rows={3}
              defaultValue={editingItem?.answer ?? ""}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
          )}
          <div className="flex items-center gap-3">
            <GlassButton
              type="submit"
              className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
            >
              {isEditing ? "Simpan Perubahan" : "Tambah"}
            </GlassButton>
            {isEditing && (
              <a href="/admin/faq" className="text-sm text-slate-600 underline">
                Batal
              </a>
            )}
          </div>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar FAQ</h2>
        <div className="flex flex-col gap-2">
          {(!items || items.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada FAQ.</p>
          )}
          {items?.map((item, index) => (
            <DataRow
              key={item.id}
              primary={item.question}
              secondary={item.answer}
              action={
                <>
                  <form action={moveFaqAction}>
                    <input type="hidden" name="faq_id" value={item.id} />
                    <input type="hidden" name="direction" value="up" />
                    <GlassButton
                      type="submit"
                      disabled={index === 0}
                      className="px-3 py-2 text-sm"
                      aria-label="Naikkan urutan"
                    >
                      ↑
                    </GlassButton>
                  </form>
                  <form action={moveFaqAction}>
                    <input type="hidden" name="faq_id" value={item.id} />
                    <input type="hidden" name="direction" value="down" />
                    <GlassButton
                      type="submit"
                      disabled={index === (items?.length ?? 0) - 1}
                      className="px-3 py-2 text-sm"
                      aria-label="Turunkan urutan"
                    >
                      ↓
                    </GlassButton>
                  </form>
                  <a
                    href={`/admin/faq?edit=${item.id}`}
                    className="rounded-2xl border border-white/30 bg-white/30 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur-xl hover:bg-white/40"
                  >
                    Edit
                  </a>
                  <form action={deleteFaqAction}>
                    <input type="hidden" name="faq_id" value={item.id} />
                    <ConfirmSubmitButton
                      message="Hapus FAQ ini?"
                      className="!border-red-300 !bg-red-500/10 px-4 py-2 text-sm !text-red-700 hover:!bg-red-500/20"
                    >
                      Hapus
                    </ConfirmSubmitButton>
                  </form>
                </>
              }
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
