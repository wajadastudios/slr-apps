// Shared interaction states for buttons in the parent area. Applied on top
// of GlassButton via className (twMerge lets these win), so behaviour and
// markup stay untouched -- this is feedback styling only.
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0] focus-visible:ring-offset-2 focus-visible:ring-offset-white/60";

export const PRIMARY_BUTTON = [
  "!border-[#35C5D0]/60 !bg-[#35C5D0] !text-white duration-200",
  "shadow-[0_4px_14px_rgba(53,197,208,0.35)]",
  "hover:!bg-[#22B8C7] hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(53,197,208,0.45)]",
  "active:!bg-[#1597A3] active:translate-y-0 active:scale-[0.98] active:!brightness-100",
  "disabled:hover:translate-y-0",
  FOCUS,
].join(" ");

export const SECONDARY_BUTTON = [
  "duration-200",
  "hover:!border-[#35C5D0]/70 hover:!bg-[#35C5D0]/15",
  "active:!bg-[#35C5D0]/25 active:scale-[0.98]",
  FOCUS,
].join(" ");

// For plain <button>/<a> elements that don't go through GlassButton.
export const GHOST_BUTTON = [
  "transition-colors duration-200",
  "hover:bg-[#35C5D0]/15 active:bg-[#35C5D0]/25",
  FOCUS,
].join(" ");

// Admin: the main call to action of a screen. A deeper turquoise than the
// parent-area button so white text keeps a readable contrast (about 5:1).
export const ADMIN_CTA = [
  "!border-[#0E7C89]/70 !bg-[#0E7C89] !text-white duration-200",
  "shadow-[0_4px_14px_rgba(14,124,137,0.32)]",
  "hover:!bg-[#0A6570] hover:-translate-y-px",
  "active:!bg-[#084F58] active:translate-y-0 active:scale-[0.98] active:!brightness-100",
  "disabled:hover:translate-y-0",
  FOCUS,
].join(" ");

// Destructive actions look the same everywhere: rose outline that fills on hover.
export const DESTRUCTIVE_BUTTON = [
  "!border-[#D6456B]/50 !bg-[#FFF0F3] !text-[#A3183C] duration-200",
  "hover:!bg-[#D6456B] hover:!text-white",
  "active:scale-[0.98]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6456B] focus-visible:ring-offset-2 focus-visible:ring-offset-white/60",
].join(" ");
