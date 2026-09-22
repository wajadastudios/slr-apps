"use client";

import type { MouseEvent, ReactNode } from "react";
import { smoothScrollToId } from "@/lib/smooth-scroll";

/**
 * Wraps an internal `#id` anchor so it uses the shared smooth-scroll utility
 * instead of a native anchor jump — the same behavior as "Buka contoh
 * laporan". A thin client boundary so plain Server Component pages (e.g.
 * `page.tsx`) can use it without becoming client components themselves.
 */
export function SmoothScrollLink({
  id,
  className,
  children,
  onNavigate,
}: {
  id: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    smoothScrollToId(id);
    onNavigate?.();
  }

  return (
    <a href={`#${id}`} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
