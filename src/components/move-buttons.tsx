"use client";

import { ToastForm } from "@/components/ui/toast-form";
import { GlassButton } from "@/components/ui/glass-button";
import { SECONDARY_BUTTON } from "@/lib/ui-classes";
import type { ActionState } from "@/lib/action-result";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Arrow({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={`h-4 w-4 ${up ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M5.5 8L10 12.5" />
      <path d="M14.5 8L10 12.5" />
    </svg>
  );
}

// Up/down reorder controls. `fields` are extra hidden inputs the action needs
// (e.g. the parent group id).
export function MoveButtons({
  action,
  id,
  canUp,
  canDown,
  fields,
}: {
  action: Action;
  id: string;
  canUp: boolean;
  canDown: boolean;
  fields?: Record<string, string>;
}) {
  return (
    <>
      {(["up", "down"] as const).map((dir) => (
        <ToastForm key={dir} action={action} pendingLabel="">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="direction" value={dir} />
          {Object.entries(fields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <GlassButton
            type="submit"
            aria-label={dir === "up" ? "Naikkan urutan" : "Turunkan urutan"}
            title={dir === "up" ? "Naikkan" : "Turunkan"}
            disabled={dir === "up" ? !canUp : !canDown}
            className={`${SECONDARY_BUTTON} flex h-8 w-8 items-center justify-center !px-0 !py-0`}
          >
            <Arrow up={dir === "up"} />
          </GlassButton>
        </ToastForm>
      ))}
    </>
  );
}
