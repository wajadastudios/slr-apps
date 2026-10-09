import { cleanBenefits } from "@/lib/benefits";
import { cn } from "@/lib/utils";

// The one list of package benefits, used by every package card (public prices,
// admin, the parent's renewal picker) and so by every program, present and
// future. The bullet lives in its own fixed column and the text in a flexible
// one, so when a line wraps, the next line lines up with the TEXT, never with
// the bullet. The bullet is drawn, not typed, so it never becomes part of the text.
export function BenefitList({
  items,
  className,
  compact = false,
}: {
  items: readonly unknown[] | null | undefined;
  className?: string;
  // smaller type and tighter lines, for rows inside lists
  compact?: boolean;
}) {
  const lines = cleanBenefits(items);
  if (lines.length === 0) return null;

  return (
    <ul role="list" className={cn("flex flex-col gap-1.5 text-slate-600", compact ? "text-[13px] leading-snug" : "text-sm leading-snug", className)}>
      {lines.map((text, i) => (
        <li key={i} className="grid grid-cols-[0.75rem_minmax(0,1fr)] items-start gap-x-2">
          <span aria-hidden="true" className="mt-[0.5em] h-1.5 w-1.5 justify-self-center rounded-full bg-[#35C5D0]" />
          <span className="min-w-0 break-words">{text}</span>
        </li>
      ))}
    </ul>
  );
}
