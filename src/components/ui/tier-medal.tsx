import { useId } from "react";

export type MedalTier = "bronze" | "silver" | "gold";

export const MEDAL_NAME: Record<MedalTier, string> = {
  bronze: "Medali Perunggu",
  silver: "Medali Perak",
  gold: "Medali Emas",
};

// Three medals that differ by colour AND by the rank number stamped on them
// (1 = emas, 2 = perak, 3 = perunggu), so they can be told apart without
// relying on colour, and never fall back to a shared bronze look.
const PALETTE: Record<
  MedalTier,
  { light: string; mid: string; dark: string; ribbon: string; ink: string; rank: string }
> = {
  bronze: { light: "#F6CDA0", mid: "#CD7F32", dark: "#8A4B1B", ribbon: "#A65D2A", ink: "#5E300E", rank: "3" },
  silver: { light: "#FAFCFE", mid: "#C3CBD4", dark: "#8593A1", ribbon: "#6E7C8A", ink: "#3F4B57", rank: "2" },
  gold: { light: "#FFF3B0", mid: "#F5C242", dark: "#C48A00", ribbon: "#D9A000", ink: "#6E4A00", rank: "1" },
};

export function TierMedal({
  tier,
  size = 24,
  decorative = false,
  className,
}: {
  tier: MedalTier;
  size?: number;
  // Set when the medal's name is already written next to it.
  decorative?: boolean;
  className?: string;
}) {
  const c = PALETTE[tier];
  const gradient = `medal-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : MEDAL_NAME[tier]}
      aria-hidden={decorative ? true : undefined}
    >
      <defs>
        <linearGradient id={gradient} x1="6" y1="8" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.light} />
          <stop offset="0.55" stopColor={c.mid} />
          <stop offset="1" stopColor={c.dark} />
        </linearGradient>
      </defs>
      <path d="M9 1.5h6l3 9.5h-6z" fill={c.ribbon} />
      <path d="M23 1.5h-6l-3 9.5h6z" fill={c.ribbon} opacity="0.75" />
      <circle cx="16" cy="20" r="10.5" fill={`url(#${gradient})`} stroke={c.dark} strokeWidth="1" />
      <circle cx="16" cy="20" r="7.6" fill="none" stroke={c.light} strokeOpacity="0.85" strokeWidth="1" />
      <text
        x="16"
        y="24"
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill={c.ink}
      >
        {c.rank}
      </text>
    </svg>
  );
}
