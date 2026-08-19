"use client";

import { useState } from "react";
import { GlassButton } from "./glass-button";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Salin Link",
  copiedLabel = "Tersalin!",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) -- nothing
      // useful to do beyond leaving the button unchanged for a retry.
    }
  }

  return (
    <GlassButton
      type="button"
      onClick={handleClick}
      className={cn("px-3 py-1.5 text-xs", className)}
    >
      {copied ? copiedLabel : label}
    </GlassButton>
  );
}
