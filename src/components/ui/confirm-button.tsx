"use client";

import { type ButtonHTMLAttributes } from "react";
import { GlassButton } from "./glass-button";

export function ConfirmSubmitButton({
  message,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <GlassButton
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...props}
    />
  );
}
