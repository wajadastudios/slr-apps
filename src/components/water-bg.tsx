export function WaterBg({
  imageUrl,
  videoUrl,
}: {
  imageUrl?: string | null;
  videoUrl?: string | null;
}) {
  if (videoUrl) {
    return (
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <video
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-teal-400/40 via-emerald-200/25 to-amber-200/35" />
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-teal-400/40 via-emerald-200/25 to-amber-200/35" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#DDF7FA] via-[#EEF9FB] to-[#FEFCE8]">
      <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-[#FFC800]/25 blur-3xl" />
      <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[#35C5D0]/25 blur-3xl" />
      <div className="absolute left-1/4 top-1/2 h-40 w-40 rounded-full bg-[#55D6A6]/25 blur-2xl" />
      <div className="absolute -bottom-10 right-1/4 h-32 w-32 rounded-full bg-white/40 blur-2xl" />
    </div>
  );
}
