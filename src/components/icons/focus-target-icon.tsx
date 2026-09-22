/**
 * Small crosshair/target icon used everywhere "Fokus Latihan" is referenced,
 * so the same visual identity appears on the hero preview card and the
 * #contoh-aplikasi gallery card for both personas. Color/size are controlled
 * by the caller via `className` (stroke uses currentColor).
 */
export function FocusTargetIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.25" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2" />
    </svg>
  );
}
