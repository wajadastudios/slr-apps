"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";

export function EditableListField({
  initialItems,
  fieldName,
  itemLabel = "Item",
  placeholder = "",
}: {
  initialItems: string[];
  fieldName: string;
  itemLabel?: string;
  placeholder?: string;
}) {
  const [items, setItems] = useState<string[]>(
    initialItems.length > 0 ? initialItems : [""]
  );

  function updateItem(i: number, value: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? value : it)));
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addItem() {
    setItems((prev) => [...prev, ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <GlassInput
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Hapus
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-slate-500">Belum ada {itemLabel.toLowerCase()}.</p>
        )}
      </div>
      <GlassButton
        type="button"
        onClick={addItem}
        className="w-fit px-4 py-2 text-sm"
      >
        + Tambah {itemLabel}
      </GlassButton>
      <input
        type="hidden"
        name={fieldName}
        value={JSON.stringify(items.map((i) => i.trim()).filter(Boolean))}
      />
    </div>
  );
}
