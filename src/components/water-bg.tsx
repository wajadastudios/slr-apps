import Image from "next/image";

type Variant = "hero" | "public" | "auth" | "dashboard";

// Each surface gets its own photo/texture so no single image is reused as a
// full-page wallpaper everywhere:
//  hero      landing top only -- pool photo, fades out below the fold
//  public    light water texture behind the rest of the public pages
//  auth      soft blurred poolside behind login / trial forms
//  dashboard the faintest texture; data must stay the dominant layer
export function WaterBg({ variant = "auth" }: { variant?: Variant }) {
  if (variant === "hero") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[125vh] max-h-[1150px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]"
      >
        <Image
          src="/slr-landing-hero-pool.png"
          alt=""
          fill
          priority
          sizes="100vw"
          quality={65}
          className="object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-[#DDF7FA]/45 to-[#EEF9FB]/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-white/70 via-white/30 to-transparent max-lg:hidden" />
        <div className="absolute inset-0 bg-white/30 lg:hidden" />
      </div>
    );
  }

  if (variant === "public") {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <Image
          src="/slr-public-water-texture.png"
          alt=""
          fill
          sizes="100vw"
          quality={55}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#EEF9FB]/82 via-white/72 to-[#FEFCE8]/82" />
      </div>
    );
  }

  if (variant === "dashboard") {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <Image
          src="/slr-dashboard-water-subtle.png"
          alt=""
          fill
          sizes="100vw"
          quality={50}
          className="object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#F3FBFC]/70 via-[#EEF9FB]/62 to-[#FEFCE8]/62" />
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Image
        src="/slr-login-trial-poolside.png"
        alt=""
        fill
        priority
        sizes="100vw"
        quality={60}
        className="scale-110 object-cover blur-[6px]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/45 via-white/30 to-[#DDF7FA]/55" />
    </div>
  );
}
