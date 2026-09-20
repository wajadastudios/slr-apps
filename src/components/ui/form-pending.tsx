"use client";

import { createContext, useContext } from "react";

// Lets submit buttons inside a <ToastForm> know the form is saving without
// each call site wiring it up by hand.
export const FormPendingContext = createContext<{ pending: boolean; label: string }>({
  pending: false,
  label: "Menyimpan...",
});

export function useFormPending() {
  return useContext(FormPendingContext);
}
