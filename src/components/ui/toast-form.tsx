"use client";

import {
  useState,
  useTransition,
  type FormEvent,
  type FormHTMLAttributes,
} from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action-result";
import { toUserMessage } from "@/lib/action-result";
import { FormPendingContext } from "@/components/ui/form-pending";
import { useToast } from "@/components/ui/toast";

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  pendingLabel?: string;
  // Clear the form after a successful save (create forms). Never on failure.
  resetOnSuccess?: boolean;
};

/**
 * Form wrapper that shows exactly one toast per submit, only after the
 * server action has actually answered.
 *
 * It submits from onSubmit instead of the `action` prop on purpose: React
 * resets uncontrolled fields after a form `action` finishes, even when it
 * failed -- which would wipe what the user typed. Results are handled right
 * where they arrive (not in an effect), so a submit can only ever toast once.
 */
export function ToastForm({
  action,
  pendingLabel = "Menyimpan...",
  resetOnSuccess = false,
  children,
  ...rest
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [resetKey, setResetKey] = useState(0);

  function handleResult(result: ActionState) {
    if (!result) return;

    if (result.ok) {
      toast.success(result.message, undefined, result.id);
      if (resetOnSuccess) setResetKey((k) => k + 1);
    } else {
      toast.error("Data belum tersimpan", toUserMessage(result.message), result.id);
    }

    if (result.redirectTo) {
      const target = new URL(result.redirectTo, window.location.origin);
      const here = `${window.location.pathname}${window.location.search}`;
      const next = `${target.pathname}${target.search}`;
      if (next !== here) {
        if (target.pathname === window.location.pathname) router.replace(next);
        else router.push(next);
        return;
      }
    }
    if (result.ok) router.refresh();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const formData = new FormData(e.currentTarget, submitter);

    startTransition(async () => {
      try {
        handleResult(await action(null, formData));
      } catch (err) {
        toast.error("Data belum tersimpan", toUserMessage(err));
      }
    });
  }

  return (
    <FormPendingContext.Provider value={{ pending, label: pendingLabel }}>
      <form key={resetKey} onSubmit={handleSubmit} {...rest}>
        {children}
      </form>
    </FormPendingContext.Provider>
  );
}
