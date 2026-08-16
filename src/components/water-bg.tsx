export function WaterBg({ imageUrl }: { imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-500/40 via-cyan-500/30 to-amber-300/30" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-sky-400 via-cyan-400 to-amber-300 dark:from-sky-900 dark:via-cyan-800 dark:to-amber-700">
      <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-white/30 blur-2xl" />
      <div className="absolute right-10 top-32 h-24 w-24 rounded-full bg-white/20 blur-xl" />
      <div className="absolute left-1/3 top-1/2 h-16 w-16 rounded-full bg-amber-200/40 blur-lg" />
      <div className="absolute bottom-10 right-1/4 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute -bottom-6 left-1/5 h-20 w-20 rounded-full bg-white/25 blur-xl" />
    </div>
  );
}
